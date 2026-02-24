"""Shared helpers for building LLM provider request kwargs."""

from typing import Any, Dict, List, Optional


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
    if isinstance(prompt_cache_key, str):
        normalized_key = prompt_cache_key.strip()
        if normalized_key:
            request_kwargs["prompt_cache_key"] = normalized_key
    return request_kwargs
