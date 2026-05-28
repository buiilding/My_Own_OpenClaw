"""Shared shell-tool output formatting helpers."""

from typing import Any, Dict


def format_display_output(result: Dict[str, Any]) -> str:
    """Format shell result for user-facing short status display."""
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
