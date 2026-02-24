"""Token counting helpers for LLM stream processing."""

from __future__ import annotations

from typing import Any, NamedTuple, Optional

from backend.src.core.types.schemas import LLMMessage


class TokenCounts(NamedTuple):
    """Token count information."""

    prompt_tokens: int
    visible_output_tokens: int
    thinking_tokens: Optional[int]
    output_tokens_total: int
    total_tokens: int
    conversation_tokens: int
    usage_source: str
    cached_tokens: Optional[int]
    cache_hit: Optional[bool]
    cache_status: Optional[str]


def count_tokens(
    *,
    token_service: Any,
    llm_client: Any,
    conversation_history: Any,
    model_id: str,
    prompt: list[LLMMessage],
    full_text: str,
) -> TokenCounts:
    """
    Count prompt/output/conversation tokens for one LLM response payload.

    Returns provider-reported counts when available, then falls back to local estimates.
    """
    estimated_prompt_tokens = token_service.count_tokens(prompt, model_id)

    output_message: LLMMessage = {
        "role": "assistant",
        "content": full_text,
    }
    visible_output_tokens = token_service.count_tokens([output_message], model_id)
    conversation_tokens = conversation_history.get_token_count(model_id)

    diagnostics = llm_client.get_last_stream_cache_diagnostics() or {}
    provider_prompt_tokens = _safe_int(diagnostics.get("prompt_tokens"))
    provider_output_tokens = _safe_int(diagnostics.get("completion_tokens"))
    provider_total_tokens = _safe_int(diagnostics.get("total_tokens"))
    thinking_tokens = _safe_int(diagnostics.get("thinking_tokens"))
    cached_tokens = _safe_int(diagnostics.get("cached_tokens"))
    cache_hit = _safe_bool(diagnostics.get("cache_hit"))
    cache_status = diagnostics.get("status")
    if not isinstance(cache_status, str):
        cache_status = None

    prompt_tokens = (
        provider_prompt_tokens
        if provider_prompt_tokens is not None
        else estimated_prompt_tokens
    )
    output_tokens_total = (
        provider_output_tokens
        if provider_output_tokens is not None
        else visible_output_tokens + (thinking_tokens or 0)
    )
    total_tokens = (
        provider_total_tokens
        if provider_total_tokens is not None
        else prompt_tokens + output_tokens_total
    )
    usage_source = (
        "provider"
        if (
            provider_prompt_tokens is not None
            and provider_output_tokens is not None
            and provider_total_tokens is not None
        )
        else "estimated"
    )

    return TokenCounts(
        prompt_tokens=prompt_tokens,
        visible_output_tokens=visible_output_tokens,
        thinking_tokens=thinking_tokens,
        output_tokens_total=output_tokens_total,
        total_tokens=total_tokens,
        conversation_tokens=conversation_tokens,
        usage_source=usage_source,
        cached_tokens=cached_tokens,
        cache_hit=cache_hit,
        cache_status=cache_status,
    )


def _safe_int(value: Any) -> Optional[int]:
    """Parse positive integer-ish values from provider diagnostics."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None


def _safe_bool(value: Any) -> Optional[bool]:
    """Parse bool-ish values from provider diagnostics."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
    return None

