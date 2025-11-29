"""
Shell Tool for the Desktop Assistant (SDK Version).

This module implements shell command execution with safety restrictions,
supporting both PowerShell (Windows) and bash (Unix) with command allowlists.
"""
import asyncio
import logging
import os
import platform
import shlex
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext

logger = logging.getLogger(__name__)

# Default timeout for shell commands (seconds) - fallback if config not available
DEFAULT_SHELL_TIMEOUT = 30.0


@dataclass
class ShellExecutionResult:
    """Result of a shell command execution."""

    command: str
    output: str
    error: Optional[str]
    exit_code: Optional[int]
    signal: Optional[str]
    background_pids: List[int]
    execution_time: float
    aborted: bool


class RunShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    command: str = Field(..., description="Exact command to execute")
    directory: Optional[str] = Field(None, description="(OPTIONAL) The absolute path of the directory to run the command in. If not provided, uses the current persistent working directory from conversation context. Must be an absolute path and must already exist.")


class ShellTool(Tool[RunShellCommandArgs]):
    """Tool for executing shell commands with safety restrictions."""

    # Global shell state shared across all filesystem tools
    _global_shell_state = {
        "working_directory": None,  # Will be initialized on first use
        "environment": {},
        "last_command_time": 0,
        "command_history": [],  # Track recent commands for context
    }

    @classmethod
    def get_current_working_directory(cls):
        """Get the current working directory for all filesystem tools."""
        if cls._global_shell_state["working_directory"] is None:
            # Initialize with the current working directory (same as workspace path)
            cls._global_shell_state["working_directory"] = os.getcwd()
        return cls._global_shell_state["working_directory"]

    @classmethod
    def set_current_working_directory(cls, directory: str):
        """Set the current working directory for all filesystem tools."""
        cls._global_shell_state["working_directory"] = directory

    name = "run_shell_command"
    description = (
        "This tool executes shell commands with safety restrictions. "
        "Most commands are allowed except destructive operations like file deletion, system shutdown, or disk formatting. "
        "Shell state (working directory, environment) persists across commands in the same conversation. "
        "Use cd commands to change directories persistently, then run subsequent commands in that directory. "
    ) + (
        "Commands are executed as `powershell.exe -NoProfile -Command <command>`. "
        "Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`. "
        "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs, Process Group PGID"
        if platform.system() == "Windows"
        else "Commands are executed as `bash -c <command>`. "
        "Command can start background processes using `&`. "
        "Command is executed as a subprocess that leads its own process group. "
        "Command process group can be terminated as `kill -- -PGID` or signaled as `kill -s SIGNAL -- -PGID`. "
        "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs, Process Group PGID"
    )
    args_model = RunShellCommandArgs

    def __init__(self):
        """Initialize the shell tool."""
        self.allowlist: set[str] = set()

    async def run(self, args: RunShellCommandArgs, ctx: ToolContext) -> dict:
        """Execute the shell tool."""
        logger.debug(f"ShellTool.run called with command: '{args.command}', directory: {args.directory}")
        try:
            command = args.command.strip()
            directory = args.directory

            if not command:
                logger.error("SHELL TOOL FAILED: Command cannot be empty")
                return {
                    "error": "Command cannot be empty",
                    "llm_content": "Error: Command cannot be empty"
                }

            # Validate command safety
            is_allowed, reason = self._is_command_allowed(command)
            if not is_allowed:
                return {
                    "error": f"Command not allowed: {reason}",
                    "llm_content": f"Error: Command not allowed: {reason}"
                }

            # Determine working directory (priority: explicit directory > conversation state > workspace default)
            if directory:
                # Explicit directory parameter takes precedence
                if not os.path.isabs(directory):
                    return {
                        "error": "Directory must be an absolute path",
                        "llm_content": "Error: Directory must be an absolute path"
                    }

                if not os.path.exists(directory) or not os.path.isdir(directory):
                    return {
                        "error": f"Directory does not exist or is not a directory: {directory}",
                        "llm_content": f"Error: Directory does not exist or is not a directory: {directory}"
                    }

                working_dir = directory
                # Update persistent working directory for ALL filesystem tools
                self.set_current_working_directory(working_dir)
            else:
                # Use persistent working directory from conversation state
                working_dir = self.get_current_working_directory()

            # Handle directory change commands
            dir_change_result = self._handle_directory_change(command)
            if dir_change_result:
                # This was a directory change command - update state and return
                self._update_command_history(command, working_dir)
                return {
                    "command": command,
                    "exit_code": 0,
                    "background_pids": [],
                    "execution_time": 0.0,
                    "working_directory": self.get_current_working_directory(),
                    "llm_content": f"Directory changed: {dir_change_result}",
                    "return_display": f"Changed directory: {self.get_current_working_directory()}"
                }

            # Get shell timeout from config if available
            shell_timeout = DEFAULT_SHELL_TIMEOUT
            config = ctx.services.get("config")
            if config and hasattr(config, "shell_timeout"):
                shell_timeout = config.shell_timeout

            result = await self._execute_command(command, working_dir, shell_timeout)

            # Update command history for successful commands
            self._update_command_history(command, working_dir)

            # Format output for LLM
            llm_content = self._format_llm_output(command, working_dir, result)

            # Format display output
            return_display = self._format_display_output(result)

            # Determine success based on exit code and errors
            success = result.exit_code == 0 and not result.error and not result.aborted

            return {
                "command": command,
                "exit_code": result.exit_code,
                "background_pids": result.background_pids,
                "execution_time": result.execution_time,
                "working_directory": working_dir,
                "output": result.output,
                "error": result.error,
                "signal": result.signal,
                "llm_content": llm_content,
                "return_display": return_display,
                "success": success
            }

        except Exception as e:
            logger.error(f"Unexpected error in shell tool: {e}", exc_info=True)
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}"
            }

    def _is_command_allowed(self, command: str) -> Tuple[bool, str]:
        """Check if a command is allowed to execute."""
        # Parse command to extract root commands
        root_commands = self._get_command_roots(command)

        if not root_commands:
            return (
                False,
                "Could not identify command root to obtain permission from user",
            )

        # Define destructive commands that are never allowed
        destructive_commands = {
            # File/directory deletion
            "rm",
            "del",
            "delete",
            "erase",
            "rd",
            "rmdir",
            "unlink",
            # Disk operations
            "format",
            "fdisk",
            "mkfs",
            "dd",
            "diskpart",
            # System operations
            "shutdown",
            "reboot",
            "halt",
            "poweroff",
            "init",
            "systemctl",
            # Network destructive
            "iptables",
            "firewall-cmd",
            "ufw",
            # Process killing (except specific safe ones)
            "killall",
            "pkill",
            "kill",
            # Package managers when used destructively (we can't check flags, so be conservative)
            "apt-get",
            "yum",
            "dnf",
            "pacman",
            "brew",
            "choco",
            "scoop",
        }

        for root_cmd in root_commands:
            # Check if command is in allowlist (overrides destructive check)
            if root_cmd in self.allowlist:
                continue

            # Check if command is destructive
            if root_cmd in destructive_commands:
                return (
                    False,
                    f"Command '{root_cmd}' is potentially destructive and not allowed",
                )

        return True, ""

    def _get_command_roots(self, command: str) -> List[str]:
        """Extract root commands from a shell command."""
        try:
            # Parse the command using shell-like parsing
            parts = shlex.split(command)
            if not parts:
                return []

            # For chained commands (&&, ||, ;), split and analyze each part
            roots = []
            for part in self._split_command_chain(command):
                part_parts = shlex.split(part.strip())
                if part_parts:
                    roots.append(part_parts[0])

            return list(set(roots))  # Remove duplicates
        except Exception:
            # Fallback: try to extract first word
            first_word = command.strip().split()[0] if command.strip() else ""
            return [first_word] if first_word else []

    def _split_command_chain(self, command: str) -> List[str]:
        """Split chained commands (&&, ||, ;) into individual commands."""
        # Simple splitting - this could be more sophisticated
        separators = ["&&", "||", ";"]
        parts = [command]

        for sep in separators:
            new_parts = []
            for part in parts:
                new_parts.extend(part.split(sep))
            parts = new_parts

        return [part.strip() for part in parts if part.strip()]

    async def _execute_command(
        self, command: str, working_dir: str, timeout: float
    ) -> ShellExecutionResult:
        """Execute a shell command."""
        start_time = time.time()

        try:
            # Determine shell and command format
            if platform.system() == "Windows":
                # Force UTF-8 encoding for reliable output capture and ensure non-interactive mode
                ps_command = f"$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {command}; if ($?) {{ exit 0 }} else {{ exit 1 }}"
                shell_cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_command]
            else:
                shell_cmd = ["bash", "-c", command]

            # Execute command in thread pool to avoid asyncio subprocess limitations
            loop = asyncio.get_event_loop()

            def run_subprocess():
                try:
                    result = subprocess.run(
                        shell_cmd,
                cwd=working_dir,
                        capture_output=True,
                        timeout=timeout,
                        text=True,
                        encoding='utf-8',
                        errors='replace'
                    )
                    return result.returncode, result.stdout, result.stderr, []
                except subprocess.TimeoutExpired:
                    return None, "", "Command timed out", []

            # Run subprocess in thread pool
            exit_code, output, error_output, background_pids = await loop.run_in_executor(
                None, run_subprocess
            )

            execution_time = time.time() - start_time

            # Handle timeout case
            if exit_code is None:
                return ShellExecutionResult(
                    command=command,
                    output="",
                    error="Command timed out",
                    exit_code=None,
                    signal="TIMEOUT",
                    background_pids=[],
                    execution_time=execution_time,
                    aborted=True,
                )

            return ShellExecutionResult(
                command=command,
                output=output,
                error=error_output if error_output else None,
                exit_code=exit_code,
                signal=None,
                background_pids=background_pids,
                execution_time=execution_time,
                aborted=False,
                )

        except Exception as e:
            execution_time = time.time() - start_time
            logger.debug(f"Exception in _execute_command: {type(e).__name__}: {str(e)}")
            return ShellExecutionResult(
                command=command,
                output="",
                error=str(e),
                exit_code=None,
                signal=None,
                background_pids=[],
                execution_time=execution_time,
                aborted=False,
            )

    async def _get_background_pids(self, parent_pid: int) -> List[int]:
        """Get PIDs of background processes (Unix only)."""
        try:
            # Use pgrep to find child processes
            result = await asyncio.create_subprocess_exec(
                "pgrep",
                "-g",
                str(parent_pid),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )

            stdout, _ = await result.communicate()
            if result.returncode == 0 and stdout:
                pids = []
                for line in stdout.decode().strip().split("\n"):
                    try:
                        pid = int(line.strip())
                        if pid != parent_pid:  # Exclude the parent process
                            pids.append(pid)
                    except ValueError:
                        continue
                return pids
        except (OSError, asyncio.TimeoutError):
            pass

        return []

    def _format_llm_output(
        self, command: str, directory: str, result: ShellExecutionResult
    ) -> str:
        """Format execution result for LLM consumption."""
        parts = [
            f"Command: {command}",
            f"Directory: {directory}",
            f"Output: {result.output or '(empty)'}",
            f"Error: {result.error or '(none)'}",
            f"Exit Code: {result.exit_code if result.exit_code is not None else '(none)'}",
            f"Signal: {result.signal or '(none)'}",
            f"Background PIDs: {', '.join(map(str, result.background_pids)) if result.background_pids else '(none)'}",
        ]

        return "\n".join(parts)

    def _format_display_output(self, result: ShellExecutionResult) -> str:
        """Format execution result for user display."""
        if result.aborted:
            return "Command cancelled by user."
        elif result.signal:
            return f"Command terminated by signal: {result.signal}"
        elif result.error and result.exit_code != 0:
            return f"Command failed: {result.error}"
        elif result.exit_code is not None and result.exit_code != 0:
            return f"Command exited with code: {result.exit_code}"
        elif result.output.strip():
            return result.output.strip()
        else:
            # Command succeeded but no output
            return "Command executed successfully"

    def _handle_directory_change(self, command: str) -> Optional[str]:
        """Handle cd commands and update global shell directory."""
        if command.startswith("cd ") or command.strip() == "cd":
            # Extract directory from cd command, handling quoted paths
            cmd_stripped = command.strip()
            if cmd_stripped == "cd":
                # cd with no args goes to home
                home_dir = os.path.expanduser("~")
                self.set_current_working_directory(home_dir)
                return f"Changed directory to {home_dir}"

            # Remove "cd " prefix
            dir_part = cmd_stripped[3:].strip()

            # Handle quoted paths (both single and double quotes)
            if (dir_part.startswith("'") and dir_part.endswith("'")) or (
                dir_part.startswith('"') and dir_part.endswith('"')
            ):
                new_dir = dir_part[1:-1]  # Remove surrounding quotes
            else:
                # Not quoted, take first word (handles simple paths)
                parts = dir_part.split()
                new_dir = parts[0] if parts else dir_part

            # Strip any remaining quotes (handles edge cases)
            new_dir = new_dir.strip("'\"")

            # Handle relative paths from current working directory
            if not os.path.isabs(new_dir):
                new_dir = os.path.join(self.get_current_working_directory(), new_dir)
            new_dir = os.path.abspath(new_dir)

            if os.path.exists(new_dir) and os.path.isdir(new_dir):
                self.set_current_working_directory(new_dir)
                return f"Changed directory to {new_dir}"
            else:
                return f"Directory does not exist: {new_dir}"

        return None

    def _update_command_history(self, command: str, working_dir: str):
        """Update the command history for context awareness."""
        self._global_shell_state["command_history"].append(
            {
                "command": command,
                "working_directory": working_dir,
                "timestamp": time.time(),
            }
        )

        # Keep only last 50 commands to avoid memory bloat
        if len(self._global_shell_state["command_history"]) > 50:
            self._global_shell_state["command_history"] = self._global_shell_state[
                "command_history"
            ][-50:]

        self._global_shell_state["last_command_time"] = time.time()
