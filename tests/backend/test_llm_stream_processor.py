"""Tests for LLMStreamProcessor cache diagnostics logging."""

import logging

import pytest

from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    ThinkingEvent,
    TokenCountEvent,
)
from backend.src.core.infrastructure.exceptions import LLMAPIError


class _FakeTokenService:
    def count_tokens(self, messages, model):
        # Keep deterministic and cheap for tests.
        return len(list(messages))


class _FakeHistory:
    def get_token_count(self, model_id):
        return 7


class _FakeConfig:
    selected_model_id = "gpt-test"
    model_provider = "openai"


class _FakeSession:
    cfg = _FakeConfig()
    history = _FakeHistory()
    session_id = "session-test"


class _KimiConfig:
    selected_model_id = "k2p5"
    model_provider = "kimi-coding"


class _KimiSession:
    cfg = _KimiConfig()
    history = _FakeHistory()
    session_id = "session-kimi"
    runtime = None


class _KimiRuntime:
    active_conversation_ref = "conv-kimi"


class _KimiSessionWithConversationRef:
    cfg = _KimiConfig()
    history = _FakeHistory()
    session_id = "session-kimi"
    runtime = _KimiRuntime()


class _GeminiConfig:
    selected_model_id = "gemini-3.1-pro-preview"
    model_provider = "gemini"


class _GeminiSession:
    cfg = _GeminiConfig()
    history = _FakeHistory()
    session_id = "session-gemini"
    runtime = None


class _FakeLLMClient:
    def __init__(self):
        self._turn = 0

    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        self._turn += 1
        yield ChunkEvent(content=f"resp-{self._turn}")

    def get_last_stream_cache_diagnostics(self):
        if self._turn == 2:
            return {
                "model": "gpt-test",
                "status": "hit",
                "cache_hit": True,
                "cached_tokens": 128,
                "prompt_tokens": 256,
                "completion_tokens": 8,
                "thinking_tokens": None,
                "total_tokens": 264,
                "reason": None,
            }
        return {
            "model": "gpt-test",
            "status": "miss",
            "cache_hit": False,
            "cached_tokens": 0,
            "prompt_tokens": 256,
            "completion_tokens": 8,
            "thinking_tokens": None,
            "total_tokens": 264,
            "reason": None,
        }


class _UnsupportedEventLLMClient:
    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        yield {"event": "unsupported"}

    def get_last_stream_cache_diagnostics(self):
        return None


class _Api520LLMClient:
    async def get_completion_response(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        raise LLMAPIError(
            "Kimi Coding upstream service is temporarily unavailable (HTTP 520). Please retry.",
            model=model,
            status_code=520,
        )

    def get_last_stream_cache_diagnostics(self):
        return None


class _ProviderUsageLLMClient:
    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        yield ChunkEvent(content="visible")

    def get_last_stream_cache_diagnostics(self):
        return {
            "model": "gpt-test",
            "status": "hit",
            "cache_hit": True,
            "cached_tokens": 24,
            "prompt_tokens": 50,
            "completion_tokens": 20,
            "thinking_tokens": 9,
            "total_tokens": 70,
            "reason": None,
        }


class _MissingUsageLLMClient:
    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        yield ChunkEvent(content="visible")

    def get_last_stream_cache_diagnostics(self):
        return None


class _KimiToolCompletionLLMClient:
    def __init__(self):
        self.last_prompt_cache_key = None

    async def get_completion_response(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        self.last_prompt_cache_key = prompt_cache_key
        return {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "name": "read_file",
                    "arguments": {"path": "/tmp/demo.txt"},
                }
            ],
            "finish_reason": "tool_calls",
        }

    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        raise AssertionError("Tool turns should use non-stream completion path")

    def get_last_stream_cache_diagnostics(self):
        return None

    def supports_streaming_tool_turns(self, model):
        _ = model
        return False


