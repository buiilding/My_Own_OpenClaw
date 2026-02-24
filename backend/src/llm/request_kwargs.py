"""Shared helpers for building LLM provider request kwargs."""

from typing import Any, Dict, List, Optional


def apply_prompt_cache_key(
    request_kwargs: Dict[str, Any],
    prompt_cache_key: Optional[str],
) -> Dict[str, Any]:
    """Add normalized prompt cache key to request kwargs when present."""
    if isinstance(prompt_cache_key, str):
        normalized_key = prompt_cache_key.strip()
        if normalized_key:
            request_kwargs["prompt_cache_key"] = normalized_key
    return request_kwargs


def build_tool_transport_kwargs(
    *,
    tools: Optional[List[Dict[str, Any]]],
    tool_choice: Optional[Any],
    parallel_tool_calls: Optional[bool],
    prompt_cache_key: Optional[str],
) -> Dict[str, Any]:
    """Build shared tool transport kwargs for completion and streaming requests."""
    request_kwargs: Dict[str, Any] = {
        "tools": tools,
        "tool_choice": tool_choice,
        "parallel_tool_calls": parallel_tool_calls,
    }
    return apply_prompt_cache_key(request_kwargs, prompt_cache_key)
