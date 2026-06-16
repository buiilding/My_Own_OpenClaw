"""
Shell-tool response payload builders.
"""

from pathlib import Path
from typing import Any, Dict, List

from tools.result import ToolResult
from tools.system.shell_output_formatting import format_display_output


def build_background_response(session: Any, warnings: List[str]) -> ToolResult:
    warning_text = f" Warnings: {'; '.join(warnings)}" if warnings else ""
    return ToolResult.success_result(
        {
            "command": session.command,
            "working_directory": session.cwd,
            "status": "running",
            "session_id": session.id,
            "pid": session.process.pid,
            "pty": session.uses_pty,
            "tail": session.tail,
            "warnings": warnings,
            "output": (
                f"Command '{session.command}' is running in the background (session {session.id})."
                " Use the process tool to poll or manage it."
            ),
            "message": f"Command running in background (session {session.id}).{warning_text}",
        }
    )


def _foreground_error_message(data: Dict[str, Any]) -> str:
    for key in ("error", "output", "message"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    exit_code = data.get("exit_code")
    if isinstance(exit_code, int):
        return f"Tool execution failed with exit code {exit_code}"
    return "Tool execution failed"


def build_foreground_response(
    command: str,
    working_dir: Path,
    result: Dict[str, Any],
    warnings: List[str],
) -> ToolResult:
    display_output = format_display_output(result)
    if warnings:
        display_output = f"{display_output}\nWarnings: {'; '.join(warnings)}"
    success = result["exit_code"] == 0 or result["exit_code"] is None
    data = {
        "command": command,
        "working_directory": str(working_dir),
        "output": result["output"],
        "error": result["error"],
        "exit_code": result["exit_code"],
        "execution_time": result["execution_time"],
        "timed_out": result["timed_out"],
        "warnings": warnings,
        "message": display_output,
    }
    if success:
        return ToolResult.success_result(data)
    return ToolResult(success=False, data=data, error=_foreground_error_message(data))
