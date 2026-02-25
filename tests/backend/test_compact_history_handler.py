"""Tests for manual compact-history handler."""

from __future__ import annotations

import pytest

from backend.src.agent.compaction.models import CompactionDecision, CompactionResult
from backend.src.api.handlers.compact_history import CompactHistoryHandler
from backend.src.api.schema import CompactHistoryMessage


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent = []

    async def send_json(self, data, mode="text"):
        _ = mode
        self.sent.append(data)


class _FakeRuntime:
    active_conversation_ref = "conv_test"


class _FakeSession:
    def __init__(self, decision: CompactionDecision, result: CompactionResult):
        self.session_id = "session_test"
        self.runtime = _FakeRuntime()
        self._decision = decision
        self._result = result

    async def run_history_compaction(self, *, reason: str, force: bool = False):
        _ = (reason, force)
        return self._decision, self._result


class _FakeSessionManager:
    def __init__(self, *, has_active_query: bool, session: _FakeSession):
        self._has_active_query = has_active_query
        self._session = session

    def has_active_query_task(self, user_id: str) -> bool:
        _ = user_id
        return self._has_active_query

    async def get_or_create_session(self, user_id: str):
        _ = user_id
        return self._session


@pytest.mark.asyncio
async def test_compact_history_handler_rejects_when_query_is_active():
    decision = CompactionDecision(
        should_compact=False,
        reason="manual",
        strategy_name="inline",
        before_tokens=100,
        projected_tokens=100,
        user_turn_index=1,
        skip_reason="disabled",
    )
    result = CompactionResult(
        applied=False,
        reason="manual",
        strategy_name="inline",
        before_tokens=100,
        after_tokens=100,
        removed_messages=0,
        summary_text="",
        skip_reason="disabled",
    )
    websocket = _FakeWebSocket()
    session_manager = _FakeSessionManager(
        has_active_query=True,
        session=_FakeSession(decision, result),
    )
    handler = CompactHistoryHandler(session_manager)
    message = CompactHistoryMessage(
        id="msg_compact_1",
        type="compact-history",
        user_id="user_1",
        payload={},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent
    assert websocket.sent[0]["type"] == "error"
    assert "Cannot compact history while a query is active" in websocket.sent[0]["payload"]["message"]


@pytest.mark.asyncio
async def test_compact_history_handler_emits_started_and_completed_when_applied():
    decision = CompactionDecision(
        should_compact=True,
        reason="manual",
        strategy_name="inline",
        before_tokens=2200,
        projected_tokens=2200,
        user_turn_index=4,
    )
    result = CompactionResult(
        applied=True,
        reason="manual",
        strategy_name="inline",
        before_tokens=2200,
        after_tokens=900,
        removed_messages=7,
        summary_text="summary content",
        skip_reason=None,
    )
    websocket = _FakeWebSocket()
    session_manager = _FakeSessionManager(
        has_active_query=False,
        session=_FakeSession(decision, result),
    )
    handler = CompactHistoryHandler(session_manager)
    message = CompactHistoryMessage(
        id="msg_compact_2",
        type="compact-history",
        user_id="user_1",
        payload={},
    )

    await handler.handle(message, websocket, "user_1")

    assert [item["type"] for item in websocket.sent] == [
        "context-compaction-started",
        "context-compaction-completed",
    ]
    assert websocket.sent[0]["payload"]["before_tokens"] == 2200
    assert websocket.sent[1]["payload"]["after_tokens"] == 900
    assert websocket.sent[1]["payload"]["removed_messages"] == 7


@pytest.mark.asyncio
async def test_compact_history_handler_emits_completed_with_skip_reason():
    decision = CompactionDecision(
        should_compact=False,
        reason="manual",
        strategy_name="inline",
        before_tokens=1200,
        projected_tokens=1200,
        user_turn_index=4,
        skip_reason="below-threshold",
    )
    result = CompactionResult(
        applied=False,
        reason="manual",
        strategy_name="inline",
        before_tokens=1200,
        after_tokens=1200,
        removed_messages=0,
        summary_text="",
        skip_reason="below-threshold",
    )
    websocket = _FakeWebSocket()
    session_manager = _FakeSessionManager(
        has_active_query=False,
        session=_FakeSession(decision, result),
    )
    handler = CompactHistoryHandler(session_manager)
    message = CompactHistoryMessage(
        id="msg_compact_3",
        type="compact-history",
        user_id="user_1",
        payload={},
    )

    await handler.handle(message, websocket, "user_1")

    assert len(websocket.sent) == 1
    assert websocket.sent[0]["type"] == "context-compaction-completed"
    assert websocket.sent[0]["payload"]["skipped_reason"] == "below-threshold"