class _KimiStreamingToolTurnLLMClient:
    def __init__(self):
        self._payload = {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "name": "read_file",
                    "arguments": {"path": "/tmp/demo.txt"},
                }
            ],
            "finish_reason": "tool_calls",
        }
        self.last_prompt_cache_key = None

    async def get_completion_response(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        raise AssertionError("Tool turns should stay on stream path when supported")

    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        _ = (model, messages, tools, tool_choice, parallel_tool_calls)
        self.last_prompt_cache_key = prompt_cache_key
        yield ThinkingEvent(content="thinking...")

    def get_last_stream_cache_diagnostics(self):
        return None

    def get_last_stream_response_payload(self):
        return dict(self._payload)

    def supports_streaming_tool_turns(self, model):
        _ = model
        return True


class _GeminiStreamingToolTurnLLMClient:
    def __init__(self):
        self._payload = {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_gemini_1",
                    "name": "read_file",
                    "arguments": {"path": "/tmp/gemini.txt"},
                }
            ],
            "finish_reason": "tool_calls",
        }

    async def get_completion_response(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        _ = (model, messages, tools, tool_choice, parallel_tool_calls, prompt_cache_key)
        raise AssertionError("Gemini tool turns should stay on stream path when supported")

    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        _ = (model, messages, tools, tool_choice, parallel_tool_calls, prompt_cache_key)
        yield ThinkingEvent(content="gemini-thinking...")

    def get_last_stream_cache_diagnostics(self):
        return None

    def get_last_stream_response_payload(self):
        return dict(self._payload)

    def supports_streaming_tool_turns(self, model):
        _ = model
        return True


def _patch_fake_token_service(monkeypatch):
    monkeypatch.setattr(
        "backend.src.agent.llm.llm_stream_processor.get_token_service",
        lambda: _FakeTokenService(),
    )


def _hello_prompt():
    return [{"role": "user", "content": "hello"}]


def _single_function_tool(name: str):
    return [{"type": "function", "function": {"name": name, "parameters": {"type": "object"}}}]


async def _collect_response_events(processor, *, tools=None):
    return [
        event
        async for event in processor.get_response(
            _hello_prompt(),
            tools=tools,
        )
    ]


@pytest.mark.asyncio
async def test_logs_cache_hint_and_provider_cache_diagnostics(caplog, monkeypatch):
    _patch_fake_token_service(monkeypatch)

    processor = LLMStreamProcessor(llm_client=_FakeLLMClient(), session=_FakeSession())
    caplog.set_level(logging.INFO)

    prompt_cold = [{"role": "user", "content": "hello"}]
    prompt_append = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "world"},
    ]
    prompt_mutated = [
        {"role": "user", "content": "HELLO CHANGED"},
        {"role": "assistant", "content": "world"},
    ]

    first_events = [event async for event in processor.get_response(prompt_cold)]
    second_events = [event async for event in processor.get_response(prompt_append)]
    third_events = [event async for event in processor.get_response(prompt_mutated)]

    for events in (first_events, second_events, third_events):
        assert any(isinstance(event, FullResponseEvent) for event in events)
        assert any(isinstance(event, TokenCountEvent) for event in events)

    log_text = caplog.text
    assert "status=cold_start" in log_text
    assert "status=append_only" in log_text
    assert "status=prefix_mutated" in log_text
    assert "[Provider Cache]" in log_text
    assert "cached_tokens=128" in log_text


@pytest.mark.asyncio
async def test_rejects_unsupported_stream_event_types(monkeypatch):
    _patch_fake_token_service(monkeypatch)

    processor = LLMStreamProcessor(
        llm_client=_UnsupportedEventLLMClient(),
        session=_FakeSession(),
    )

    events = []
    with pytest.raises(TypeError, match="Unsupported stream event type"):
        async for event in processor.get_response(_hello_prompt()):
            events.append(event)

    assert any(isinstance(event, ErrorEvent) for event in events)


@pytest.mark.asyncio
async def test_maps_http_520_api_error_to_retry_friendly_error_event(monkeypatch):
    _patch_fake_token_service(monkeypatch)

    processor = LLMStreamProcessor(llm_client=_Api520LLMClient(), session=_FakeSession())
    events = []

    with pytest.raises(LLMAPIError, match="HTTP 520"):
        async for event in processor.get_response(
            _hello_prompt(),
            tools=_single_function_tool("noop"),
        ):
            events.append(event)

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert events[0].content == "Kimi Coding is temporarily unavailable (HTTP 520). Please retry shortly."


