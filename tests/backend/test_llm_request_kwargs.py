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


def test_apply_prompt_cache_key_overwrites_existing_value_when_valid():
    kwargs = {"prompt_cache_key": "old-key"}

    apply_prompt_cache_key(kwargs, "  new-key  ")

    assert kwargs["prompt_cache_key"] == "new-key"


def test_apply_prompt_cache_key_keeps_existing_value_when_new_input_invalid():
    kwargs = {"prompt_cache_key": "stable-key"}

    apply_prompt_cache_key(kwargs, "   ")
    apply_prompt_cache_key(kwargs, None)

    assert kwargs["prompt_cache_key"] == "stable-key"


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


def test_build_tool_transport_kwargs_keeps_none_fields_and_omits_blank_prompt_cache_key():
    result = build_tool_transport_kwargs(
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key="   ",
    )

    assert result == {
        "tools": None,
        "tool_choice": None,
        "parallel_tool_calls": None,
    }
