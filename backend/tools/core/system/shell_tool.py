"""
Shell Tool for the Desktop Assistant.

This module implements shell command execution with safety restrictions,
supporting both PowerShell (Windows) and bash (Unix) with command allowlists.
"""

import asyncio
import os
import platform
import shlex
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from backend.config import AppConfig
from backend.tools.base import Kind, Tool, ToolContext, ToolResult


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


# Default timeout for shell commands (seconds)
DEFAULT_SHELL_TIMEOUT = 30.0


class ShellTool(Tool):
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

    def __init__(self, config: AppConfig):
        super().__init__(
            name="run_shell_command",
            description=self._get_shell_description(),
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.allowlist: set[str] = set()

    def _get_shell_description(self) -> str:
        """Get the shell description based on platform."""
        base_description = (
            "This tool executes shell commands with safety restrictions. "
            "Most commands are allowed except destructive operations like file deletion, system shutdown, or disk formatting. "
            "Shell state (working directory, environment) persists across commands in the same conversation. "
            "Use cd commands to change directories persistently, then run subsequent commands in that directory. "
        )

        if platform.system() == "Windows":
            return base_description + (
                "Commands are executed as `powershell.exe -NoProfile -Command <command>`. "
                "Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`. "
                "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs, Process Group PGID"
            )
        else:
            return base_description + (
                "Commands are executed as `bash -c <command>`. "
                "Command can start background processes using `&`. "
                "Command is executed as a subprocess that leads its own process group. "
                "Command process group can be terminated as `kill -- -PGID` or signaled as `kill -s SIGNAL -- -PGID`. "
                "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs, Process Group PGID"
            )

    async def execute_async(
        self,
        context: ToolContext,
        command: str,
        directory: Optional[str] = None,
    ) -> ToolResult:
        """Execute the shell tool."""
        try:
            command = command.strip()
            directory = directory

            if not command:
                return ToolResult(
                    success=False,
                    error="Command cannot be empty",
                    llm_content="Error: Command cannot be empty",
                    return_display="Command cannot be empty",
                )

            # Validate command safety
            is_allowed, reason = self._is_command_allowed(command)
            if not is_allowed:
                return ToolResult(
                    success=False,
                    error=f"Command not allowed: {reason}",
                    llm_content=f"Error: Command not allowed: {reason}",
                    return_display="Command not allowed",
                )

            # Determine working directory (priority: explicit directory > conversation state > workspace default)
            if directory:
                # Explicit directory parameter takes precedence
                if not os.path.isabs(directory):
                    return ToolResult(
                        success=False,
                        error="Directory must be an absolute path",
                        llm_content="Error: Directory must be an absolute path",
                        return_display="Directory must be an absolute path",
                    )

                if not os.path.exists(directory) or not os.path.isdir(directory):
                    return ToolResult(
                        success=False,
                        error=f"Directory does not exist or is not a directory: {directory}",
                        llm_content=f"Error: Directory does not exist or is not a directory: {directory}",
                        return_display="Directory does not exist",
                    )

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
                return ToolResult(
                    success=True,
                    data={
                        "command": command,
                        "exit_code": 0,
                        "background_pids": [],
                        "execution_time": 0.0,
                        "working_directory": self.get_current_working_directory(),
                    },
                    llm_content=f"Directory changed: {dir_change_result}",
                    return_display=f"Changed directory: {self.get_current_working_directory()}",
                )

            result = await self._execute_command(command, working_dir)

            # Update command history for successful commands
            self._update_command_history(command, working_dir)

            # Format output for LLM
            llm_content = self._format_llm_output(command, working_dir, result)

            # Format display output
            return_display = self._format_display_output(result)

            # Determine success based on exit code and errors
            success = result.exit_code == 0 and not result.error and not result.aborted

            return ToolResult(
                success=success,
                data={
                    "command": command,
                    "exit_code": result.exit_code,
                    "background_pids": result.background_pids,
                    "execution_time": result.execution_time,
                },
                llm_content=llm_content,
                return_display=return_display,
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )

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

            # Skip allowed tools check - allow any command except destructive ones
            # (Legacy allowed tools check removed for broader command access)

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

    def _is_command_in_allowed_tools(
        self, command: str, allowed_tools: List[str]
    ) -> bool:
        """Check if a command matches any allowed tool pattern."""
        if not allowed_tools:
            return False

        for allowed in allowed_tools:
            # Check for exact match with command name
            if allowed == command:
                return True

            # Check for wildcard match (allow all shell commands)
            if allowed == "run_shell_command":
                return True

        return False

    async def _execute_command(
        self, command: str, working_dir: str
    ) -> ShellExecutionResult:
        """Execute a shell command."""
        start_time = time.time()

        try:
            # Determine shell and command format
            if platform.system() == "Windows":
                shell_cmd = ["powershell.exe", "-NoProfile", "-Command", command]
            else:
                shell_cmd = ["bash", "-c", command]

            # Execute the command
            process = await asyncio.create_subprocess_exec(
                *shell_cmd,
                cwd=working_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                # Create new process group for better control
                preexec_fn=None if platform.system() == "Windows" else os.setsid,
            )

            try:
                # Wait for completion with timeout
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.config.get_shell_timeout() or DEFAULT_SHELL_TIMEOUT,
                )

                output = stdout.decode("utf-8", errors="replace") if stdout else ""
                error_output = (
                    stderr.decode("utf-8", errors="replace") if stderr else ""
                )

                # Get background PIDs (Unix only)
                background_pids = []
                if platform.system() != "Windows":
                    background_pids = await self._get_background_pids(process.pid)

                execution_time = time.time() - start_time

                return ShellExecutionResult(
                    command=command,
                    output=output,
                    error=error_output if error_output else None,
                    exit_code=process.returncode,
                    signal=None,
                    background_pids=background_pids,
                    execution_time=execution_time,
                    aborted=False,
                )

            except asyncio.TimeoutError:
                # Timeout - terminate process
                if platform.system() == "Windows":
                    process.terminate()
                else:
                    # Kill the entire process group
                    try:
                        os.killpg(os.getpgid(process.pid), 15)  # SIGTERM first
                        await asyncio.sleep(0.1)
                        os.killpg(os.getpgid(process.pid), 9)  # SIGKILL if needed
                    except (OSError, ProcessLookupError):
                        pass

                execution_time = time.time() - start_time

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

        except Exception as e:
            execution_time = time.time() - start_time
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
            f"Process Group PGID: {result.pid if hasattr(result, 'pid') and result.pid else '(none)'}",
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
            if (dir_part.startswith("'") and dir_part.endswith("'")) or \
               (dir_part.startswith('"') and dir_part.endswith('"')):
                new_dir = dir_part[1:-1]  # Remove surrounding quotes
            else:
                # Not quoted, take first word (handles simple paths)
                parts = dir_part.split()
                new_dir = parts[0] if parts else dir_part
            
            # Strip any remaining quotes (handles edge cases)
            new_dir = new_dir.strip("'\"")
            
            # Handle relative paths from current working directory
            if not os.path.isabs(new_dir):
                new_dir = os.path.join(
                    self.get_current_working_directory(), new_dir
                )
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

    def get_schema(self) -> Dict[str, Any]:
        """Get the JSON schema for this tool's parameters."""
        command_desc = (
            "powershell.exe -NoProfile -Command <command>"
            if platform.system() == "Windows"
            else "bash -c <command>"
        )

        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": f"Exact command to execute as `{command_desc}`",
                    },
                    "directory": {
                        "type": "string",
                        "description": "(OPTIONAL) The absolute path of the directory to run the command in. If not provided, uses the current persistent working directory from conversation context. Must be an absolute path and must already exist.",
                    },
                },
                "required": ["command"],
            },
        }
