"""Tests for Anthropic provider thinking configuration behavior."""

import pytest

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    ThinkingEvent,
)
from backend.src.llm.providers.anthropic import AnthropicProvider


async def _collect_stream_events(provider: AnthropicProvider, **kwargs):
    events = []
    async for event in provider.get_completion_stream(**kwargs):
        events.append(event)
    return events


def _patch_stream_completion(monkeypatch, fake_stream_factory, captured_kwargs=None):
    async def fake_acompletion(**kwargs):
        if captured_kwargs is not None:
            captured_kwargs.update(kwargs)
        return fake_stream_factory()

    monkeypatch.setattr(
        "backend.src.llm.providers.stream_event_pipeline.litellm.acompletion",
        fake_acompletion,
    )


def _anthropic_tool_schema(name: str) -> dict:
    return {
        "type": "function",
        "name": name,
        "parameters": {"type": "object"},
    }


def _build_stream_chunk(
    *,
    tool_name: str | None = None,
    tool_arguments: str | None = None,
    tool_call_id: str | None = None,
    content: str | None = None,
    thinking: str | None = None,
    finish_reason: str | None = None,
) -> dict:
    delta: dict = {}
    if thinking is not None:
        delta["thinking"] = thinking
    if content is not None:
        delta["content"] = content
    if tool_name is not None or tool_arguments is not None:
        function_payload = {}
        if tool_name is not None:
            function_payload["name"] = tool_name
        if tool_arguments is not None:
            function_payload["arguments"] = tool_arguments
        tool_call_payload = {"index": 0, "function": function_payload}
        if tool_call_id is not None:
            tool_call_payload["id"] = tool_call_id
        delta["tool_calls"] = [tool_call_payload]
    choice = {"delta": delta}
    if finish_reason is not None:
        choice["finish_reason"] = finish_reason
    return {"choices": [choice]}


def _build_block_tool_use_chunk(
    *,
    tool_name: str | None = None,
    tool_input: dict | str | None = None,
    tool_use_id: str | None = None,
    tool_index: int | None = None,
    text_block: str | None = None,
    thinking_block: str | None = None,
    finish_reason: str | None = None,
) -> dict:
    content_blocks: list[dict] = []
    if thinking_block is not None:
        content_blocks.append({"type": "thinking_delta", "text": thinking_block})
    if text_block is not None:
        content_blocks.append({"type": "text", "text": text_block})
    if tool_name is not None or tool_input is not None:
        block: dict = {"type": "tool_use"}
        if tool_name is not None:
            block["name"] = tool_name
        if tool_input is not None:
            block["input"] = tool_input
        if tool_use_id is not None:
            block["tool_use_id"] = tool_use_id
        if tool_index is not None:
            block["index"] = tool_index
        content_blocks.append(block)
    choice = {"delta": {"content": content_blocks}}
    if finish_reason is not None:
        choice["finish_reason"] = finish_reason
    return {"choices": [choice]}


def test_anthropic_provider_stream_includes_thinking_by_default():
    provider = AnthropicProvider(api_key="test-key")
    assert provider.stream_includes_thinking is True


def test_anthropic_provider_supports_streaming_tool_turns():
    provider = AnthropicProvider(api_key="test-key")
    assert provider.supports_streaming_tool_turns("claude-sonnet-4-5-20250929") is True


def test_anthropic_provider_enables_thinking_payload_for_thinking_model():
    provider = AnthropicProvider(api_key="test-key")
    params = {"model": "anthropic/claude-sonnet-4-5-20250929"}

    updated = provider._apply_provider_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-thinking",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 16384}


def test_anthropic_provider_removes_thinking_payload_for_non_thinking_model():
    provider = AnthropicProvider(api_key="test-key")
    params = {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "thinking": {"type": "enabled", "budget_tokens": 16384},
    }

    updated = provider._apply_provider_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-nonthinking",
    )

    assert "thinking" not in updated


def test_anthropic_provider_keeps_existing_thinking_payload_when_model_is_unknown():
    provider = AnthropicProvider(api_key="test-key")
    params = {
        "model": "anthropic/custom-model",
        "thinking": {"type": "enabled", "budget_tokens": 1000},
    }

    updated = provider._apply_provider_request_params(
        params,
        model="custom-model",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 1000}


