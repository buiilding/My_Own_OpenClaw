"""Tests for GeminiProvider streaming thinking + tool-call aggregation."""

import pytest

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    ThinkingEvent,
)
from backend.src.llm.providers.gemini import GeminiProvider
from backend.src.tools.web_search.source_normalization import (
    extract_gemini_web_search_sources,
)


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
    thought_signature: str | None = None,
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
        if thought_signature is not None:
            function_payload["thoughtSignature"] = thought_signature
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


def test_gemini_provider_supports_streaming_tool_turns():
    provider = GeminiProvider(api_key="test-key")
    assert provider.supports_streaming_tool_turns("gemini-3.1-pro-preview") is True


def test_gemini_build_request_params_uses_provider_default_reasoning_effort():
    provider = GeminiProvider(api_key="test-key")
    params = provider._build_request_params(
        "gemini-3.1-pro-preview",
        [{"role": "user", "content": "hi"}],
    )

    assert "reasoning_effort" not in params


def test_gemini_provider_enables_native_thinking_payload_for_thinking_model():
    provider = GeminiProvider(api_key="test-key")
    params = {"model": "gemini/gemini-3.1-pro-preview"}

    updated = provider._apply_provider_request_params(
        params,
        model="gemini-3.1-pro-preview@@gemini-3-1-pro-thinking",
    )

    assert updated.get("temperature") == 1.0
    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 16384}


def test_gemini_provider_uses_high_budget_for_high_reasoning_variant():
    provider = GeminiProvider(api_key="test-key")
    params = {"model": "gemini/gemini-3.1-pro-preview"}

    updated = provider._apply_provider_request_params(
        params,
        model="gemini-3.1-pro-preview@@gemini-3-1-pro-high-thinking",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 32768}


def test_gemini_provider_filters_thought_blocks_from_visible_text():
    provider = GeminiProvider(api_key="test-key")
    delta = {
        "content": [
            {"type": "text", "thought": True, "text": "private reasoning"},
            {"type": "text", "text": "visible text"},
        ]
    }

    assert provider._extract_thinking_content(delta) == "private reasoning"
    assert provider._extract_delta_content(delta) == "visible text"


@pytest.mark.asyncio
async def test_gemini_native_web_search_falls_back_to_sync_completion_when_async_transform_is_missing(
    monkeypatch,
):
    provider = GeminiProvider(api_key="test-key")

    async def fake_async_completion(**kwargs):
        _ = kwargs
        raise NotImplementedError(
            "Vertex AI has a custom implementation of transform_request. Needs sync + async."
        )

    def fake_sync_completion(**kwargs):
        assert kwargs["tools"] == [{"google_search": {}}]
        return {
            "choices": [
                {
                    "message": {
                        "content": "grounded answer",
                    },
                    "finish_reason": "stop",
                }
            ],
            "candidates": [
                {
                    "groundingMetadata": {
                        "webSearchQueries": ["latest project alpha news"],
                        "groundingChunks": [
                            {
                                "web": {
                                    "uri": "https://example.com/a",
                                    "title": "Example A",
                                }
                            }
                        ],
                    }
                }
            ],
        }

    monkeypatch.setattr(
        "backend.src.llm.providers.gemini.litellm.acompletion", fake_async_completion
    )
    monkeypatch.setattr(
        "backend.src.llm.providers.gemini.litellm.completion", fake_sync_completion
    )

    response = await provider.get_completion(
        model="gemini-3-flash-preview@@gemini-3-flash-thinking",
        messages=[{"role": "user", "content": "hi"}],
        native_web_search_enabled=True,
    )

    assert response["content"] == "grounded answer"
    assert response["web_search_sources"] == [
        {
            "url": "https://example.com/a",
            "title": "Example A",
            "provider": "gemini",
            "query": "latest project alpha news",
            "rank": 1,
        }
    ]


@pytest.mark.asyncio
async def test_gemini_native_web_search_falls_back_when_litellm_wraps_transform_gap(
    monkeypatch,
):
    provider = GeminiProvider(api_key="test-key")

    async def fake_async_completion(**kwargs):
        _ = kwargs
        raise RuntimeError(
            "litellm.APIConnectionError: Vertex AI has a custom implementation of transform_request. Needs sync + async."
        )

    def fake_sync_completion(**kwargs):
        assert kwargs["tools"] == [{"google_search": {}}]
        return {
            "choices": [
                {
                    "message": {
                        "content": "grounded answer",
                    },
                    "finish_reason": "stop",
                }
            ],
            "candidates": [
                {
                    "groundingMetadata": {
                        "webSearchQueries": ["rachel greene"],
                        "groundingChunks": [
                            {
                                "web": {
                                    "uri": "https://example.com/rachel",
                                    "title": "Rachel",
                                }
                            }
                        ],
                    }
                }
            ],
        }

    monkeypatch.setattr(
        "backend.src.llm.providers.gemini.litellm.acompletion", fake_async_completion
    )
    monkeypatch.setattr(
        "backend.src.llm.providers.gemini.litellm.completion", fake_sync_completion
    )

    response = await provider.get_completion(
        model="gemini-3-flash-preview@@gemini-3-flash-thinking",
        messages=[{"role": "user", "content": "hi"}],
        native_web_search_enabled=True,
    )

    assert response["content"] == "grounded answer"
    assert response["web_search_sources"] == [
        {
            "url": "https://example.com/rachel",
            "title": "Rachel",
            "provider": "gemini",
            "query": "rachel greene",
            "rank": 1,
        }
    ]


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
    chunk_text = "".join(
        event.content for event in events if isinstance(event, ChunkEvent)
    )
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
async def test_gemini_stream_includes_native_web_search_tool(monkeypatch):
    provider = GeminiProvider(api_key="test-key")
    captured_kwargs = {}

    async def fake_stream():
        yield _build_stream_chunk(content="Search result")

    async def fake_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.gemini.litellm.acompletion",
        fake_acompletion,
    )

    events = await _collect_stream_events(
        provider,
        model="gemini-3.1-pro-preview",
        messages=[{"role": "user", "content": "search"}],
        native_web_search_enabled=True,
    )

    assert captured_kwargs["tools"] == [{"google_search": {}}]
    assert [event.content for event in events if isinstance(event, ChunkEvent)] == [
        "Search result"
    ]


