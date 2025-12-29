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

from backend.src.core.security.policy import Permission
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.categorization import ToolDomain
from backend.src.services.persistent_shell_manager import get_shell_manager

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
    run_in_background: bool = Field(
        ...,
        description="If True, run the command in the background without waiting for output. Returns immediately with execution confirmation. If False, wait for command completion and return output."
    )
    terminate_after_seconds: Optional[float] = Field(
        120.0,
        description="(OPTIONAL, only used when run_in_background=False) Maximum time in seconds to wait before terminating the command and returning current output. Default is 120 seconds (2 minutes). Set to None for no timeout limit."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class ShellTool(Tool[RunShellCommandArgs]):
    """Tool for executing shell commands with safety restrictions and persistent shell state."""

    def __init__(self):
        """Initialize the shell tool."""
        super().__init__()
        self.allowlist: set[str] = set()
        self._shell_manager = get_shell_manager()

    @staticmethod
    def get_current_working_directory(session_id: str, user_id: str) -> str:
        """
        Get the current working directory for a shell session.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            
        Returns:
            Current working directory path, or os.getcwd() if session doesn't exist
        """
        shell_manager = get_shell_manager()
        session = shell_manager.get_session(session_id, user_id)
        if session:
            return session.working_dir
        return os.getcwd()


    name = "run_shell_command"
    required_permissions = {Permission.EXECUTE_COMMANDS}
    category = ToolDomain.SYSTEM
    description = (
        "This tool executes shell commands with safety restrictions and maintains a persistent shell session. "
        "Each conversation session has its own persistent shell that maintains:\n"
        "- Working directory (persists across commands, use 'cd' to change)\n"
        "- Environment variables (set with 'export VAR=value' or 'set VAR=value')\n"
        "- Conda environment (activate with 'conda activate <env>')\n"
        "- Command history\n"
        "\n"
        "Most commands are allowed except destructive operations like file deletion, system shutdown, or disk formatting. "
        "Shell state persists across all commands in the same conversation session, just like a real terminal.\n"
        "\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Waits for command completion and returns output. "
        "  Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "  the command is terminated and current output is returned.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "  Does not wait for output or completion.\n\n"
    ) + (
        "Commands are executed in a persistent PowerShell session with accumulated environment variables. "
        "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs"
        if platform.system() == "Windows"
        else "Commands are executed in a persistent bash session with accumulated environment variables. "
        "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs"
    )
    args_model = RunShellCommandArgs

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

            # Get session and user IDs from context
            session_id = ctx.session.session_id
            user_id = ctx.user.user_id

            # Determine working directory
            working_dir = None
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

            # Handle background execution
            if args.run_in_background:
                # For background, we still use subprocess directly (simpler)
                await self._execute_background_command(command, working_dir or os.getcwd())
                return {
                    "command": command,
                    "exit_code": None,
                    "background_pids": [],
                    "execution_time": 0.0,
                    "working_directory": working_dir or os.getcwd(),
                    "output": "",
                    "error": None,
                    "signal": None,
                    "llm_content": f"Command '{command}' has been executed in the background.",
                    "return_display": f"Command executed in background: {command}",
                    "success": True
                }

            # Foreground execution using persistent shell
            # Determine timeout
            shell_timeout = args.terminate_after_seconds if args.terminate_after_seconds is not None else DEFAULT_SHELL_TIMEOUT
            config = ctx.services.get("config")
            if config and hasattr(config, "shell_timeout") and args.terminate_after_seconds is None:
                shell_timeout = config.shell_timeout

            # Execute command in persistent shell
            start_time = time.time()
            
            # Run in executor because PTY operations are blocking
            loop = asyncio.get_event_loop()
            stdout, stderr, exit_code, timed_out = await loop.run_in_executor(
                None,
                self._shell_manager.execute_command,
                session_id,
                user_id,
                command,
                shell_timeout,
                working_dir
            )
            
            execution_time = time.time() - start_time

            # Create result object
            result = ShellExecutionResult(
                command=command,
                output=stdout,
                error=stderr if stderr else None,
                exit_code=exit_code,
                signal="TIMEOUT" if timed_out else None,
                background_pids=[],
                execution_time=execution_time,
                aborted=timed_out
            )

            # Get current working directory from shell state
            shell_session = self._shell_manager.get_session(session_id, user_id)
            final_working_dir = shell_session.working_dir if shell_session else (working_dir or os.getcwd())

            # Format output for LLM
            llm_content = self._format_llm_output(command, final_working_dir, result)

            # Format display output
            return_display = self._format_display_output(result)

            # Determine success
            success = result.exit_code == 0 and not result.error and not result.aborted

            return {
                "command": command,
                "exit_code": result.exit_code,
                "background_pids": result.background_pids,
                "execution_time": result.execution_time,
                "working_directory": final_working_dir,
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
        """Execute a shell command with timeout support and output capture."""
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

            def run_subprocess_with_timeout():
                """Run subprocess with timeout, capturing output before termination."""
                process = None
                try:
                    # Use Popen to have control over the process and capture output
                    process = subprocess.Popen(
                        shell_cmd,
                        cwd=working_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding='utf-8',
                        errors='replace',
                        bufsize=1  # Line buffered for better real-time output
                    )

                    # Wait for process with timeout
                    try:
                        stdout, stderr = process.communicate(timeout=timeout)
                        exit_code = process.returncode
                        return exit_code, stdout, stderr, []
                    except subprocess.TimeoutExpired:
                        # Timeout occurred - terminate process
                        logger.info(f"Command '{command}' timed out after {timeout} seconds, terminating...")
                        
                        # Terminate the process gracefully first
                        process.terminate()
                        try:
                            # Try to get any remaining output during graceful shutdown
                            stdout, stderr = process.communicate(timeout=2)
                        except subprocess.TimeoutExpired:
                            # Force kill if it doesn't terminate gracefully
                            process.kill()
                            stdout, stderr = process.communicate()
                        
                        # Return timeout result with any captured output
                        timeout_msg = f"Command timed out after {timeout} seconds and was terminated"
                        return None, stdout if stdout else "", stderr if stderr else timeout_msg, []
                        
                except Exception as e:
                    if process:
                        try:
                            process.terminate()
                            process.wait(timeout=2)
                        except:
                            try:
                                process.kill()
                            except:
                                pass
                    raise e

            # Run subprocess in thread pool
            exit_code, output, error_output, background_pids = await loop.run_in_executor(
                None, run_subprocess_with_timeout
            )

            execution_time = time.time() - start_time

            # Handle timeout case
            if exit_code is None:
                return ShellExecutionResult(
                    command=command,
                    output=output if output else "",
                    error=error_output if error_output else f"Command timed out after {timeout} seconds",
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

    async def _execute_background_command(self, command: str, working_dir: str):
        """Execute a command in the background without waiting for output."""
        try:
            # Determine shell and command format
            if platform.system() == "Windows":
                # For Windows, use Start-Process to run in background
                ps_command = f"Start-Process -NoNewWindow -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-Command','{command}'"
                shell_cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_command]
            else:
                # For Unix, append & to run in background
                shell_cmd = ["bash", "-c", f"{command} &"]

            # Execute command without waiting
            loop = asyncio.get_event_loop()

            def start_background_process():
                try:
                    # Use Popen to start process without waiting
                    process = subprocess.Popen(
                        shell_cmd,
                        cwd=working_dir,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        stdin=subprocess.DEVNULL,
                    )
                    return process.pid
                except Exception as e:
                    logger.error(f"Failed to start background command: {e}")
                    return None

            # Start process in thread pool
            pid = await loop.run_in_executor(None, start_background_process)
            
            if pid:
                logger.info(f"Started background command '{command}' with PID {pid}")
            else:
                logger.warning(f"Failed to start background command '{command}'")

        except Exception as e:
            logger.error(f"Exception starting background command: {e}", exc_info=True)

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

