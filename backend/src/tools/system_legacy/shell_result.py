"""
Shell execution result models and formatters.
"""

from dataclasses import dataclass
from typing import List, Optional


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


def format_llm_output(command: str, directory: str, result: ShellExecutionResult) -> str:
    """Format execution result for LLM consumption."""
    parts = [
        f"Command: {command}",
        f"Directory: {directory}",
        f"Output: {result.output or '(empty)'}",
    ]

    if result.error:
        parts.append(f"Error: {result.error}")

    if result.exit_code is not None and result.exit_code != 0:
        parts.append(f"Exit Code: {result.exit_code}")

    if result.signal:
        parts.append(f"Signal: {result.signal}")

    if result.background_pids:
        parts.append(
            f"Background PIDs: {', '.join(map(str, result.background_pids))}"
        )

    return "\n".join(parts)


def format_display_output(result: ShellExecutionResult) -> str:
    """Format execution result for user display."""
    if result.aborted:
        return "Command cancelled by user."
    if result.signal:
        return f"Command terminated by signal: {result.signal}"
    if result.error and result.exit_code != 0:
        return f"Command failed: {result.error}"
    if result.exit_code is not None and result.exit_code != 0:
        return f"Command exited with code: {result.exit_code}"
    if result.output.strip():
        return result.output.strip()
    return "Command executed successfully"
