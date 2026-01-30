"""
Shell Tool - Python implementation using subprocess.
"""

import asyncio
import logging
import platform
import subprocess
import time
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)

DEFAULT_SHELL_TIMEOUT = 120.0
IS_WINDOWS = platform.system() == "Windows"


async def run_shell_command(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute shell command.
    
    Args:
        args: Dictionary with 'command', 'directory', 'run_in_background', 'terminate_after_seconds'
        
    Returns:
        Dictionary with success status and command result
    """
    command = args.get("command", "").strip()
    directory = args.get("directory")
    run_in_background = args.get("run_in_background", False)
    terminate_after_seconds = args.get("terminate_after_seconds")
    
    if not command:
        return {"success": False, "error": "Command cannot be empty"}
    
    try:
        # Determine working directory
        working_dir = directory
        if working_dir:
            working_path = Path(working_dir)
            if not working_path.is_absolute():
                return {"success": False, "error": "Directory must be an absolute path"}
            if not working_path.exists() or not working_path.is_dir():
                return {"success": False, "error": f"Directory does not exist or is not a directory: {working_dir}"}
        else:
            working_dir = Path.cwd()
        
        # Handle background execution
        if run_in_background:
            await _execute_background_command(command, working_dir)
            return {
                "success": True,
                "data": {
                    "command": command,
                    "working_directory": str(working_dir),
                    "llm_content": f"Command '{command}' has been executed in the background.",
                    "return_display": f"Command executed in background: {command}",
                },
            }
        
        # Foreground execution
        timeout = terminate_after_seconds if terminate_after_seconds is not None else DEFAULT_SHELL_TIMEOUT
        result = await _execute_foreground_command(command, working_dir, timeout)
        
        llm_content = _format_llm_output(command, working_dir, result)
        return_display = _format_display_output(result)
        success = result["exit_code"] == 0 or result["exit_code"] is None
        
        return {
            "success": success,
            "data": {
                "command": command,
                "working_directory": str(working_dir),
                "output": result["output"],
                "error": result["error"],
                "exit_code": result["exit_code"],
                "execution_time": result["execution_time"],
                "llm_content": llm_content,
                "return_display": return_display,
            },
        }
    except Exception as e:
        logger.error(f"Error executing shell command: {e}", exc_info=True)
        return {"success": False, "error": f"Failed to execute command: {str(e)}"}


async def _execute_background_command(command: str, working_dir: Path) -> None:
    """Execute command in background."""
    if IS_WINDOWS:
        # Windows: use CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(
            command,
            shell=True,
            cwd=working_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            start_new_session=True,
        )
    else:
        # Unix-like: use detached process
        subprocess.Popen(
            command,
            shell=True,
            cwd=working_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )


async def _execute_foreground_command(command: str, working_dir: Path, timeout: float) -> Dict[str, Any]:
    """Execute command in foreground with timeout."""
    start_time = time.time()
    
    # Determine shell command
    if IS_WINDOWS:
        shell_cmd = "powershell.exe"
        shell_args = ["-NoProfile", "-NonInteractive", "-Command", command]
    else:
        shell_cmd = "bash"
        shell_args = ["-c", command]
    
    try:
        process = await asyncio.create_subprocess_exec(
            shell_cmd,
            *shell_args,
            cwd=working_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            exit_code = process.returncode
            timed_out = False
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            stdout = b""
            stderr = b"Command timed out and was terminated".encode()
            exit_code = None
            timed_out = True
        
        execution_time = time.time() - start_time
        
        return {
            "output": stdout.decode("utf-8", errors="replace"),
            "error": stderr.decode("utf-8", errors="replace"),
            "exit_code": exit_code,
            "execution_time": execution_time,
            "timed_out": timed_out,
        }
    except Exception as e:
        execution_time = time.time() - start_time
        return {
            "output": "",
            "error": str(e),
            "exit_code": None,
            "execution_time": execution_time,
            "timed_out": False,
        }


def _format_llm_output(command: str, working_dir: Path, result: Dict[str, Any]) -> str:
    """Format output for LLM."""
    parts = [
        f"Command: {command}",
        f"Directory: {working_dir}",
    ]
    
    if result["output"]:
        parts.append(f"Output:\n{result['output']}")
    
    if result["error"]:
        parts.append(f"Error:\n{result['error']}")
    
    if result["exit_code"] is not None:
        parts.append(f"Exit Code: {result['exit_code']}")
    
    if result["timed_out"]:
        parts.append("Status: Command timed out and was terminated")
    elif result["exit_code"] == 0:
        parts.append("Status: Success")
    else:
        parts.append("Status: Failed (non-zero exit code)")
    
    parts.append(f"Execution Time: {result['execution_time']:.2f} seconds")
    
    return "\n".join(parts)


def _format_display_output(result: Dict[str, Any]) -> str:
    """Format output for display."""
    if result["timed_out"]:
        status = "Command timed out and was terminated"
    elif result["exit_code"] == 0:
        status = "Command completed successfully"
    elif result["exit_code"] is not None:
        status = f"Command failed with exit code {result['exit_code']}"
    else:
        status = "Command execution completed"
    
    output_lines = []
    if result["output"]:
        output_lines.append(f"Output:\n{result['output']}")
    if result["error"]:
        output_lines.append(f"Error:\n{result['error']}")
    
    output_text = "\n".join(output_lines) if output_lines else "No output"
    
    return f"{status}\n{output_text}"
