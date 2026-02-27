"""Tests for KimiCodingProvider streaming thinking + tool-call aggregation."""

import pytest

from backend.src.core.events.streaming_events import ChunkEvent, ErrorEvent, ThinkingEvent
from backend.src.llm.providers.kimi_coding import KimiCodingProvider


async def _collect_stream_events(provider: KimiCodingProvider, **kwargs):
    events = []
    async for event in provider.get_completion_stream(**kwargs):
        events.append(event)
    return events


def _patch_stream_completion(monkeypatch, fake_stream_factory):
    async def fake_acompletion(**_kwargs):
        return fake_stream_factory()

    monkeypatch.setattr(
        "backend.src.llm.providers.kimi_coding.litellm.acompletion",
        fake_acompletion,
    )


async def _collect_stream_events_for_tool(
    provider: KimiCodingProvider,
    monkeypatch,
    *,
    fake_stream_factory,
    tool_name: str,
):
    _patch_stream_completion(monkeypatch, fake_stream_factory)
    return await _collect_stream_events(
        provider,
        model="k2p5",
        messages=[{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": tool_name,
                    "parameters": {"type": "object"},
                },
            }
        ],
    )


async def _run_stream_tool_case(
    monkeypatch,
    *,
    fake_stream_factory,
    tool_name: str,
):
    provider = KimiCodingProvider(api_key="test-key")
    events = await _collect_stream_events_for_tool(
        provider,
        monkeypatch,
        fake_stream_factory=fake_stream_factory,
        tool_name=tool_name,
    )
    return provider, events


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
        tool_call_payload = {
            "index": 0,
            "function": function_payload,
        }
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
    finish_reason: str | None = None,
) -> dict:
    content_blocks: list[dict] = []
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


def test_kimi_provider_supports_streaming_tool_turns():
    provider = KimiCodingProvider(api_key="test-key")
    assert provider.supports_streaming_tool_turns("k2p5") is True


@pytest.mark.asyncio
async def test_kimi_completion_uses_anthropic_custom_provider(monkeypatch):
    provider = KimiCodingProvider(api_key="test-key")
    captured_kwargs = {}

    async def fake_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return {
            "choices": [
                {
                    "message": {"content": "ok"},
                }
            ]
        }

    monkeypatch.setattr("backend.src.llm.providers.base.litellm.acompletion", fake_acompletion)

    result = await provider.get_completion(
        model="k2p5",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert captured_kwargs["custom_llm_provider"] == "anthropic"
    assert result["content"] == "ok"


@pytest.mark.asyncio
async def test_kimi_stream_emits_thinking_and_captures_stream_tool_calls(monkeypatch):
    async def fake_stream():
        yield _build_stream_chunk(
            reasoning_content="step-1",
            content="Hello ",
            tool_name="read_file",
            tool_arguments="{\"path\":\"/tmp",
            tool_call_id="call_1",
        )
        yield _build_stream_chunk(
            content="world",
            tool_arguments="/demo.txt\"}",
            finish_reason="tool_calls",
        )

    provider, events = await _run_stream_tool_case(
        monkeypatch,
        fake_stream_factory=fake_stream,
        tool_name="read_file",
    )

    assert any(isinstance(event, ThinkingEvent) and event.content == "step-1" for event in events)
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
async def test_kimi_stream_sets_stream_options_and_custom_provider(monkeypatch):
    provider = KimiCodingProvider(api_key="test-key")
    captured_kwargs = {}

    async def fake_stream():
        yield {"choices": [{"delta": {"content": "ok"}}]}

    async def fake_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_stream()

    monkeypatch.setattr("backend.src.llm.providers.kimi_coding.litellm.acompletion", fake_acompletion)

    events = await _collect_stream_events(
        provider,
        model="k2p5",
        messages=[{"role": "user", "content": "ping"}],
        prompt_cache_key="cache-key",
    )

    assert any(isinstance(event, ChunkEvent) and event.content == "ok" for event in events)
    assert captured_kwargs["stream"] is True
    assert captured_kwargs["stream_options"] == {"include_usage": True}
    assert captured_kwargs["custom_llm_provider"] == "anthropic"
    assert captured_kwargs["prompt_cache_key"] == "cache-key"


@pytest.mark.asyncio
async def test_kimi_stream_emits_error_event_when_tool_arguments_json_is_invalid(monkeypatch):
    async def fake_stream():
        yield _build_stream_chunk(
            tool_name="replace",
            tool_arguments="{\"file_path\":\"/tmp/a\",\"new_string\":\"unterminated",
            tool_call_id="call_bad",
            finish_reason="tool_calls",
        )

    provider, events = await _run_stream_tool_case(
        monkeypatch,
        fake_stream_factory=fake_stream,
        tool_name="replace",
    )

    assert any(isinstance(event, ErrorEvent) for event in events)
    error_messages = [
        event.content for event in events if isinstance(event, ErrorEvent)
    ]
    assert any("failed to parse streamed tool-call arguments" in message for message in error_messages)
    assert provider.get_last_stream_response_payload() is None


@pytest.mark.asyncio
async def test_kimi_stream_parses_block_tool_use_and_synthesizes_missing_id(monkeypatch):
    async def fake_stream():
        yield _build_block_tool_use_chunk(
            text_block="Hello ",
            tool_name="read_file",
            tool_input={"path": "/tmp/block.txt"},
            tool_index=3,
        )
        yield _build_stream_chunk(content="world", finish_reason="tool_calls")

    provider, events = await _run_stream_tool_case(
        monkeypatch,
        fake_stream_factory=fake_stream,
        tool_name="read_file",
    )

    chunk_text = "".join(event.content for event in events if isinstance(event, ChunkEvent))
    assert chunk_text == "Hello world"

    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["tool_calls"] == [
        {
            "id": "tool_call_3",
            "name": "read_file",
            "arguments": {"path": "/tmp/block.txt"},
        }
    ]


@pytest.mark.asyncio
async def test_kimi_stream_prefers_object_arguments_over_fragmented_string(monkeypatch):
    async def fake_stream():
        yield _build_stream_chunk(
            tool_name="replace",
            tool_arguments="{\"file_path\":\"/tmp/a\",\"old_string\":\"x\"",
        )
        yield _build_block_tool_use_chunk(
            tool_name="replace",
            tool_input={"file_path": "/tmp/a", "old_string": "x", "new_string": "y"},
            tool_index=0,
            finish_reason="tool_calls",
        )

    provider, events = await _run_stream_tool_case(
        monkeypatch,
        fake_stream_factory=fake_stream,
        tool_name="replace",
    )

    assert not any(isinstance(event, ErrorEvent) for event in events)
    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["tool_calls"] == [
        {
            "id": "tool_call_0",
            "name": "replace",
            "arguments": {
                "file_path": "/tmp/a",
                "old_string": "x",
                "new_string": "y",
            },
        }
    ]
