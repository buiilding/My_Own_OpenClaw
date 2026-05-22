"""
Canonical model-facing projection for tool outputs.

The UI may preserve full tool output for display, but backend history and
rehydration need a bounded payload that is safe to replay to the model.
"""

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


def _string_field(payload: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _display_text(tool_result: ToolResult, data: Dict[str, Any]) -> str:
    return (
        _string_field(data, "display_content", "return_display", "output", "message")
        or tool_result.return_display
        or tool_result.llm_content
        or tool_result.error
        or "Tool executed successfully"
    )


def _model_text(tool_result: ToolResult, data: Dict[str, Any], display: str) -> str:
    return (
        _string_field(data, "model_llm_content", "llm_content", "output", "message")
        or tool_result.llm_content
        or (f"Error: {tool_result.error}" if tool_result.error else None)
        or display
    )


def canonicalize_tool_result_for_model(
    tool_result: ToolResult,
    *,
    token_limit: int = DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT,
    model_id: Optional[str] = None,
) -> ToolResult:
    """Attach explicit display and bounded model-facing content to a tool result."""
    data = _as_dict(tool_result.data)
    display_content = _display_text(tool_result, data)
    raw_model_content = _model_text(tool_result, data, display_content)
    model_content, original_tokens, truncated, token_source = _truncate_for_tokens(
        str(raw_model_content),
        token_limit,
        model_id=model_id,
    )

    canonical_data: Dict[str, Any]
    if data:
        canonical_data = data
    elif tool_result.data is None:
        canonical_data = {}
    else:
        canonical_data = {"value": tool_result.data}

    canonical_data.update(
        {
            "display_content": str(display_content),
            "model_llm_content": model_content,
            "llm_content": model_content,
            "llm_content_original_tokens": original_tokens,
            "llm_content_token_limit": token_limit,
            "llm_content_truncated": truncated,
            "llm_content_token_source": token_source,
        }
    )
    tool_result.data = canonical_data
    tool_result.llm_content = model_content
    tool_result.return_display = str(display_content)
    return tool_result