@pytest.mark.asyncio
async def test_token_count_prefers_provider_usage_and_reasoning_tokens(monkeypatch):
    _patch_fake_token_service(monkeypatch)
    processor = LLMStreamProcessor(
        llm_client=_ProviderUsageLLMClient(),
        session=_FakeSession(),
    )

    events = await _collect_response_events(processor)
    token_event = next(event for event in events if isinstance(event, TokenCountEvent))

    assert token_event.prompt_tokens == 50
    assert token_event.visible_output_tokens == 1
    assert token_event.thinking_tokens == 9
    assert token_event.output_tokens_total == 20
    assert token_event.total_tokens == 70
    assert token_event.usage_source == "provider"
    assert token_event.cached_tokens == 24
    assert token_event.cache_hit is True
    assert token_event.cache_status == "hit"


@pytest.mark.asyncio
async def test_token_count_falls_back_to_estimate_when_provider_usage_missing(monkeypatch):
    _patch_fake_token_service(monkeypatch)
    processor = LLMStreamProcessor(
        llm_client=_MissingUsageLLMClient(),
        session=_FakeSession(),
    )

    events = await _collect_response_events(processor)
    token_event = next(event for event in events if isinstance(event, TokenCountEvent))

    assert token_event.prompt_tokens == 1
    assert token_event.visible_output_tokens == 1
    assert token_event.thinking_tokens is None
    assert token_event.output_tokens_total == 1
    assert token_event.total_tokens == 2
    assert token_event.usage_source == "estimated"
    assert token_event.cached_tokens is None
    assert token_event.cache_hit is None
    assert token_event.cache_status is None


@pytest.mark.asyncio
async def test_kimi_uses_non_stream_completion_when_tools_present_if_streaming_unsupported(monkeypatch):
    _patch_fake_token_service(monkeypatch)
    llm_client = _KimiToolCompletionLLMClient()
    processor = LLMStreamProcessor(
        llm_client=llm_client,
        session=_KimiSession(),
    )

    events = await _collect_response_events(
        processor,
        tools=_single_function_tool("read_file"),
    )
    assert not any(isinstance(event, ChunkEvent) for event in events)
    payload = processor.get_last_response_payload()
    assert payload is not None
    assert payload["content"] == ""
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"][0]["id"] == "call_1"
    assert llm_client.last_prompt_cache_key == "session-kimi"


@pytest.mark.asyncio
async def test_kimi_streams_thinking_when_tools_present_if_streaming_supported(monkeypatch):
    _patch_fake_token_service(monkeypatch)
    processor = LLMStreamProcessor(
        llm_client=_KimiStreamingToolTurnLLMClient(),
        session=_KimiSession(),
    )

    events = await _collect_response_events(
        processor,
        tools=_single_function_tool("read_file"),
    )

    assert any(isinstance(event, ThinkingEvent) for event in events)
    payload = processor.get_last_response_payload()
    assert payload is not None
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"][0]["id"] == "call_1"
    assert processor.llm_client.last_prompt_cache_key == "session-kimi"


@pytest.mark.asyncio
async def test_kimi_prefers_conversation_ref_for_prompt_cache_key(monkeypatch):
    _patch_fake_token_service(monkeypatch)
    llm_client = _KimiToolCompletionLLMClient()
    processor = LLMStreamProcessor(
        llm_client=llm_client,
        session=_KimiSessionWithConversationRef(),
    )

    _ = await _collect_response_events(
        processor,
        tools=_single_function_tool("read_file"),
    )

    assert llm_client.last_prompt_cache_key == "conv-kimi"


@pytest.mark.asyncio
async def test_gemini_streams_thinking_when_tools_present_if_streaming_supported(monkeypatch):
    _patch_fake_token_service(monkeypatch)
    processor = LLMStreamProcessor(
        llm_client=_GeminiStreamingToolTurnLLMClient(),
        session=_GeminiSession(),
    )

    events = await _collect_response_events(
        processor,
        tools=_single_function_tool("read_file"),
    )

    assert any(
        isinstance(event, ThinkingEvent) and event.content == "gemini-thinking..."
        for event in events
    )
    payload = processor.get_last_response_payload()
    assert payload is not None
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"][0]["id"] == "call_gemini_1"
