"""Tests for conversation history compaction engine."""

from __future__ import annotations

from types import SimpleNamespace

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
    def __init__(self) -> None:
        self.calls = []

    async def get_completion(self, model, messages, **request_kwargs):
        self.calls.append(
            {
                "model": model,
                "messages": messages,
                "request_kwargs": request_kwargs,
            }
        )
        return "Compacted summary"

    async def get_completion_response(self, model, messages, **request_kwargs):
        content = await self.get_completion(model, messages, **request_kwargs)
        return {"content": content}

    async def get_completion_stream(self, model, messages, **request_kwargs):
        _ = (model, messages, request_kwargs)
        if False:
            yield ErrorEvent(content="unused")

    def supports_streaming_tool_turns(self, model):
        _ = model
        return False


class _FakeSession:
    def __init__(self, cfg: AppConfig, history: ConversationHistory):
        self.cfg = cfg
        self.history = history
        self.llm_client = _FakeLLMClient()
        self.prompt_builder = SimpleNamespace(
            get_prompt_token_count=lambda stored_messages, model_id: (
                len(stored_messages.get_history()) * 100
            )
        )


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
    history = ConversationHistory()
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
    history = ConversationHistory()
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
    assert session.llm_client.calls[0]["request_kwargs"]["max_output_tokens"] == (
        cfg.history_compaction_summary_max_tokens
    )


def test_executor_summary_preview_keeps_full_text():
    from backend.src.agent.execution.executor import AgentExecutor

    long_summary = "summary-" + ("x" * 300)

    assert AgentExecutor._build_summary_preview(long_summary) == long_summary


def test_token_service_uses_catalog_context_window_for_windieos_preset_id():
    token_service = token_service_module.get_token_service()

    assert (
        token_service.get_model_max_input_tokens(
            "openai/gpt-5.4@@gpt-5-4-medium-thinking"
        )
        == 400000
    )


@pytest.mark.asyncio
async def test_compaction_engine_manual_force_compacts_short_history(monkeypatch):
    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _FakeTokenService(),
    )
    history = ConversationHistory()
    history.add_user_message("single user turn")
    history.add_assistant_message("single assistant turn")
    cfg = AppConfig(
        history_compaction_enabled=False,
        history_compaction_manual_enabled=True,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="manual", force=True)
    assert decision.should_compact is True
    result = await engine.compact(reason="manual", decision=decision)

    assert result.applied is True
    assert result.skip_reason is None
    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].message_type == MessageType.CONTEXT_COMPACTION
    assert "Compacted summary" in stored[0].content


@pytest.mark.asyncio
async def test_compaction_engine_allows_repeated_compaction_above_threshold(
    monkeypatch,
):
    class _RepeatCompactionTokenService:
        def count_tokens(self, messages, model):
            _ = model
            return len(messages) * 300

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 150

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _RepeatCompactionTokenService(),
    )
    history = ConversationHistory()
    for _ in range(6):
        _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=2048,
    )
    session = _FakeSession(cfg=cfg, history=history)
    session.prompt_builder = SimpleNamespace(
        get_prompt_token_count=lambda stored_messages, model_id: 3000
    )
    engine = CompactionEngine(session)

    first_decision = engine.evaluate(reason="auto-mid")
    assert first_decision.should_compact is True
    first_result = await engine.compact(reason="auto-mid", decision=first_decision)
    assert first_result.applied is True

    second_decision = engine.evaluate(reason="auto-mid")
    assert second_decision.should_compact is True
    assert second_decision.skip_reason is None


@pytest.mark.asyncio
async def test_compaction_engine_moves_retained_tail_under_target_budget(monkeypatch):
    class _BudgetTokenService:
        def count_tokens(self, messages, model):
            _ = model
            return len(messages) * 400

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 0

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _BudgetTokenService(),
    )
    monkeypatch.setattr(
        compaction_engine_module,
        "get_token_service",
        lambda: _BudgetTokenService(),
    )
    history = ConversationHistory()
    for index in range(5):
        history.add_user_message(f"user {index}")
        history.add_assistant_message(f"assistant {index}")
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=2048,
        history_compaction_keep_recent_user_messages=3,
        history_compaction_target_tokens=1200,
        history_compaction_summary_max_tokens=200,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="auto-mid", force=True)
    result = await engine.compact(reason="auto-mid", decision=decision)

    assert result.applied is True
    stored = history.get_stored_messages()
    assert len(stored) == 3
    assert stored[0].message_type == MessageType.CONTEXT_COMPACTION
    assert [message.content for message in stored[1:]] == ["user 4", "assistant 4"]
    assert result.after_tokens == 300


