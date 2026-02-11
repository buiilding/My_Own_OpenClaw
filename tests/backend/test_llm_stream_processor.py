"""Tests for LLMStreamProcessor cache diagnostics logging."""

import logging

import pytest

from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
from backend.src.core.events.streaming_events import ChunkEvent, FullResponseEvent, TokenCountEvent


class _FakeTokenService:
    def count_tokens(self, messages, model):
        # Keep deterministic and cheap for tests.
        return len(list(messages))


class _FakeHistory:
    def get_token_count(self, model_id):
        return 7


class _FakeConfig:
    selected_model_id = "gpt-test"


class _FakeSession:
    cfg = _FakeConfig()
    history = _FakeHistory()
    session_id = "session-test"


class _FakeLLMClient:
    def __init__(self):
        self._turn = 0

    async def get_completion_stream(self, model, messages):
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
            "total_tokens": 264,
            "reason": None,
        }


@pytest.mark.asyncio
async def test_logs_cache_hint_and_provider_cache_diagnostics(caplog, monkeypatch):
    monkeypatch.setattr(
        "backend.src.agent.llm.llm_stream_processor.get_token_service",
        lambda: _FakeTokenService(),
    )

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
