"""Model-facing truncation for raw tool output."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.services.token_service import get_token_service

DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT = 10_000
CHARS_PER_TOKEN_APPROX = 4


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, (len(text) + CHARS_PER_TOKEN_APPROX - 1) // CHARS_PER_TOKEN_APPROX)


def _truncate_for_tokens(
    text: str,
    token_limit: int,
    *,
    model_id: Optional[str] = None,
) -> tuple[str, int, bool, str]:
    marker = (
        "\n\n...[tool output truncated: original token count calculated below, "
        f"limit {token_limit} tokens]...\n\n"
    )
    if model_id:
        (
            model_content,
            original_tokens,
            truncated,
            token_source,
        ) = get_token_service().truncate_text(
            text,
            model=model_id,
            token_limit=token_limit,
            marker=marker,
        )
        if truncated:
            marker = (
                f"\n\n...[tool output truncated: original {original_tokens} tokens, "
                f"limit {token_limit} tokens]...\n\n"
            )
            (
                model_content,
                original_tokens,
                truncated,
                token_source,
            ) = get_token_service().truncate_text(
                text,
                model=model_id,
                token_limit=token_limit,
                marker=marker,
            )
        return model_content, original_tokens, truncated, token_source

    original_tokens = _estimate_tokens(text)
    if original_tokens <= token_limit:
        return text, original_tokens, False, "estimate"
    marker = (
        f"\n\n...[tool output truncated: original ~{original_tokens} tokens, "
        f"limit {token_limit} tokens]...\n\n"
    )

    char_limit = max(token_limit * CHARS_PER_TOKEN_APPROX, 1)
    if char_limit <= len(marker) + 2:
        return text[:char_limit], original_tokens, True, "estimate"

    available = char_limit - len(marker)
    head = max(available // 2, 1)
    tail = max(available - head, 1)
    return f"{text[:head]}{marker}{text[-tail:]}", original_tokens, True, "estimate"


def _as_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _raw_text_field(payload: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        if key in payload:
            value = payload.get(key)
            return "" if value is None else str(value)
    return None


def raw_tool_output_text(tool_result: ToolResult) -> str:
    """Return the raw local tool output text without adding display/model fields."""
    data = _as_dict(tool_result.data)
    if "output" in data:
        return _raw_text_field(data, "output") or ""
    message = _raw_text_field(data, "message")
    if message is not None:
        return message
    return (
        tool_result.llm_content
        or (f"Error: {tool_result.error}" if tool_result.error else None)
        or (str(tool_result.data) if tool_result.data is not None else None)
        or "Tool executed successfully"
    )


def truncate_tool_output_for_model(
    tool_result: ToolResult,
    *,
    token_limit: int = DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT,
    model_id: Optional[str] = None,
) -> str:
    """Return raw tool output truncated for model history without mutating data."""
    model_content, _original_tokens, _truncated, _token_source = _truncate_for_tokens(
        raw_tool_output_text(tool_result),
        token_limit,
        model_id=model_id,
    )
    return model_content