@pytest.mark.asyncio
async def test_gemini_stream_emits_error_event_when_tool_arguments_json_is_invalid(
    monkeypatch,
):
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
    error_messages = [
        event.content for event in events if isinstance(event, ErrorEvent)
    ]
    assert any(
        "failed to parse streamed tool-call arguments" in message
        for message in error_messages
    )
    assert any(
        "Invalid response from Gemini stream" in message for message in error_messages
    )
    assert provider.get_last_stream_response_payload() is None


@pytest.mark.asyncio
async def test_gemini_stream_rejects_block_tool_use_missing_id(
    monkeypatch,
):
    provider = GeminiProvider(api_key="test-key")

    async def fake_stream():
        yield _build_block_tool_use_chunk(
            text_block="Hello ",
            tool_name="read_file",
            tool_input={"path": "/tmp/block.txt"},
            tool_index=2,
        )
        yield _build_stream_chunk(content="world", finish_reason="tool_calls")

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

    chunk_text = "".join(
        event.content for event in events if isinstance(event, ChunkEvent)
    )
    assert chunk_text == "Hello world"

    error_messages = [
        event.content for event in events if isinstance(event, ErrorEvent)
    ]
    assert len(error_messages) == 1
    assert "missing streamed tool-call id" in error_messages[0]
    assert provider.get_last_stream_response_payload() is None


@pytest.mark.asyncio
async def test_gemini_stream_prefers_object_arguments_over_fragmented_string(
    monkeypatch,
):
    provider = GeminiProvider(api_key="test-key")

    async def fake_stream():
        yield _build_stream_chunk(
            tool_name="replace",
            tool_arguments='{"file_path":"/tmp/a","old_string":"x"',
            tool_call_id="call_1",
        )
        yield _build_block_tool_use_chunk(
            tool_name="replace",
            tool_input={"file_path": "/tmp/a", "old_string": "x", "new_string": "y"},
            tool_index=0,
            tool_use_id="call_1",
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

    assert not any(isinstance(event, ErrorEvent) for event in events)
    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["tool_calls"] == [
        {
            "id": "call_1",
            "name": "replace",
            "arguments": {
                "file_path": "/tmp/a",
                "old_string": "x",
                "new_string": "y",
            },
        }
    ]


@pytest.mark.asyncio
async def test_gemini_stream_preserves_thought_signature(monkeypatch):
    provider = GeminiProvider(api_key="test-key")

    async def fake_stream():
        yield _build_stream_chunk(
            tool_name="browser",
            tool_arguments='{"action":"snapshot"}',
            tool_call_id="call_1",
            thought_signature="sig-123",
            finish_reason="tool_calls",
        )

    async def fake_open_stream(*, model, messages, completion_kwargs):
        _ = (model, messages, completion_kwargs)
        return fake_stream()

    monkeypatch.setattr(provider, "_open_stream", fake_open_stream)
    await _collect_stream_events(
        provider,
        model="gemini-3.1-pro-preview",
        messages=[{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "function": {"name": "browser", "parameters": {"type": "object"}},
            }
        ],
    )

    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["tool_calls"] == [
        {
            "id": "call_1",
            "name": "browser",
            "arguments": {"action": "snapshot"},
            "thought_signature": "sig-123",
        }
    ]


def test_extract_gemini_web_search_sources_ignores_entries_without_urls_and_dedupes():
    payload = {
        "candidates": [
            {
                "groundingMetadata": {
                    "webSearchQueries": ["latest project alpha news"],
                    "groundingChunks": [
                        {"web": {"uri": "https://example.com/a", "title": "Example A"}},
                        {"web": {"uri": "", "title": "Missing URL"}},
                        {
                            "web": {
                                "uri": "https://example.com/a",
                                "title": "Duplicate A",
                            }
                        },
                        {"web": {"url": "https://example.com/b", "title": "Example B"}},
                    ],
                }
            }
        ]
    }

    assert extract_gemini_web_search_sources(payload) == [
        {
            "url": "https://example.com/a",
            "title": "Example A",
            "provider": "gemini",
            "query": "latest project alpha news",
            "rank": 1,
        },
        {
            "url": "https://example.com/b",
            "title": "Example B",
            "provider": "gemini",
            "query": "latest project alpha news",
            "rank": 4,
        },
    ]
