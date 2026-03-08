"""Tests for OpenAI provider-native reasoning support."""

from __future__ import annotations

from enum import Enum
from typing import Any, AsyncGenerator

import pytest

from backend.src.core.events.streaming_events import ChunkEvent, ThinkingEvent
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.openai import OpenAIProvider
from backend.src.llm.providers.openai_responses_runtime import (
    stream_openai_responses_events,
)


async def _collect_events(
    generator: AsyncGenerator[Any, None],
) -> list[Any]:
    events = []
    async for event in generator:
        events.append(event)
    return events


@pytest.mark.asyncio
async def test_openai_provider_routes_thinking_completion_to_responses_runtime(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_responses_completion(*args, **kwargs):
        _ = (args, kwargs)
        return {"content": "reasoned"}

    async def unexpected_standard_completion(self, *args, **kwargs):
        _ = (self, args, kwargs)
        raise AssertionError("standard completion path should not be used")

    monkeypatch.setattr(
        "backend.src.llm.providers.openai.get_openai_responses_completion",
        fake_responses_completion,
    )
    monkeypatch.setattr(OnlineLLMProvider, "get_completion", unexpected_standard_completion)

    response = await provider.get_completion(
        model="gpt-5.2@@gpt-5-2-thinking",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert response == {"content": "reasoned"}


@pytest.mark.asyncio
async def test_openai_provider_routes_nonthinking_completion_to_standard_runtime(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_standard_completion(self, *args, **kwargs):
        _ = (self, args, kwargs)
        return {"content": "standard"}

    monkeypatch.setattr(OnlineLLMProvider, "get_completion", fake_standard_completion)

    response = await provider.get_completion(
        model="gpt-5@@gpt-5-nonthinking",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert response == {"content": "standard"}


@pytest.mark.asyncio
async def test_openai_provider_routes_thinking_stream_to_responses_runtime(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_responses_stream(*args, **kwargs):
        _ = (args, kwargs)
        yield ThinkingEvent(content="step-1")
        yield ChunkEvent(content="hello")

    async def unexpected_standard_stream(self, *args, **kwargs):
        _ = (self, args, kwargs)
        raise AssertionError("standard stream path should not be used")
        yield  # pragma: no cover

    monkeypatch.setattr(
        "backend.src.llm.providers.openai.stream_openai_responses_events",
        fake_responses_stream,
    )
    monkeypatch.setattr(OnlineLLMProvider, "_stream_internal", unexpected_standard_stream)

    events = await _collect_events(
        provider._stream_internal(
            model="gpt-5.2@@gpt-5-2-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [type(event).__name__ for event in events] == ["ThinkingEvent", "ChunkEvent"]


@pytest.mark.asyncio
async def test_openai_provider_routes_nonthinking_stream_to_standard_runtime(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_standard_stream(self, *args, **kwargs):
        _ = (self, args, kwargs)
        yield ChunkEvent(content="fallback")

    monkeypatch.setattr(OnlineLLMProvider, "_stream_internal", fake_standard_stream)

    events = await _collect_events(
        provider._stream_internal(
            model="gpt-5@@gpt-5-nonthinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [event.content for event in events] == ["fallback"]


@pytest.mark.asyncio
async def test_openai_responses_stream_emits_provider_native_reasoning_and_captures_final_payload(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.reasoning_summary_text.delta",
            "delta": "first reasoning step",
        }
        yield {
            "type": "response.output_text.delta",
            "delta": "visible text",
        }
        yield {
            "type": "response.completed",
            "response": {
                "output_text": "visible text",
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "visible text"}],
                    },
                    {
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "browser",
                        "arguments": "{\"action\":\"snapshot\"}",
                    },
                ],
                "status": "completed",
                "usage": {
                    "prompt_tokens": 11,
                    "completion_tokens": 7,
                    "total_tokens": 18,
                },
            },
        }

    async def fake_aresponses(**kwargs):
        _ = kwargs
        return fake_stream()

    monkeypatch.setattr("backend.src.llm.providers.openai_responses_runtime.litellm.aresponses", fake_aresponses)

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.2@@gpt-5-2-thinking",
            messages=[{"role": "user", "content": "hi"}],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "browser",
                        "parameters": {"type": "object"},
                    },
                }
            ],
        )
    )

    assert [type(event).__name__ for event in events] == ["ThinkingEvent", "ChunkEvent"]
    assert events[0].content == "first reasoning step"
    assert events[1].content == "visible text"

    payload = provider.get_last_stream_response_payload()
    assert payload == {
        "content": "visible text",
        "tool_calls": [
            {
                "id": "call_1",
                "name": "browser",
                "arguments": {"action": "snapshot"},
            }
        ],
        "finish_reason": "completed",
    }

    usage = provider.get_last_usage()
    assert usage is not None
    assert usage["prompt_tokens"] == 11
    assert usage["completion_tokens"] == 7
    assert usage["total_tokens"] == 18


@pytest.mark.asyncio
async def test_openai_responses_stream_handles_enum_typed_events(
    monkeypatch,
):
    class FakeResponsesEventType(str, Enum):
        RESPONSE_REASONING_TEXT_DELTA = "response.reasoning_text.delta"
        RESPONSE_OUTPUT_TEXT_DELTA = "response.output_text.delta"
        RESPONSE_COMPLETED = "response.completed"

    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": FakeResponsesEventType.RESPONSE_REASONING_TEXT_DELTA,
            "delta": "reasoning",
        }
        yield {
            "type": FakeResponsesEventType.RESPONSE_OUTPUT_TEXT_DELTA,
            "delta": "visible",
        }
        yield {
            "type": FakeResponsesEventType.RESPONSE_COMPLETED,
            "response": {
                "output_text": "visible",
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "visible"}],
                    }
                ],
                "status": "completed",
                "usage": {
                    "prompt_tokens": 3,
                    "completion_tokens": 2,
                    "total_tokens": 5,
                },
            },
        }

    async def fake_aresponses(**kwargs):
        _ = kwargs
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.3-codex@@gpt-5-3-codex-fast-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [type(event).__name__ for event in events] == ["ThinkingEvent", "ChunkEvent"]
    assert events[0].content == "reasoning"
    assert events[1].content == "visible"
    assert provider.get_last_stream_response_payload() == {
        "content": "visible",
        "finish_reason": "completed",
    }
