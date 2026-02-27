"""
Shared shell-tool output formatting and token-budget helpers.
"""

from pathlib import Path
from typing import Any, Dict, Optional, Tuple

DEFAULT_MAX_OUTPUT_TOKENS = 10_000
APPROX_BYTES_PER_TOKEN = 4


def _approx_token_count(text: str) -> int:
    if not text:
        return 0
    return (len(text) + (APPROX_BYTES_PER_TOKEN - 1)) // APPROX_BYTES_PER_TOKEN


def _truncate_text_for_tokens(content: str, max_tokens: int) -> Tuple[str, bool, int]:
    """Truncate content with a head+tail marker using an approximate token budget."""
    original_tokens = _approx_token_count(content)
    max_chars = max_tokens * APPROX_BYTES_PER_TOKEN

    if len(content) <= max_chars:
        return content, False, original_tokens

    if max_chars <= 0:
        return f"…{original_tokens} tokens truncated…", True, original_tokens

    left_budget = max_chars // 2
    right_budget = max_chars - left_budget
    prefix = content[:left_budget]
    suffix = content[-right_budget:] if right_budget > 0 else ""
    removed_chars = max(0, len(content) - max_chars)
    removed_tokens = (removed_chars + (APPROX_BYTES_PER_TOKEN - 1)) // APPROX_BYTES_PER_TOKEN
    total_lines = len(content.splitlines())
    truncated = f"{prefix}…{removed_tokens} tokens truncated…{suffix}"
    return f"Total output lines: {total_lines}\n\n{truncated}", True, original_tokens


def resolve_max_output_tokens(raw_value: Any) -> Tuple[Optional[int], Optional[str]]:
    if raw_value is None:
        return DEFAULT_MAX_OUTPUT_TOKENS, None
    if isinstance(raw_value, bool) or not isinstance(raw_value, int):
        return None, "max_output_tokens must be an integer"
    if raw_value <= 0:
        return None, "max_output_tokens must be greater than zero"
    return raw_value, None


def format_llm_output(
    command: str,
    working_dir: Path,
    result: Dict[str, Any],
    max_output_tokens: int,
) -> Tuple[str, bool, int]:
    """Format shell result for the model-facing `llm_content` field."""
    parts = [
        f"Command: {command}",
        f"Directory: {working_dir}",
    ]

    output_sections = []
    if result["output"]:
        output_sections.append(f"Output:\n{result['output']}")
    if result["error"]:
        output_sections.append(f"Error:\n{result['error']}")

    output_block = "\n\n".join(output_sections)
    truncated = False
    original_output_tokens = 0
    if output_block:
        output_block, truncated, original_output_tokens = _truncate_text_for_tokens(
            output_block,
            max_output_tokens,
        )
        parts.append(output_block)

    if result["exit_code"] is not None:
        parts.append(f"Exit Code: {result['exit_code']}")

    if result["timed_out"]:
        parts.append("Status: Command timed out and was terminated")
    elif result["exit_code"] == 0:
        parts.append("Status: Success")
    else:
        parts.append("Status: Failed (non-zero exit code)")

    parts.append(f"Execution Time: {result['execution_time']:.2f} seconds")
    if truncated:
        parts.append(f"Original output token count: {original_output_tokens}")

    return "\n".join(parts), truncated, original_output_tokens


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

