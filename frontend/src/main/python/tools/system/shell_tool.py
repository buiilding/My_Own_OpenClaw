"""
Shell Tool for Frontend Python Sidecar.

Executes shell commands locally on the user's machine.
Simplified version compared to backend - no persistent shell sessions.
"""
import asyncio
import logging
import os
import platform
import subprocess
import time
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)

# Default timeout for shell commands (seconds)
DEFAULT_SHELL_TIMEOUT = 120.0


class RunShellCommandArgs(BaseModel):
    """Arguments for running a shell command."""
    model_config = ConfigDict(extra='forbid')
    
    command: str = Field(..., description="Exact command to execute")
    directory: Optional[str] = Field(
        None,
        description="(OPTIONAL) The absolute path of the directory to run the command in. If not provided, uses the current working directory. Must be an absolute path and must already exist."
    )
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


class ShellTool(FrontendTool[RunShellCommandArgs]):
    """Tool for executing shell commands locally."""
    
    name = "run_shell_command"
    description = (
        "This tool executes shell commands on the local system. "
        "Commands are executed in the specified directory (or current directory if not specified).\n\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Waits for command completion and returns output. "
        "  Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "  the command is terminated and current output is returned.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "  Does not wait for output or completion.\n\n"
        "Returns: Command output, exit code, execution time, and any errors."
    )
    args_model = RunShellCommandArgs
    
    async def run(self, args: RunShellCommandArgs) -> dict:
        """Execute the shell command."""
        try:
            command = args.command.strip()
            
            if not command:
                return SimpleToolResult.failure("Command cannot be empty").to_dict()
            
            # Determine working directory
            working_dir = args.directory
            if working_dir:
                if not os.path.isabs(working_dir):
                    return SimpleToolResult.failure("Directory must be an absolute path").to_dict()
                
                if not os.path.exists(working_dir) or not os.path.isdir(working_dir):
                    return SimpleToolResult.failure(
                        f"Directory does not exist or is not a directory: {working_dir}"
                    ).to_dict()
            else:
                working_dir = os.getcwd()
            
            # Handle background execution
            if args.run_in_background:
                await self._execute_background_command(command, working_dir)
                return SimpleToolResult.success({
                    "command": command,
                    "working_directory": working_dir,
                    "llm_content": f"Command '{command}' has been executed in the background.",
                    "return_display": f"Command executed in background: {command}"
                }).to_dict()
            
            # Foreground execution
            timeout = args.terminate_after_seconds if args.terminate_after_seconds is not None else DEFAULT_SHELL_TIMEOUT
            result = await self._execute_foreground_command(command, working_dir, timeout)
            
            # Format output for LLM
            llm_content = self._format_llm_output(command, working_dir, result)
            
            # Format display output
            return_display = self._format_display_output(result)
            
            # Determine success based on exit code
            success = result["exit_code"] == 0 if result["exit_code"] is not None else True
            
            return SimpleToolResult.success({
                "command": command,
                "working_directory": working_dir,
                "output": result["output"],
                "error": result["error"],
                "exit_code": result["exit_code"],
                "execution_time": result["execution_time"],
                "llm_content": llm_content,
                "return_display": return_display
            }).to_dict()
            
        except Exception as e:
            logger.error(f"Shell tool execution failed: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to execute command: {str(e)}").to_dict()
    
    async def _execute_background_command(self, command: str, working_dir: str) -> None:
        """Execute a command in the background."""
        try:
            if platform.system() == "Windows":
                # Windows: Use CREATE_NEW_PROCESS_GROUP to detach from parent
                subprocess.Popen(
                    command,
                    shell=True,
                    cwd=working_dir,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            else:
                # Unix: Use nohup-like behavior
                subprocess.Popen(
                    command,
                    shell=True,
                    cwd=working_dir,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True
                )
            logger.info(f"Background command started: {command} in {working_dir}")
        except Exception as e:
            logger.error(f"Failed to start background command: {e}")
            raise
    
    async def _execute_foreground_command(
        self, command: str, working_dir: str, timeout: float
    ) -> dict:
        """Execute a command in the foreground and capture output."""
        start_time = time.time()
        
        try:
            # Determine shell and command format
            if platform.system() == "Windows":
                shell_cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command]
            else:
                shell_cmd = ["bash", "-c", command]
            
            # Execute command with timeout
            loop = asyncio.get_event_loop()
            process = await asyncio.create_subprocess_exec(
                *shell_cmd,
                cwd=working_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout
                )
                exit_code = await process.wait()
                timed_out = False
            except asyncio.TimeoutError:
                # Timeout reached - terminate the process
                process.terminate()
                try:
                    stdout, stderr = await asyncio.wait_for(
                        process.communicate(),
                        timeout=5.0  # Give it 5 seconds to terminate gracefully
                    )
                except asyncio.TimeoutError:
                    # Force kill if it doesn't terminate
                    process.kill()
                    stdout, stderr = await process.communicate()
                
                exit_code = await process.wait()
                timed_out = True
            
            execution_time = time.time() - start_time
            
            # Decode output
            output = stdout.decode("utf-8", errors="replace") if stdout else ""
            error = stderr.decode("utf-8", errors="replace") if stderr else ""
            
            return {
                "output": output,
                "error": error,
                "exit_code": exit_code,
                "execution_time": execution_time,
                "timed_out": timed_out
            }
            
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Command execution error: {e}")
            return {
                "output": "",
                "error": str(e),
                "exit_code": None,
                "execution_time": execution_time,
                "timed_out": False
            }
    
    def _format_llm_output(self, command: str, working_dir: str, result: dict) -> str:
        """Format command output for LLM consumption."""
        parts = [
            f"Command: {command}",
            f"Directory: {working_dir}",
        ]
        
        if result.get("output"):
            parts.append(f"Output:\n{result['output']}")
        
        if result.get("error"):
            parts.append(f"Error:\n{result['error']}")
        
        if result.get("exit_code") is not None:
            parts.append(f"Exit Code: {result['exit_code']}")
        
        if result.get("timed_out"):
            parts.append("Status: Command timed out and was terminated")
        elif result.get("exit_code") == 0:
            parts.append("Status: Success")
        else:
            parts.append("Status: Failed (non-zero exit code)")
        
        parts.append(f"Execution Time: {result.get('execution_time', 0):.2f} seconds")
        
        return "\n".join(parts)
    
    def _format_display_output(self, result: dict) -> str:
        """Format command output for user display."""
        if result.get("timed_out"):
            status = "Command timed out and was terminated"
        elif result.get("exit_code") == 0:
            status = "Command completed successfully"
        elif result.get("exit_code") is not None:
            status = f"Command failed with exit code {result['exit_code']}"
        else:
            status = "Command execution completed"
        
        output_lines = []
        if result.get("output"):
            output_lines.append(f"Output:\n{result['output']}")
        if result.get("error"):
            output_lines.append(f"Error:\n{result['error']}")
        
        output_text = "\n".join(output_lines) if output_lines else "No output"
        
        return f"{status}\n{output_text}"
