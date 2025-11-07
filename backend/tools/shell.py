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


class ShellTool(Tool):
    """Tool for executing shell commands with safety restrictions."""

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
        if platform.system() == "Windows":
            return (
                "This tool executes a given shell command as `powershell.exe -NoProfile -Command <command>`. "
                "Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`. "
                "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs, Process Group PGID"
            )
        else:
            return (
                "This tool executes a given shell command as `bash -c <command>`. "
                "Command can start background processes using `&`. "
                "Command is executed as a subprocess that leads its own process group. "
                "Command process group can be terminated as `kill -- -PGID` or signaled as `kill -s SIGNAL -- -PGID`. "
                "The following information is returned: Command, Directory, Stdout, Stderr, Error, Exit Code, Signal, Background PIDs, Process Group PGID"
            )

    async def execute_async(
        self,
        context: ToolContext,
        command: str,
        description: Optional[str] = None,
        directory: Optional[str] = None,
    ) -> ToolResult:
        """Execute the shell tool."""
        try:
            command = command.strip()
            # description parameter is for user-facing display but not used in execution
            description = description  # Keep for compatibility
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

            # Validate directory if provided
            if directory:
                if not os.path.isabs(directory):
                    return ToolResult(
                        success=False,
                        error="Directory must be an absolute path",
                        llm_content="Error: Directory must be an absolute path",
                        return_display="Directory must be an absolute path",
                    )

                workspace_context = self.config.get_workspace_context()
                if not workspace_context.is_path_within_workspace(directory):
                    return ToolResult(
                        success=False,
                        error=f"Directory not within workspace: {directory}",
                        llm_content=f"Error: Directory not within workspace: {directory}",
                        return_display="Directory not within workspace",
                    )

                if not os.path.exists(directory) or not os.path.isdir(directory):
                    return ToolResult(
                        success=False,
                        error=f"Directory does not exist or is not a directory: {directory}",
                        llm_content=f"Error: Directory does not exist or is not a directory: {directory}",
                        return_display="Directory does not exist",
                    )

            # Execute the command
            working_dir = directory or self.config.get_workspace_context().workspace_path
            result = await self._execute_command(command, working_dir)

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

        # Check if any root command is allowed
        allowed_tools = self.config.get_allowed_tools() or []

        for root_cmd in root_commands:
            # Check if command is in allowlist
            if root_cmd in self.allowlist:
                continue

            # Check against allowed tools configuration
            is_allowed = self._is_command_in_allowed_tools(root_cmd, allowed_tools)
            if not is_allowed:
                return (
                    False,
                    f"Command '{root_cmd}' is not in the list of allowed tools",
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

    def _is_command_in_allowed_tools(
        self, command: str, allowed_tools: List[str]
    ) -> bool:
        """Check if a command matches any allowed tool pattern."""
        if not allowed_tools:
            return False

        for allowed in allowed_tools:
            # Check for exact match
            if allowed == f"run_shell_command({command})":
                return True

            # Check for wildcard match
            if allowed == "run_shell_command":
                return True

            # Check for prefix match (e.g., "run_shell_command(git)" allows "git status")
            if allowed == f"run_shell_command({command})":
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
                    timeout=self.config.get_shell_timeout() or 30.0,
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
                    "description": {
                        "type": "string",
                        "description": "Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.",
                    },
                    "directory": {
                        "type": "string",
                        "description": "(OPTIONAL) The absolute path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.",
                    },
                },
                "required": ["command"],
            },
        }
