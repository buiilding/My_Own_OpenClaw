"""Tests for GeminiProvider streaming thinking + tool-call aggregation."""

import pytest

from backend.src.core.events.streaming_events import ChunkEvent, ErrorEvent, ThinkingEvent
from backend.src.llm.providers.gemini import GeminiProvider


async def _collect_stream_events(provider: GeminiProvider, **kwargs):
    events = []
    async for event in provider.get_completion_stream(**kwargs):
        events.append(event)
    return events


def _build_stream_chunk(
    *,
    tool_name: str | None = None,
    tool_arguments: str | None = None,
    tool_call_id: str | None = None,
    content: str | None = None,
    reasoning_content: str | None = None,
    finish_reason: str | None = None,
) -> dict:
    delta: dict = {}
    if reasoning_content is not None:
        delta["reasoning_content"] = reasoning_content
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


def test_gemini_provider_supports_streaming_tool_turns():
    provider = GeminiProvider(api_key="test-key")
    assert provider.supports_streaming_tool_turns("gemini-3.1-pro-preview") is True


@pytest.mark.asyncio
async def test_gemini_stream_emits_thinking_and_captures_stream_tool_calls(monkeypatch):
    provider = GeminiProvider(api_key="test-key")

    async def fake_stream():
        yield _build_stream_chunk(
            reasoning_content="step-1",
            content="Hello ",
            tool_name="read_file",
            tool_arguments='{"path":"/tmp',
            tool_call_id="call_1",
        )
        yield _build_stream_chunk(
            content="world",
            tool_arguments='/demo.txt"}',
            finish_reason="tool_calls",
        )

    async def fake_open_stream(*, model, messages, completion_kwargs):
        _ = (model, messages, completion_kwargs)
        return fake_stream()

    monkeypatch.setattr(provider, "_open_stream", fake_open_stream)
    events = await _collect_stream_events(
        provider,
        model="gemini-3.1-pro-preview",
        messages=[{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "function": {"name": "read_file", "parameters": {"type": "object"}},
            }
        ],
    )

    assert any(
        isinstance(event, ThinkingEvent) and event.content == "step-1"
        for event in events
    )
    chunk_text = "".join(event.content for event in events if isinstance(event, ChunkEvent))
    assert chunk_text == "Hello world"

    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["content"] == "Hello world"
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"] == [
        {
            "id": "call_1",
            "name": "read_file",
            "arguments": {"path": "/tmp/demo.txt"},
        }
    ]


@pytest.mark.asyncio
async def test_gemini_stream_emits_error_event_when_tool_arguments_json_is_invalid(monkeypatch):
    provider = GeminiProvider(api_key="test-key")

    async def fake_stream():
        yield _build_stream_chunk(
            tool_name="replace",
            tool_arguments='{"file_path":"/tmp/a","new_string":"unterminated',
            tool_call_id="call_bad",
            finish_reason="tool_calls",
        )

    async def fake_open_stream(*, model, messages, completion_kwargs):
        _ = (model, messages, completion_kwargs)
        return fake_stream()

    monkeypatch.setattr(provider, "_open_stream", fake_open_stream)
    events = await _collect_stream_events(
        provider,
        model="gemini-3.1-pro-preview",
        messages=[{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "function": {"name": "replace", "parameters": {"type": "object"}},
            }
        ],
    )

    assert any(isinstance(event, ErrorEvent) for event in events)
    error_messages = [event.content for event in events if isinstance(event, ErrorEvent)]
    assert any(
        "failed to parse streamed tool-call arguments" in message
        for message in error_messages
    )
    assert provider.get_last_stream_response_payload() is None
