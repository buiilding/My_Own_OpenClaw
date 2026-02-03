"""
Shell Tool for the Desktop Assistant (SDK Version).

This module implements shell command execution with safety restrictions,
supporting both PowerShell (Windows) and bash (Unix) with command allowlists.
"""
import asyncio
import logging
import os
import platform
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, ConfigDict

from backend.src.core.security.policy import Permission
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.categorization import ToolDomain
from backend.src.services.shell import get_shell_manager
from backend.src.tools.system_legacy.shell_command_policy import is_command_allowed

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
    async def get_current_working_directory(session_id: str, user_id: str) -> str:
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
            return await session.get_working_directory()
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
                return self._error_result("Command cannot be empty")

            # Validate command safety
            is_allowed, reason = is_command_allowed(command, self.allowlist)
            if not is_allowed:
                return self._error_result(f"Command not allowed: {reason}")

            # Get session and user IDs from context
            session_id = ctx.session.session_id
            user_id = ctx.user.user_id

            # Determine working directory
            working_dir, error_result = self._resolve_working_dir(directory)
            if error_result:
                return error_result

            # Handle background execution
            if args.run_in_background:
                # For background, we still use subprocess directly (simpler)
                await self._execute_background_command(command, working_dir or os.getcwd())
                result = ShellExecutionResult(
                    command=command,
                    output="",
                    error=None,
                    exit_code=None,
                    signal=None,
                    background_pids=[],
                    execution_time=0.0,
                    aborted=False,
                )
                llm_content = f"Command '{command}' has been executed in the background."
                return_display = f"Command executed in background: {command}"
                return self._build_result_payload(
                    command=command,
                    result=result,
                    working_directory=working_dir or os.getcwd(),
                    llm_content=llm_content,
                    return_display=return_display,
                    success=True,
                )

            # Foreground execution using persistent shell
            # Determine timeout
            shell_timeout = args.terminate_after_seconds if args.terminate_after_seconds is not None else DEFAULT_SHELL_TIMEOUT
            config = ctx.services.get("config")
            if config and hasattr(config, "shell_timeout") and args.terminate_after_seconds is None:
                shell_timeout = config.shell_timeout

            # Execute command in persistent shell using new abstraction
            start_time = time.time()
            
            # Get or create shell session
            shell_session = self._shell_manager.get_session(session_id, user_id)
            if not shell_session:
                shell_session = self._shell_manager.create_session(session_id, user_id, working_dir)
            
            # Change directory if needed
            if working_dir and working_dir != await shell_session.get_working_directory():
                await shell_session.change_directory(working_dir)
            
            # Execute command
            shell_result = await shell_session.execute(command, shell_timeout)
            
            execution_time = time.time() - start_time

            # Create result object
            result = ShellExecutionResult(
                command=command,
                output=shell_result.output,
                error=shell_result.error,
                exit_code=shell_result.exit_code,
                signal="TIMEOUT" if shell_result.timed_out else None,
                background_pids=[],
                execution_time=execution_time,
                aborted=shell_result.timed_out
            )

            # Get current working directory from shell state
            final_working_dir = await shell_session.get_working_directory()

            # Format output for LLM
            llm_content = self._format_llm_output(command, final_working_dir, result)

            # Format display output
            return_display = self._format_display_output(result)

            # Determine success
            # Success is defined as either exit_code 0 OR (exit_code None and no error)
            # Some tools might return non-zero exit codes but still be "successful" in execution
            # But for shell commands, non-zero usually means failure.
            # However, the command WAS executed, so the tool ran successfully.
            # We should distinguish between "tool execution success" and "command success".
            # The ToolResult.success indicates if the tool ran without crashing.
            # The command exit code indicates if the command succeeded.
            
            # NOTE: If we set success=False, the orchestrator might treat it as a tool failure.
            # But here we want to return the output even if the command failed (e.g. grep not found).
            # So we should probably set success=True unless the tool itself crashed.
            
            # BUT, the current implementation sets success based on exit_code.
            # Let's relax this: if we have output or an exit code, the tool ran.
            # Only return False if we have an internal error or timeout.
            
            # Legacy logic:
            # success = result.exit_code == 0 and not result.error and not result.aborted
            
            # New logic: always True if we got a result, unless aborted or internal error
            # The exit code is part of the result data.
            success = not result.aborted and (result.exit_code is not None or result.output)
            
            # If we have an explicit error string (e.g. from pexpect exception), then it failed
            if result.error and not result.output and result.exit_code is None:
                success = False

            return self._build_result_payload(
                command=command,
                result=result,
                working_directory=final_working_dir,
                llm_content=llm_content,
                return_display=return_display,
                success=success,
            )

        except Exception as e:
            logger.error(f"Unexpected error in shell tool: {e}", exc_info=True)
            return self._error_result(f"Unexpected error: {str(e)}")

    def _error_result(self, message: str) -> Dict[str, str]:
        return {
            "error": message,
            "llm_content": f"Error: {message}",
        }

    def _resolve_working_dir(
        self, directory: Optional[str]
    ) -> Tuple[Optional[str], Optional[Dict[str, str]]]:
        if not directory:
            return None, None

        if not os.path.isabs(directory):
            return None, self._error_result("Directory must be an absolute path")

        if not os.path.exists(directory) or not os.path.isdir(directory):
            return (
                None,
                self._error_result(
                    f"Directory does not exist or is not a directory: {directory}"
                ),
            )

        return directory, None

    def _build_result_payload(
        self,
        command: str,
        result: ShellExecutionResult,
        working_directory: str,
        llm_content: str,
        return_display: str,
        success: bool,
    ) -> Dict[str, object]:
        return {
            "command": command,
            "exit_code": result.exit_code,
            "background_pids": result.background_pids,
            "execution_time": result.execution_time,
            "working_directory": working_directory,
            "output": result.output,
            "error": result.error,
            "signal": result.signal,
            "llm_content": llm_content,
            "return_display": return_display,
            "success": success,
        }

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
        ]

        if result.error:
            parts.append(f"Error: {result.error}")

        # Only show exit code if it's relevant (non-zero)
        # We hide 0 (success) to reduce noise
        if result.exit_code is not None and result.exit_code != 0:
            parts.append(f"Exit Code: {result.exit_code}")

        if result.signal:
            parts.append(f"Signal: {result.signal}")

        if result.background_pids:
            parts.append(
                f"Background PIDs: {', '.join(map(str, result.background_pids))}"
            )

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
