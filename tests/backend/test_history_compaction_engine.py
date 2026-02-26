"""Tests for conversation history compaction engine."""

from __future__ import annotations

import pytest

import backend.src.services.token_service as token_service_module
import backend.src.agent.compaction.engine as compaction_engine_module
from backend.src.agent.compaction.engine import CompactionEngine
from backend.src.agent.session.state import ConversationHistory
from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import ErrorEvent
from backend.src.core.types.enums import MessageType
from backend.src.llm.client import LLMClient


class _FakeTokenService:
    def count_tokens(self, messages, model):
        _ = model
        return len(messages) * 100

    def count_message_tokens(self, message, model):
        _ = (message, model)
        return 50


class _FakeLLMClient(LLMClient):
    async def get_completion(self, model, messages, **request_kwargs):
        _ = (model, messages, request_kwargs)
        return "Compacted summary"

    async def get_completion_stream(self, model, messages, **request_kwargs):
        _ = (model, messages, request_kwargs)
        if False:
            yield ErrorEvent(content="unused")


class _FakeSession:
    def __init__(self, cfg: AppConfig, history: ConversationHistory):
        self.cfg = cfg
        self.history = history
        self.llm_client = _FakeLLMClient()


def _seed_history(history: ConversationHistory) -> None:
    history.add_user_message("user one")
    history.add_assistant_message("assistant one")
    history.add_user_message("user two")
    history.add_assistant_message("assistant two")


@pytest.mark.asyncio
async def test_compaction_engine_skips_when_auto_compaction_disabled(monkeypatch):
    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _FakeTokenService(),
    )
    history = ConversationHistory(max_length=200)
    _seed_history(history)
    cfg = AppConfig(history_compaction_enabled=False)
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="auto-pre", pending_user_content="next user")
    assert decision.should_compact is False
    assert decision.skip_reason == "disabled"

    result = await engine.compact(reason="auto-pre", decision=decision)
    assert result.applied is False
    assert result.skip_reason == "disabled"


@pytest.mark.asyncio
async def test_compaction_engine_manual_force_replaces_history(monkeypatch):
    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _FakeTokenService(),
    )
    history = ConversationHistory(max_length=200)
    _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=False,
        history_compaction_manual_enabled=True,
        history_compaction_keep_recent_user_messages=1,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="manual", force=True)
    assert decision.should_compact is True
    result = await engine.compact(reason="manual", decision=decision)

    assert result.applied is True
    assert result.removed_messages > 0
    stored = history.get_stored_messages()
    assert stored[0].message_type == MessageType.CONTEXT_COMPACTION
    assert "Compacted summary" in stored[0].content


@pytest.mark.asyncio
async def test_compaction_engine_respects_cooldown(monkeypatch):
    class _CooldownTokenService:
        def count_tokens(self, messages, model):
            _ = model
            return len(messages) * 300

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 150

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _CooldownTokenService(),
    )
    history = ConversationHistory(max_length=200)
    for _ in range(6):
        _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=2048,
        history_compaction_cooldown_turns=1,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    first_decision = engine.evaluate(reason="auto-mid")
    assert first_decision.should_compact is True
    first_result = await engine.compact(reason="auto-mid", decision=first_decision)
    assert first_result.applied is True

    second_decision = engine.evaluate(reason="auto-mid")
    assert second_decision.should_compact is False
    assert second_decision.skip_reason == "cooldown"


@pytest.mark.asyncio
async def test_compaction_engine_uses_model_context_window_for_auto_trigger(monkeypatch):
    class _DynamicThresholdTokenService:
        def count_tokens(self, messages, model):
            _ = model
            return len(messages) * 100

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 0

        def get_model_max_input_tokens(self, model):
            _ = model
            return 5000

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _DynamicThresholdTokenService(),
    )
    monkeypatch.setattr(
        compaction_engine_module,
        "get_token_service",
        lambda: _DynamicThresholdTokenService(),
    )
    history = ConversationHistory(max_length=500)
    for _ in range(12):
        _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=None,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="auto-pre")
    # 12 seed loops = 48 messages => ~4800 tokens, over 90% of 5000 (4500).
    assert decision.should_compact is True


@pytest.mark.asyncio
async def test_compaction_engine_skips_when_dynamic_threshold_not_reached(monkeypatch):
    class _DynamicThresholdTokenService:
        def count_tokens(self, messages, model):
            _ = model
            return len(messages) * 100

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 0

        def get_model_max_input_tokens(self, model):
            _ = model
            return 10000

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _DynamicThresholdTokenService(),
    )
    monkeypatch.setattr(
        compaction_engine_module,
        "get_token_service",
        lambda: _DynamicThresholdTokenService(),
    )
    history = ConversationHistory(max_length=500)
    for _ in range(12):
        _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=None,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="auto-pre")
    assert decision.should_compact is False
    assert decision.skip_reason == "below-threshold"
