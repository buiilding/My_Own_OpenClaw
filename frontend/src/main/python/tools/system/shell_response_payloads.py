"""
Shell-tool response payload builders.
"""

from pathlib import Path
from typing import Any, Dict, List

from tools.system.shell_output_formatting import format_display_output, format_llm_output


def build_background_response(session: Any, warnings: List[str]) -> Dict[str, Any]:
    warning_text = f" Warnings: {'; '.join(warnings)}" if warnings else ""
    return {
        "success": True,
        "data": {
            "command": session.command,
            "working_directory": session.cwd,
            "status": "running",
            "session_id": session.id,
            "pid": session.process.pid,
            "pty": session.uses_pty,
            "tail": session.tail,
            "warnings": warnings,
            "llm_content": (
                f"Command '{session.command}' is running in the background (session {session.id})."
                " Use the process tool to poll or manage it."
            ),
            "return_display": f"Command running in background (session {session.id}).{warning_text}",
        },
    }


def build_foreground_response(
    command: str,
    working_dir: Path,
    result: Dict[str, Any],
    warnings: List[str],
    max_output_tokens: int,
) -> Dict[str, Any]:
    llm_content, output_truncated, original_output_tokens = format_llm_output(
        command,
        working_dir,
        result,
        max_output_tokens,
    )
    return_display = format_display_output(result)
    if warnings:
        return_display = f"{return_display}\nWarnings: {'; '.join(warnings)}"
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
            "timed_out": result["timed_out"],
            "warnings": warnings,
            "output_token_limit": max_output_tokens,
            "original_output_tokens": original_output_tokens,
            "output_truncated": output_truncated,
            "llm_content": llm_content,
            "return_display": return_display,
        },
    }

