"""Tests for OpenAI provider-native reasoning support."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, AsyncGenerator

import pytest

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    ThinkingEvent,
    WebSearchProgressEvent,
)
from backend.src.core.infrastructure.error_types.llm import LLMAPIError
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.openai import OpenAIProvider
from backend.src.llm.providers.openai_responses_input import (
    build_openai_reasoning_config,
    build_openai_responses_input,
    build_openai_responses_tools,
)
from backend.src.llm.providers.openai_responses_payload import (
    normalize_openai_responses_payload,
)
from backend.src.llm.providers.openai_responses_runtime import (
    stream_openai_responses_events,
)
from backend.src.tools.browser.shared_contract_loader import load_shared_browser_contract
from backend.src.tools.web_search.source_normalization import (
    extract_openai_web_search_sources,
)

build_browser_tool_parameters_schema = (
    load_shared_browser_contract().build_browser_tool_parameters_schema
)


async def _collect_events(
    generator: AsyncGenerator[Any, None],
) -> list[Any]:
    events = []
    async for event in generator:
        events.append(event)
    return events


@pytest.mark.asyncio
async def test_openai_provider_routes_thinking_completion_to_responses_runtime(
    monkeypatch,
):
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
    monkeypatch.setattr(
        OnlineLLMProvider, "get_completion", unexpected_standard_completion
    )

    response = await provider.get_completion(
        model="gpt-5.4@@gpt-5-4-high-thinking",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert response == {"content": "reasoned"}


@pytest.mark.asyncio
async def test_openai_provider_routes_unknown_completion_to_standard_runtime(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_standard_completion(self, *args, **kwargs):
        _ = (self, args, kwargs)
        return {"content": "standard"}

    monkeypatch.setattr(OnlineLLMProvider, "get_completion", fake_standard_completion)

    response = await provider.get_completion(
        model="legacy-openai-model",
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
    monkeypatch.setattr(
        OnlineLLMProvider, "_stream_internal", unexpected_standard_stream
    )

    events = await _collect_events(
        provider._stream_internal(
            model="gpt-5.4@@gpt-5-4-high-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [type(event).__name__ for event in events] == ["ThinkingEvent", "ChunkEvent"]


@pytest.mark.asyncio
async def test_openai_provider_routes_unknown_stream_to_standard_runtime(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_standard_stream(self, *args, **kwargs):
        _ = (self, args, kwargs)
        yield ChunkEvent(content="fallback")

    monkeypatch.setattr(OnlineLLMProvider, "_stream_internal", fake_standard_stream)

    events = await _collect_events(
        provider._stream_internal(
            model="legacy-openai-model",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [event.content for event in events] == ["fallback"]


@pytest.mark.asyncio
async def test_openai_responses_runtime_emits_web_search_progress_events(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    class _FakeResponsesStream:
        def __aiter__(self):
            async def iterator():
                yield {
                    "type": "response.output_item.done",
                    "item": {
                        "type": "web_search_call",
                        "action": {
                            "type": "search",
                            "sources": [
                                {"url": "https://www.youtube.com/watch?v=1"},
                                {"url": "https://facebook.com/example"},
                            ],
                        },
                        "query": "quantivity",
                    },
                }
                yield {
                    "type": "response.completed",
                    "response": {
                        "output": [
                            {
                                "type": "message",
                                "content": [
                                    {
                                        "type": "output_text",
                                        "text": "done",
                                    }
                                ],
                            }
                        ],
                        "status": "completed",
                    },
                }

            return iterator()

    async def fake_aresponses(**_kwargs):
        return _FakeResponsesStream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "Search the web"}],
            native_web_search_enabled=True,
            request_id="req-openai-search-1",
        )
    )

    assert [type(event).__name__ for event in events] == [
        "WebSearchProgressEvent",
        "WebSearchProgressEvent",
    ]
    assert [event.text for event in events] == [
        "Searched youtube.com/watch",
        "Searched facebook.com/example",
    ]
    assert all(isinstance(event, WebSearchProgressEvent) for event in events)
    assert all(event.request_id == "req-openai-search-1" for event in events)


@pytest.mark.asyncio
async def test_openai_responses_runtime_emits_early_web_search_source_events(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    class _FakeResponsesStream:
        def __aiter__(self):
            async def iterator():
                yield {
                    "type": "response.web_search_call.searching",
                    "item_id": "web-search-call-1",
                    "query": "quantivity",
                    "sources": [
                        {"url": "https://home.cern/news/first-story"},
                    ],
                }
                yield {
                    "type": "response.web_search_call.in_progress",
                    "item_id": "web-search-call-1",
                    "query": "quantivity",
                    "sources": [
                        {"url": "https://home.cern/news/first-story"},
                        {
                            "url": "https://home.cern/news/second-story",
                            "title": "Second antimatter result",
                        },
                    ],
                }
                yield {
                    "type": "response.output_item.done",
                    "item": {
                        "type": "web_search_call",
                        "action": {
                            "type": "search",
                            "sources": [
                                {"url": "https://home.cern/news/first-story"},
                                {
                                    "url": "https://home.cern/news/second-story",
                                    "title": "Second antimatter result",
                                },
                            ],
                        },
                        "query": "quantivity",
                    },
                }
                yield {
                    "type": "response.completed",
                    "response": {
                        "output": [
                            {
                                "type": "message",
                                "content": [
                                    {
                                        "type": "output_text",
                                        "text": "done",
                                    }
                                ],
                            }
                        ],
                        "status": "completed",
                    },
                }

            return iterator()

    async def fake_aresponses(**_kwargs):
        return _FakeResponsesStream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "Search the web"}],
            native_web_search_enabled=True,
            request_id="req-openai-search-2",
        )
    )

    assert [type(event).__name__ for event in events] == [
        "WebSearchProgressEvent",
        "WebSearchProgressEvent",
    ]
    assert [event.text for event in events] == [
        "Searched home.cern/news/first-story",
        "Searched Second antimatter result (home.cern)",
    ]
    assert [event.url for event in events] == [
        "https://home.cern/news/first-story",
        "https://home.cern/news/second-story",
    ]
    assert all(event.request_id == "req-openai-search-2" for event in events)


@pytest.mark.asyncio
async def test_openai_responses_runtime_emits_searching_status_before_sources(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    class _FakeResponsesStream:
        def __aiter__(self):
            async def iterator():
                yield {
                    "type": "response.web_search_call.searching",
                    "item_id": "web-search-call-2",
                    "query": "history of arab",
                }
                yield {
                    "type": "response.completed",
                    "response": {
                        "output": [
                            {
                                "type": "message",
                                "content": [
                                    {
                                        "type": "output_text",
                                        "text": "done",
                                    }
                                ],
                            }
                        ],
                        "status": "completed",
                    },
                }

            return iterator()

    async def fake_aresponses(**_kwargs):
        return _FakeResponsesStream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "Search the web"}],
            native_web_search_enabled=True,
            request_id="req-openai-search-3",
        )
    )

    assert [type(event).__name__ for event in events] == ["WebSearchProgressEvent"]
    assert events[0].text == "Searching web for history of arab"
    assert events[0].request_id == "req-openai-search-3"


@pytest.mark.asyncio
async def test_openai_responses_runtime_dedupes_generic_searching_status(monkeypatch):
    provider = OpenAIProvider(api_key="test-key")

    class _FakeResponsesStream:
        def __aiter__(self):
            async def iterator():
                yield {
                    "type": "response.web_search_call.searching",
                    "item_id": "web-search-call-4",
                }
                yield {
                    "type": "response.web_search_call.searching",
                    "item_id": "web-search-call-5",
                }
                yield {
                    "type": "response.completed",
                    "response": {
                        "output": [
                            {
                                "type": "message",
                                "content": [
                                    {
                                        "type": "output_text",
                                        "text": "done",
                                    }
                                ],
                            }
                        ],
                        "status": "completed",
                    },
                }

            return iterator()

    async def fake_aresponses(**_kwargs):
        return _FakeResponsesStream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "Search the web"}],
            native_web_search_enabled=True,
            request_id="req-openai-search-4",
        )
    )

    assert [type(event).__name__ for event in events] == ["WebSearchProgressEvent"]
    assert events[0].text == "Searching web"
    assert events[0].request_id == "req-openai-search-4"


@pytest.mark.asyncio
async def test_openai_responses_runtime_accepts_incomplete_terminal_payload(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    class _FakeResponsesStream:
        def __aiter__(self):
            async def iterator():
                yield {
                    "type": "response.incomplete",
                    "response": {
                        "output": [
                            {
                                "type": "message",
                                "content": [
                                    {
                                        "type": "output_text",
                                        "text": "partial but valid",
                                    }
                                ],
                            }
                        ],
                        "status": "incomplete",
                    },
                }

            return iterator()

    async def fake_aresponses(**_kwargs):
        return _FakeResponsesStream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "Search the web"}],
            native_web_search_enabled=True,
        )
    )

    assert events == []
    assert provider.get_last_stream_response_payload() == {
        "content": "partial but valid",
        "finish_reason": "incomplete",
    }


@pytest.mark.asyncio
async def test_openai_responses_runtime_recovers_missing_final_payload_when_text_streamed(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.output_text.delta",
            "delta": "partial text",
            "response_id": "resp_123",
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [type(event).__name__ for event in events] == ["ChunkEvent"]
    assert events[0].content == "partial text"
    assert provider.get_last_stream_response_payload() == {
        "content": "partial text",
        "finish_reason": "incomplete",
        "response_id": "resp_123",
    }


@pytest.mark.asyncio
async def test_openai_responses_runtime_recovers_missing_final_payload_from_done_message(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.output_item.done",
            "response_id": "resp_456",
            "item": {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": "message from output item",
                    }
                ],
            },
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert events == []
    assert provider.get_last_stream_response_payload() == {
        "content": "message from output item",
        "finish_reason": "incomplete",
        "response_id": "resp_456",
    }


@pytest.mark.asyncio
async def test_openai_responses_runtime_recovers_missing_final_payload_from_function_call(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.output_item.added",
            "response_id": "resp_789",
            "output_index": 0,
            "item": {
                "type": "function_call",
                "call_id": "call_1",
                "name": "run_shell",
                "arguments": "",
            },
        }
        yield {
            "type": "response.function_call_arguments.delta",
            "output_index": 0,
            "delta": '{"cmd":',
        }
        yield {
            "type": "response.function_call_arguments.delta",
            "output_index": 0,
            "delta": '"pwd"}',
        }
        yield {
            "type": "response.output_item.done",
            "response_id": "resp_789",
            "output_index": 0,
            "item": {
                "type": "function_call",
                "call_id": "call_1",
                "name": "run_shell",
                "arguments": "",
            },
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "run_shell",
                        "parameters": {
                            "type": "object",
                            "properties": {"cmd": {"type": "string"}},
                        },
                    },
                }
            ],
        )
    )

    assert events == []
    assert provider.get_last_stream_response_payload() == {
        "content": "",
        "tool_calls": [
            {
                "id": "call_1",
                "name": "run_shell",
                "arguments": {"cmd": "pwd"},
            }
        ],
        "finish_reason": "incomplete",
        "response_id": "resp_789",
    }


@pytest.mark.asyncio
async def test_openai_responses_runtime_recovers_missing_final_payload_when_only_reasoning_streamed(
    monkeypatch,
    caplog,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.reasoning_text.delta",
            "delta": "thinking only",
            "response_id": "resp_999",
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )
    caplog.set_level(
        logging.WARNING,
        logger="backend.src.llm.providers.openai_responses_runtime",
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert [type(event).__name__ for event in events] == ["ThinkingEvent"]
    assert events[0].content == "thinking only"
    assert provider.get_last_stream_response_payload() == {
        "content": "",
        "finish_reason": "incomplete",
        "response_id": "resp_999",
    }
    assert "fallback=stream_content_without_output" in caplog.text
    assert "events=1" in caplog.text
    assert "event_types=response.reasoning_text.delta:1" in caplog.text
    assert "reasoning_events=1" in caplog.text
    assert "response_id=resp_999" in caplog.text


@pytest.mark.asyncio
async def test_openai_responses_runtime_emits_error_for_empty_stream(
    monkeypatch,
    caplog,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        if False:
            yield {}

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )
    caplog.set_level(
        logging.WARNING,
        logger="backend.src.llm.providers.openai_responses_runtime",
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert (
        events[0].content
        == "OpenAI Responses stream ended without final response payload"
    )
    assert events[0].metadata == {
        "provider": "openai",
        "model": "gpt-5.4@@gpt-5-4-none-thinking",
        "response_id": None,
        "error_kind": "empty_responses_stream",
        "retryable": False,
        "transient": False,
    }
    assert provider.get_last_stream_response_payload() is None
    assert "fallback=empty_stream" in caplog.text
    assert "events=0" in caplog.text
    assert "event_types=<none>" in caplog.text
    assert "last_event_type=<none>" in caplog.text


@pytest.mark.asyncio
async def test_openai_responses_runtime_logs_terminal_event_without_response(
    monkeypatch,
    caplog,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.completed",
            "response_id": "resp_missing",
            "sequence_number": 7,
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )
    caplog.set_level(
        logging.WARNING,
        logger="backend.src.llm.providers.openai_responses_runtime",
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert (
        events[0].content
        == "OpenAI Responses stream ended without final response payload"
    )
    assert events[0].metadata == {
        "provider": "openai",
        "model": "gpt-5.4@@gpt-5-4-none-thinking",
        "response_id": "resp_missing",
        "error_kind": "empty_responses_stream",
        "retryable": False,
        "transient": False,
    }
    assert provider.get_last_stream_response_payload() is None
    assert "fallback=empty_stream" in caplog.text
    assert "event_types=response.completed:1" in caplog.text
    assert "terminal_events=1" in caplog.text
    assert "terminal_with_response=0" in caplog.text
    assert "terminal_without_response=1" in caplog.text
    assert "last_event_keys=response_id,sequence_number,type" in caplog.text


@pytest.mark.asyncio
async def test_openai_responses_runtime_logs_sanitized_failure_event_details(
    monkeypatch,
    caplog,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "error",
            "code": "rate_limit_exceeded",
            "message": "request failed with sk-sensitive-token",
        }
        yield {
            "type": "response.failed",
            "response": {
                "id": "resp_failed",
                "status": "failed",
                "error": {
                    "type": "server_error",
                    "code": "upstream_failed",
                    "param": "stream",
                    "message": "upstream response stream closed early",
                },
            },
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )
    caplog.set_level(
        logging.WARNING,
        logger="backend.src.llm.providers.openai_responses_runtime",
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "event_types=error:1,response.failed:1" in caplog.text
    assert "failure_events=type=error" in caplog.text
    assert "event_code=rate_limit_exceeded" in caplog.text
    assert "event_message=request failed with sk-<redacted>" in caplog.text
    assert "type=response.failed" in caplog.text
    assert "response_id=resp_failed" in caplog.text
    assert "response_status=failed" in caplog.text
    assert "response_error_type=server_error" in caplog.text
    assert "response_error_code=upstream_failed" in caplog.text
    assert "response_error_param=stream" in caplog.text
    assert "response_error_message=upstream response stream closed early" in caplog.text
    assert "sk-sensitive-token" not in caplog.text

    event = events[0]
    assert event.content == "upstream response stream closed early"
    assert event.metadata is not None
    assert event.metadata["error_kind"] == "server_error"
    assert event.metadata["retryable"] is True
    assert event.metadata["transient"] is True
    assert event.metadata["provider_error_code"] == "upstream_failed"
    assert event.metadata["response_event_type"] == "response.failed"


@pytest.mark.asyncio
async def test_openai_responses_runtime_classifies_rate_limit_failure(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.failed",
            "response": {
                "id": "resp_rate_limited",
                "status": "failed",
                "error": {
                    "code": "rate_limit_exceeded",
                    "message": "Rate limit reached. Please try again in 11.054s.",
                },
            },
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert events[0].metadata is not None
    assert events[0].metadata["error_kind"] == "rate_limit"
    assert events[0].metadata["retryable"] is True
    assert events[0].metadata["transient"] is True
    assert events[0].metadata["retry_after_seconds"] == pytest.approx(11.054)


@pytest.mark.asyncio
async def test_openai_responses_runtime_classifies_context_length_failure(
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.failed",
            "response": {
                "id": "resp_context",
                "status": "failed",
                "error": {
                    "code": "context_length_exceeded",
                    "message": "Your input exceeds the context window.",
                },
            },
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert events[0].content.startswith("context_length_exceeded:")
    assert events[0].metadata is not None
    assert events[0].metadata["error_kind"] == "context_overflow"
    assert events[0].metadata["retryable"] is False
    assert events[0].metadata["transient"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "message", "error_kind"),
    [
        ("insufficient_quota", "You exceeded your current quota.", "quota"),
        ("invalid_api_key", "Invalid API key.", "auth"),
        ("invalid_prompt", "Invalid prompt.", "invalid_request"),
    ],
)
async def test_openai_responses_runtime_classifies_fatal_failures(
    code,
    message,
    error_kind,
    monkeypatch,
):
    provider = OpenAIProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "type": "response.failed",
            "response": {
                "id": "resp_fatal",
                "status": "failed",
                "error": {"code": code, "message": message},
            },
        }

    async def fake_aresponses(**_kwargs):
        return fake_stream()

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-none-thinking",
            messages=[{"role": "user", "content": "hi"}],
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert events[0].content == message
    assert events[0].metadata is not None
    assert events[0].metadata["error_kind"] == error_kind
    assert events[0].metadata["retryable"] is False
    assert events[0].metadata["transient"] is False


def test_openai_provider_build_request_params_preserves_browser_root_object_tool_schema():
    provider = OpenAIProvider(api_key="test-key")
    browser_parameters = build_browser_tool_parameters_schema()

    params = provider._build_request_params(
        "gpt-5.4@@gpt-5-4-none-thinking",
        [{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "name": "browser",
                "description": "Grouped browser control tool.",
                "parameters": browser_parameters,
            }
        ],
    )

    tool_parameters = params["tools"][0]["function"]["parameters"]
    assert tool_parameters["type"] == "object"
    assert tool_parameters == browser_parameters
    assert "oneOf" not in tool_parameters
    assert "anyOf" not in tool_parameters
    assert "action" in tool_parameters["properties"]
    assert "url" in tool_parameters["properties"]
    assert "query" in tool_parameters["properties"]
    assert "text" in tool_parameters["properties"]
    assert (
        "Action-specific field requirements are enforced by runtime validation."
        in tool_parameters["description"]
    )


def test_openai_responses_tools_preserve_browser_root_object_tool_schema():
    browser_parameters = build_browser_tool_parameters_schema()

    tools = build_openai_responses_tools(
        [
            {
                "type": "function",
                "name": "browser",
                "description": "Grouped browser control tool.",
                "parameters": browser_parameters,
            }
        ]
    )

    assert tools == [
        {
            "type": "function",
            "name": "browser",
            "description": "Grouped browser control tool.",
            "parameters": browser_parameters,
            "strict": False,
        }
    ]
    assert "oneOf" not in tools[0]["parameters"]


def test_openai_responses_tools_keeps_direct_function_tools_only():
    tools = build_openai_responses_tools(
        [
            {
                "type": "function",
                "name": "mouse_control",
                "description": "Control the mouse.",
                "parameters": {"type": "object"},
            },
            {
                "type": "function",
                "name": "browser",
                "parameters": {"type": "object"},
            },
        ]
    )

    assert tools == [
        {
            "type": "function",
            "name": "mouse_control",
            "description": "Control the mouse.",
            "parameters": {"type": "object", "properties": {}},
            "strict": False,
        },
        {
            "type": "function",
            "name": "browser",
            "description": None,
            "parameters": {"type": "object", "properties": {}},
            "strict": False,
        },
    ]


def test_openai_responses_tools_preserve_chat_shaped_function_tools():
    tools = build_openai_responses_tools(
        [
            {
                "type": "function",
                "function": {
                    "name": "click",
                    "description": "Click a coordinate.",
                    "parameters": {
                        "type": "object",
                        "properties": {"x": {"type": "integer"}},
                        "required": ["x"],
                    },
                    "strict": True,
                },
            }
        ]
    )

    assert tools == [
        {
            "type": "function",
            "name": "click",
            "description": "Click a coordinate.",
            "parameters": {
                "type": "object",
                "properties": {"x": {"type": "integer"}},
                "required": ["x"],
            },
            "strict": True,
        }
    ]


def test_openai_provider_build_request_params_preserves_plain_object_tool_schema():
    provider = OpenAIProvider(api_key="test-key")
    plain_parameters = {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    }

    params = provider._build_request_params(
        "gpt-5.4@@gpt-5-4-none-thinking",
        [{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "name": "read_file",
                "parameters": plain_parameters,
            }
        ],
    )

    assert params["tools"][0]["function"]["parameters"] == plain_parameters


def test_openai_provider_build_request_params_sets_original_image_detail():
    provider = OpenAIProvider(api_key="test-key")

    params = provider._build_request_params(
        "gpt-5.4@@gpt-5-4-none-thinking",
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Click the icon."},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/jpeg;base64,jpeg-b64"},
                    },
                ],
            }
        ],
    )

    assert params["messages"][0]["content"][1] == {
        "type": "image_url",
        "image_url": {
            "url": "data:image/jpeg;base64,jpeg-b64",
            "detail": "original",
        },
    }


def test_openai_transports_share_root_union_schema_compatibility():
    provider = OpenAIProvider(api_key="test-key")
    union_parameters = {
        "type": "object",
        "description": "Grouped tool with action-specific branches.",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["navigate", "search"],
            }
        },
        "required": ["action"],
        "oneOf": [
            {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["navigate"]},
                    "url": {"type": "string", "description": "URL to open."},
                },
            },
            {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["search"]},
                    "query": {"type": "string", "description": "Query to search."},
                },
            },
        ],
    }

    chat_params = provider._build_request_params(
        "gpt-5.4@@gpt-5-4-none-thinking",
        [{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "name": "test_tool",
                "description": "Tool with root union parameters.",
                "parameters": union_parameters,
            }
        ],
    )
    responses_tools = build_openai_responses_tools(
        [
            {
                "type": "function",
                "name": "test_tool",
                "description": "Tool with root union parameters.",
                "parameters": union_parameters,
            }
        ]
    )

    chat_parameters = chat_params["tools"][0]["function"]["parameters"]
    responses_parameters = responses_tools[0]["parameters"]

    assert chat_parameters == responses_parameters
    assert chat_parameters["type"] == "object"
    assert "oneOf" not in chat_parameters
    assert "url" in chat_parameters["properties"]
    assert "query" in chat_parameters["properties"]
    assert "runtime validation" in chat_parameters["description"]


def test_openai_reasoning_config_requires_explicit_reasoning_metadata():
    with pytest.raises(ValueError, match="requires explicit reasoning_mode metadata"):
        build_openai_reasoning_config("legacy-openai-model")


def test_openai_reasoning_config_accepts_gpt_5_5_presets():
    assert build_openai_reasoning_config("gpt-5.5@@gpt-5-5-none-thinking") == {
        "effort": "none",
        "summary": "detailed",
    }
    assert build_openai_reasoning_config("gpt-5.5@@gpt-5-5-extra-high-thinking") == {
        "effort": "xhigh",
        "summary": "detailed",
    }


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
                        "arguments": '{"action":"snapshot"}',
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

    monkeypatch.setattr(
        "backend.src.llm.providers.openai_responses_runtime.litellm.aresponses",
        fake_aresponses,
    )

    events = await _collect_events(
        stream_openai_responses_events(
            provider,
            model="gpt-5.4@@gpt-5-4-high-thinking",
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
            model="gpt-5.4@@gpt-5-4-high-thinking",
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


def test_build_openai_responses_input_accepts_normalized_assistant_tool_calls():
    messages = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Drag the circle into the square."},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "mouse_control",
                        "arguments": '{"action":"drag","x":100,"y":200}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_1",
            "content": "Dragged successfully.",
        },
    ]

    input_items = build_openai_responses_input(messages)

    assert input_items == [
        {
            "type": "message",
            "role": "system",
            "content": "You are helpful.",
        },
        {
            "type": "message",
            "role": "user",
            "content": "Drag the circle into the square.",
        },
        {
            "type": "function_call",
            "call_id": "call_1",
            "name": "mouse_control",
            "arguments": '{"action":"drag","x":100,"y":200}',
            "status": "completed",
        },
        {
            "type": "function_call_output",
            "call_id": "call_1",
            "output": "Dragged successfully.",
            "status": "completed",
        },
    ]


def test_build_openai_responses_input_preserves_tool_output_images():
    messages = [
        {
            "role": "assistant",
            "content": "Capturing screen.",
            "tool_calls": [
                {
                    "id": "call-shot",
                    "type": "function",
                    "function": {
                        "name": "screenshot",
                        "arguments": '{"explanation":"Inspect screen"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-shot",
            "content": [
                {"type": "text", "text": "Screenshot captured successfully."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/jpeg;base64,jpeg-b64"},
                },
            ],
        },
    ]

    input_items = build_openai_responses_input(messages)

    assert input_items[-1] == {
        "type": "function_call_output",
        "call_id": "call-shot",
        "output": [
            {"type": "input_text", "text": "Screenshot captured successfully."},
            {
                "type": "input_image",
                "image_url": "data:image/jpeg;base64,jpeg-b64",
                "detail": "original",
            },
        ],
        "status": "completed",
    }


def test_build_openai_responses_input_normalizes_assistant_history_to_output_text():
    messages = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "What happened?"},
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "I opened the window."},
                {"type": "refusal", "refusal": "I cannot access that credential."},
                {"type": "thinking", "text": "private reasoning"},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,ignored"},
                },
            ],
        },
    ]

    assert build_openai_responses_input(messages) == [
        {
            "type": "message",
            "role": "system",
            "content": "You are helpful.",
        },
        {
            "type": "message",
            "role": "user",
            "content": "What happened?",
        },
        {
            "type": "message",
            "role": "assistant",
            "content": [
                {"type": "output_text", "text": "I opened the window."},
                {"type": "refusal", "refusal": "I cannot access that credential."},
            ],
        },
    ]


def test_build_openai_responses_input_skips_assistant_messages_with_only_unsupported_blocks():
    messages = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Continue."},
        {
            "role": "assistant",
            "content": [
                {"type": "thinking", "text": "private reasoning"},
            ],
        },
    ]

    assert build_openai_responses_input(messages) == [
        {
            "type": "message",
            "role": "system",
            "content": "You are helpful.",
        },
        {
            "type": "message",
            "role": "user",
            "content": "Continue.",
        },
    ]


def test_build_openai_responses_input_requires_normalized_assistant_tool_calls():
    with pytest.raises(
        ValueError,
        match="requires provider-normalized assistant tool_calls",
    ):
        build_openai_responses_input(
            [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "comp_1",
                            "name": "computer",
                            "arguments": {
                                "actions": [{"type": "click", "x": 100, "y": 200}],
                            },
                        }
                    ],
                }
            ]
        )

    with pytest.raises(
        ValueError,
        match="function.name must be non-empty string",
    ):
        build_openai_responses_input(
            [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "comp_1",
                            "type": "function",
                            "function": {
                                "name": "",
                                "arguments": "{}",
                            },
                        }
                    ],
                }
            ]
        )

    with pytest.raises(
        ValueError,
        match="function.arguments must be string",
    ):
        build_openai_responses_input(
            [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "comp_1",
                            "type": "function",
                            "function": {
                                "name": "computer",
                                "arguments": {
                                    "actions": [{"type": "click", "x": 100, "y": 200}],
                                },
                            },
                        }
                    ],
                }
            ]
        )


def test_build_openai_responses_input_preserves_normalized_computer_calls_as_function_calls():
    messages = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Open the app."},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "comp_1",
                    "type": "function",
                    "function": {
                        "name": "computer",
                        "arguments": '{"actions":[{"type":"click","x":100,"y":200}]}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "comp_1",
            "name": "computer",
            "content": [
                {"type": "text", "text": "Bundle executed successfully."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,abc123"},
                },
            ],
        },
    ]

    assert build_openai_responses_input(messages) == [
        {
            "type": "message",
            "role": "system",
            "content": "You are helpful.",
        },
        {
            "type": "message",
            "role": "user",
            "content": "Open the app.",
        },
        {
            "type": "function_call",
            "call_id": "comp_1",
            "name": "computer",
            "arguments": '{"actions":[{"type":"click","x":100,"y":200}]}',
            "status": "completed",
        },
        {
            "type": "function_call_output",
            "call_id": "comp_1",
            "output": [
                {"type": "input_text", "text": "Bundle executed successfully."},
                {
                    "type": "input_image",
                    "image_url": "data:image/png;base64,abc123",
                    "detail": "original",
                },
            ],
            "status": "completed",
        },
    ]


def test_build_openai_responses_input_uses_trailing_tool_outputs_for_previous_response():
    messages = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Open the app."},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "comp_1",
                    "name": "computer",
                    "arguments": {
                        "actions": [{"type": "click", "x": 100, "y": 200}],
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "comp_1",
            "name": "computer",
            "content": [
                {"type": "text", "text": "Bundle executed successfully."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,abc123"},
                },
            ],
        },
    ]

    assert build_openai_responses_input(
        messages,
        previous_response_id="resp_123",
    ) == [
        {
            "type": "function_call_output",
            "call_id": "comp_1",
            "output": [
                {"type": "input_text", "text": "Bundle executed successfully."},
                {
                    "type": "input_image",
                    "image_url": "data:image/png;base64,abc123",
                    "detail": "original",
                },
            ],
            "status": "completed",
        }
    ]


def test_normalize_openai_responses_payload_ignores_unsupported_output_items():
    provider = OpenAIProvider(api_key="test-key")

    payload = normalize_openai_responses_payload(
        provider,
        {
            "id": "resp_123",
            "output": [
                {
                    "type": "unsupported_tool_item",
                    "call_id": "comp_1",
                    "actions": [{"type": "click", "x": 100, "y": 200}],
                }
            ],
            "status": "completed",
        },
        model="gpt-5.4@@gpt-5-4-none-thinking",
    )

    assert payload == {
        "content": "",
        "finish_reason": "completed",
        "response_id": "resp_123",
    }


def test_normalize_openai_responses_payload_preserves_refusal_text():
    provider = OpenAIProvider(api_key="test-key")

    payload = normalize_openai_responses_payload(
        provider,
        {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {"type": "output_text", "text": "I cannot do that. "},
                        {"type": "refusal", "refusal": "This request is disallowed."},
                    ],
                }
            ],
            "status": "completed",
        },
        model="gpt-5.4@@gpt-5-4-none-thinking",
    )

    assert payload["content"] == "I cannot do that. This request is disallowed."
    assert payload["finish_reason"] == "completed"


def test_normalize_openai_responses_payload_rejects_missing_tool_call_id():
    provider = OpenAIProvider(api_key="test-key")

    with pytest.raises(LLMAPIError, match="missing Responses API tool-call id"):
        normalize_openai_responses_payload(
            provider,
            {
                "output": [
                    {
                        "type": "function_call",
                        "name": "read_file",
                        "arguments": '{"path":"/tmp/demo.txt"}',
                    }
                ],
                "status": "requires_action",
            },
            model="gpt-5.4@@gpt-5-4-none-thinking",
        )


def test_extract_openai_web_search_sources_dedupes_urls_and_preserves_query_order():
    response = {
        "output": [
            {
                "type": "web_search_call",
                "query": "latest project alpha news",
                "action": {
                    "sources": [
                        {"url": "https://example.com/a", "title": "Example A"},
                        {"url": "https://example.com/a", "title": "Duplicate A"},
                        {"url": "https://example.com/b", "title": "Example B"},
                    ]
                },
            },
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": "visible text",
                        "annotations": [
                            {"url": "https://example.com/b", "title": "Duplicate B"},
                            {"url": "https://example.com/c", "title": "Example C"},
                        ],
                    }
                ],
            },
        ]
    }

    assert extract_openai_web_search_sources(response) == [
        {
            "url": "https://example.com/a",
            "title": "Example A",
            "provider": "openai",
            "query": "latest project alpha news",
            "rank": 1,
        },
        {
            "url": "https://example.com/b",
            "title": "Example B",
            "provider": "openai",
            "query": "latest project alpha news",
            "rank": 3,
        },
        {
            "url": "https://example.com/c",
            "title": "Example C",
            "provider": "openai",
        },
    ]
