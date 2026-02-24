"""Tests for shared LLM request kwargs helpers."""

from backend.src.llm.request_kwargs import (
    apply_prompt_cache_key,
    build_tool_transport_kwargs,
)


def test_apply_prompt_cache_key_adds_normalized_value():
    kwargs = {"model": "gpt-5.1"}

    result = apply_prompt_cache_key(kwargs, "  convo-123  ")

    assert result is kwargs
    assert result["prompt_cache_key"] == "convo-123"


def test_apply_prompt_cache_key_ignores_empty_or_non_string_values():
    kwargs = {}

    apply_prompt_cache_key(kwargs, "   ")
    apply_prompt_cache_key(kwargs, None)
    apply_prompt_cache_key(kwargs, 123)  # type: ignore[arg-type]

    assert "prompt_cache_key" not in kwargs


def test_build_tool_transport_kwargs_forwards_normalized_prompt_cache_key():
    result = build_tool_transport_kwargs(
        tools=[{"type": "function", "function": {"name": "ping"}}],
        tool_choice="auto",
        parallel_tool_calls=True,
        prompt_cache_key="  session-1  ",
    )

    assert result == {
        "tools": [{"type": "function", "function": {"name": "ping"}}],
        "tool_choice": "auto",
        "parallel_tool_calls": True,
        "prompt_cache_key": "session-1",
    }