def test_anthropic_provider_extracts_provider_native_thinking_blocks():
    provider = AnthropicProvider(api_key="test-key")

    delta = {
        "content": [
            {"type": "text", "text": "visible assistant text"},
            {"type": "thinking_delta", "text": "provider-native thought"},
        ]
    }

    assert provider._extract_thinking_content(delta) == "provider-native thought"


def test_anthropic_provider_uses_low_budget_for_low_reasoning_variant():
    provider = AnthropicProvider(api_key="test-key")
    params = {"model": "anthropic/claude-sonnet-4-5-20250929"}

    updated = provider._apply_provider_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-low-thinking",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 4096}


@pytest.mark.asyncio
async def test_anthropic_streams_text_and_thinking_while_buffering_tool_calls(
    monkeypatch,
):
    provider = AnthropicProvider(api_key="test-key")
    captured_kwargs = {}

    async def fake_stream():
        yield _build_stream_chunk(
            thinking="checking screen",
            content="I can ",
            tool_name="screenshot",
            tool_arguments='{"explanation":"look',
            tool_call_id="toolu_1",
        )
        yield _build_stream_chunk(
            content="take a look.",
            tool_arguments=' now"}',
            finish_reason="tool_calls",
        )

    _patch_stream_completion(monkeypatch, fake_stream, captured_kwargs)

    events = await _collect_stream_events(
        provider,
        model="claude-sonnet-4-5-20250929",
        messages=[{"role": "user", "content": "what is on screen?"}],
        tools=[_anthropic_tool_schema("screenshot")],
    )

    assert captured_kwargs["stream"] is True
    assert captured_kwargs["stream_options"] == {"include_usage": True}
    assert any(
        isinstance(event, ThinkingEvent) and event.content == "checking screen"
        for event in events
    )
    assert "".join(
        event.content for event in events if isinstance(event, ChunkEvent)
    ) == ("I can take a look.")
    assert all(event.type.value != "tool-call" for event in events)

    payload = provider.get_last_stream_response_payload()
    assert payload == {
        "content": "I can take a look.",
        "tool_calls": [
            {
                "id": "toolu_1",
                "name": "screenshot",
                "arguments": {"explanation": "look now"},
            }
        ],
        "finish_reason": "tool_calls",
    }


@pytest.mark.asyncio
async def test_anthropic_stream_buffers_block_tool_use_until_stream_finishes(
    monkeypatch,
):
    provider = AnthropicProvider(api_key="test-key")

    async def fake_stream():
        yield _build_block_tool_use_chunk(
            thinking_block="need a capture",
            text_block="I'll check. ",
            tool_name="screenshot",
            tool_input={"explanation": "capture screen"},
            tool_use_id="toolu_block_1",
            tool_index=0,
            finish_reason="tool_calls",
        )

    _patch_stream_completion(monkeypatch, fake_stream)

    events = await _collect_stream_events(
        provider,
        model="claude-sonnet-4-5-20250929",
        messages=[{"role": "user", "content": "what is on screen?"}],
        tools=[_anthropic_tool_schema("screenshot")],
    )

    assert [event.content for event in events if isinstance(event, ThinkingEvent)] == [
        "need a capture"
    ]
    assert [event.content for event in events if isinstance(event, ChunkEvent)] == [
        "I'll check. "
    ]
    assert all(event.type.value != "tool-call" for event in events)

    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["tool_calls"] == [
        {
            "id": "toolu_block_1",
            "name": "screenshot",
            "arguments": {"explanation": "capture screen"},
        }
    ]


@pytest.mark.asyncio
async def test_anthropic_stream_errors_when_buffered_tool_call_id_is_missing(
    monkeypatch,
):
    provider = AnthropicProvider(api_key="test-key")

    async def fake_stream():
        yield _build_block_tool_use_chunk(
            text_block="I'll check. ",
            tool_name="screenshot",
            tool_input={"explanation": "capture screen"},
            finish_reason="tool_calls",
        )

    _patch_stream_completion(monkeypatch, fake_stream)

    events = await _collect_stream_events(
        provider,
        model="claude-sonnet-4-5-20250929",
        messages=[{"role": "user", "content": "what is on screen?"}],
        tools=[_anthropic_tool_schema("screenshot")],
    )

    assert [event.content for event in events if isinstance(event, ChunkEvent)] == [
        "I'll check. "
    ]
    error_messages = [
        event.content for event in events if isinstance(event, ErrorEvent)
    ]
    assert len(error_messages) == 1
    assert "missing streamed tool-call id" in error_messages[0]
    assert provider.get_last_stream_response_payload() is None
