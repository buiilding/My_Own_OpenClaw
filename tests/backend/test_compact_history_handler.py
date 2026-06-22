"""Tests for manual compact-history handler."""

from __future__ import annotations

import pytest

from backend.src.agent.compaction.models import (
    CompactionDecision,
    CompactionReplacementMessagePreview,
    CompactionResult,
)
from backend.src.api.handlers.compact_history import CompactHistoryHandler
from backend.src.api.schemas.incoming import CompactHistoryMessage
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent = []

    async def send_json(self, data, mode="text"):
        _ = mode
        self.sent.append(data)


class _FakeRuntime:
    active_conversation_ref = "conv_test"
    active_revision_id = "rev_test"


class _FakeHistory:
    def get_stored_messages(self):
        return [
            StoredMessage(
                role=MessageRole.ASSISTANT,
                message_type=MessageType.CONTEXT_COMPACTION,
                content="[[CONTEXT COMPACTION SUMMARY]]\nsummary content",
            )
        ]


class _FakeSession:
    def __init__(self, decision: CompactionDecision, result: CompactionResult):
        self.session_id = "session_test"
        self.runtime = _FakeRuntime()
        self.history = _FakeHistory()
        self._decision = decision
        self._result = result

    async def run_history_compaction(self, *, reason: str, force: bool = False):
        _ = (reason, force)
        return self._decision, self._result


class _FakeSessionManager:
    def __init__(self, *, has_active_query: bool, session: _FakeSession):
        self._has_active_query = has_active_query
        self._session = session
        self.has_active_query_calls = []
        self.get_or_create_calls = []

    def has_active_query_task(
        self,
        user_id: str,
        conversation_ref=None,
    ) -> bool:
        self.has_active_query_calls.append((user_id, conversation_ref))
        return self._has_active_query

    async def get_or_create_session(self, user_id: str, conversation_ref=None):
        self.get_or_create_calls.append((user_id, conversation_ref))
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
        replacement_history_preview=[],
        replacement_history_entries=[],
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

    assert session_manager.has_active_query_calls == [("user_1", None)]
    assert websocket.sent
    assert websocket.sent[0]["type"] == "context-compaction-failed"
    assert websocket.sent[0]["turn_ref"] == "msg_compact_1"
    assert websocket.sent[0]["event_id"] == (
        "msg_compact_1-evt-000001-context-compaction-failed"
    )
    assert websocket.sent[0]["sequence"] == 1
    assert websocket.sent[0]["payload"]["reason"] == "manual"
    assert websocket.sent[0]["payload"]["strategy"] == "manual"
    assert (
        "Cannot compact history while a query is active"
        in websocket.sent[0]["payload"]["error"]
    )


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
        replacement_history_preview=[
            CompactionReplacementMessagePreview(
                role="assistant",
                message_type="context_compaction",
                content="[[CONTEXT COMPACTION SUMMARY]]\nsummary content",
            ),
        ],
        replacement_history_entries=[
            {
                "role": "assistant",
                "content": "[[CONTEXT COMPACTION SUMMARY]]\nsummary content",
                "message_type": "context_compaction",
            }
        ],
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

    assert session_manager.get_or_create_calls == [("user_1", None)]
    assert [item["type"] for item in websocket.sent] == [
        "context-compaction-started",
        "context-compaction-completed",
        "model-history-updated",
    ]
    assert [item["turn_ref"] for item in websocket.sent] == [
        "msg_compact_2",
        "msg_compact_2",
        "msg_compact_2",
    ]
    assert [item["event_id"] for item in websocket.sent] == [
        "msg_compact_2-evt-000001-context-compaction-started",
        "msg_compact_2-evt-000002-context-compaction-completed",
        "msg_compact_2-evt-000003-model-history-updated",
    ]
    assert [item["sequence"] for item in websocket.sent] == [1, 2, 3]
    assert websocket.sent[0]["payload"]["before_tokens"] == 2200
    assert websocket.sent[1]["payload"]["after_tokens"] == 900
    assert websocket.sent[1]["payload"]["removed_messages"] == 7
    assert websocket.sent[1]["payload"]["summary_preview"] == "summary content"
    assert (
        websocket.sent[1]["payload"]["replacement_history_preview"][0]["message_type"]
        == "context_compaction"
    )
    assert (
        websocket.sent[1]["payload"]["replacement_history_entries"][0]["message_type"]
        == "context_compaction"
    )
    assert websocket.sent[2]["payload"]["conversation_ref"] == "conv_test"
    assert websocket.sent[2]["payload"]["revision_id"] == "rev_test"
    assert websocket.sent[2]["payload"]["checkpoint_id"] == "mh:rev_test:msg_compact_2"
    assert (
        websocket.sent[2]["payload"]["rows"][0]["message_type"]
        == "context_compaction"
    )


@pytest.mark.asyncio
async def test_compact_history_handler_does_not_truncate_summary_preview():
    long_summary = "summary-" + ("x" * 300)
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
        summary_text=long_summary,
        replacement_history_preview=[],
        replacement_history_entries=[],
        skip_reason=None,
    )
    websocket = _FakeWebSocket()
    session_manager = _FakeSessionManager(
        has_active_query=False,
        session=_FakeSession(decision, result),
    )
    handler = CompactHistoryHandler(session_manager)
    message = CompactHistoryMessage(
        id="msg_compact_4",
        type="compact-history",
        user_id="user_1",
        payload={},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent[1]["payload"]["summary_preview"] == long_summary


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
        replacement_history_preview=[],
        replacement_history_entries=[],
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
    assert websocket.sent[0]["turn_ref"] == "msg_compact_3"
    assert websocket.sent[0]["event_id"] == (
        "msg_compact_3-evt-000001-context-compaction-completed"
    )
    assert websocket.sent[0]["sequence"] == 1
    assert websocket.sent[0]["payload"]["skipped_reason"] == "below-threshold"


@pytest.mark.asyncio
async def test_compact_history_handler_scopes_active_query_check_and_session_lookup_by_conversation():
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
        replacement_history_preview=[],
        replacement_history_entries=[],
        skip_reason="below-threshold",
    )
    websocket = _FakeWebSocket()
    session_manager = _FakeSessionManager(
        has_active_query=False,
        session=_FakeSession(decision, result),
    )
    handler = CompactHistoryHandler(session_manager)
    message = CompactHistoryMessage(
        id="msg_compact_scoped",
        type="compact-history",
        user_id="user_1",
        payload={"conversation_ref": "conv_scoped"},
    )

    await handler.handle(message, websocket, "user_1")

    assert session_manager.has_active_query_calls == [("user_1", "conv_scoped")]
    assert session_manager.get_or_create_calls == [("user_1", "conv_scoped")]