@pytest.mark.asyncio
async def test_compaction_engine_truncates_oversized_single_tail_message(monkeypatch):
    class _OversizedTailTokenService:
        def count_tokens(self, messages, model):
            _ = model
            total = 0
            for message in messages:
                total += len(str(message.get("content", ""))) // 4
            return total

        def count_message_tokens(self, message, model):
            _ = model
            return len(str(message.get("content", ""))) // 4

        def truncate_text(self, text, *, model, token_limit, marker):
            _ = model
            original_tokens = len(text) // 4
            if original_tokens <= token_limit:
                return text, original_tokens, False, "test"
            return f"{text[: token_limit * 4]}{marker}", original_tokens, True, "test"

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _OversizedTailTokenService(),
    )
    monkeypatch.setattr(
        compaction_engine_module,
        "get_token_service",
        lambda: _OversizedTailTokenService(),
    )
    history = ConversationHistory()
    history.add_user_message("old user")
    history.add_assistant_message("old assistant")
    history.add_user_message("x" * 6000)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=2048,
        history_compaction_keep_recent_user_messages=1,
        history_compaction_target_tokens=1200,
        history_compaction_summary_max_tokens=200,
    )
    session = _FakeSession(cfg=cfg, history=history)
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="overflow-retry", force=True)
    result = await engine.compact(reason="overflow-retry", decision=decision)

    assert result.applied is True
    stored = history.get_stored_messages()
    assert len(stored) == 2
    assert stored[-1].content.endswith("[[TRUNCATED DURING CONTEXT COMPACTION]]\n\n")
    assert stored[-1].compaction_facts == {"context_compaction_truncated": True}


@pytest.mark.asyncio
async def test_compaction_engine_uses_model_context_window_for_auto_trigger(
    monkeypatch,
):
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
    history = ConversationHistory()
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
    history = ConversationHistory()
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


@pytest.mark.asyncio
async def test_compaction_engine_uses_model_window_ratio_not_target_as_auto_trigger(
    monkeypatch,
):
    class _LargeWindowTokenService:
        def count_tokens(self, messages, model):
            _ = (messages, model)
            return 0

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 0

        def get_model_max_input_tokens(self, model):
            _ = model
            return 400000

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _LargeWindowTokenService(),
    )
    monkeypatch.setattr(
        compaction_engine_module,
        "get_token_service",
        lambda: _LargeWindowTokenService(),
    )
    history = ConversationHistory()
    _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=None,
        history_compaction_target_tokens=60000,
    )
    session = _FakeSession(cfg=cfg, history=history)
    prompt_count = {"value": 61000}
    session.prompt_builder = SimpleNamespace(
        get_prompt_token_count=lambda stored_messages, model_id: prompt_count["value"]
    )
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="auto-mid")
    assert decision.should_compact is False
    assert decision.before_tokens == 61000
    assert decision.skip_reason == "below-threshold"

    prompt_count["value"] = 360000
    decision = engine.evaluate(reason="auto-mid")

    assert decision.should_compact is True
    assert decision.before_tokens == 360000


def test_compaction_engine_uses_provider_prompt_high_water_for_next_decision(
    monkeypatch,
):
    class _SmallLocalTokenService:
        def count_tokens(self, messages, model):
            _ = (messages, model)
            return 0

        def count_message_tokens(self, message, model):
            _ = (message, model)
            return 0

        def get_model_max_input_tokens(self, model):
            _ = model
            return 400000

    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _SmallLocalTokenService(),
    )
    monkeypatch.setattr(
        compaction_engine_module,
        "get_token_service",
        lambda: _SmallLocalTokenService(),
    )
    history = ConversationHistory()
    _seed_history(history)
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=None,
        history_compaction_target_tokens=60000,
    )
    session = _FakeSession(cfg=cfg, history=history)
    session.prompt_builder = SimpleNamespace(
        get_prompt_token_count=lambda stored_messages, model_id: 1000
    )
    engine = CompactionEngine(session)

    engine.record_provider_prompt_tokens(361000)
    decision = engine.evaluate(reason="auto-mid")

    assert decision.should_compact is True
    assert decision.before_tokens == 361000


def test_compaction_engine_counts_contextual_prompt_messages(monkeypatch):
    monkeypatch.setattr(
        token_service_module,
        "get_token_service",
        lambda: _FakeTokenService(),
    )
    history = ConversationHistory(system_prompt="system")
    history.add_user_message("user one")
    cfg = AppConfig(
        history_compaction_enabled=True,
        history_compaction_trigger_tokens=2048,
    )
    session = _FakeSession(cfg=cfg, history=history)
    session.prompt_builder = SimpleNamespace(
        get_prompt_token_count=lambda stored_messages, model_id: 2100
    )
    engine = CompactionEngine(session)

    decision = engine.evaluate(reason="auto-pre")

    assert decision.should_compact is True
    assert decision.before_tokens == 2100
