"""Covers local-runtime conversation event store behavior."""

import sqlite3
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.chat_event_store import (  # noqa: E402
    append_chat_event,
    clear_chat_events,
    get_conversation_revision,
    list_conversation_revisions,
    load_display_timeline,
    load_model_history_checkpoint,
    load_conversation_events,
    init_chat_event_schema,
    list_conversations,
    replace_display_timeline,
    replace_model_history_checkpoint,
)
from memory.sqlite_store import init_episodic_schema  # noqa: E402


@pytest.mark.asyncio
async def test_chat_event_store_creates_conversation_centered_schema(tmp_path: Path):
    db_path = tmp_path / "history.db"
    await init_chat_event_schema(str(db_path))

    with sqlite3.connect(db_path) as conn:
        objects = dict(conn.execute("""
                SELECT name, type
                FROM sqlite_master
                WHERE name IN (
                    'conversation_events',
                    'conversation_display_timeline',
                    'conversation_model_history',
                    'conversation_revisions',
                    'conversations',
                    'conversation_turns',
                    'conversation_titles',
                    'conversation_display_messages'
                )
                """).fetchall())

    assert objects["conversation_events"] == "table"
    assert objects["conversation_display_timeline"] == "table"
    assert objects["conversation_model_history"] == "table"
    assert objects["conversation_revisions"] == "table"
    assert objects["conversations"] == "table"
    assert objects["conversation_turns"] == "table"
    assert objects["conversation_titles"] == "table"
    assert objects["conversation_display_messages"] == "view"
    with sqlite3.connect(db_path) as conn:
        revision_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(conversation_revisions)")
        }
    assert {
        "parent_revision_id",
        "operation",
        "display_timeline_id",
        "model_history_checkpoint_id",
        "created_at",
        "active",
    }.issubset(revision_columns)


@pytest.mark.asyncio
async def test_clear_chat_events_removes_display_and_model_history_rows(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        event_type="user_message",
        role="user",
        content="hello",
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "evt-user",
            "type": "user_message",
            "conversationRef": "conv-1",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "sdk",
            "payload": {"text": "hello"},
        },
    )
    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-display",
        revision_id="rev-display",
        rows=[
            {
                "id": "display-row",
                "role": "user",
                "type": "user_message",
                "content": "display only",
            }
        ],
    )
    await replace_model_history_checkpoint(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-display",
        revision_id="rev-model",
        checkpoint_id="checkpoint-1",
        rows=[
            {
                "id": "model-row",
                "role": "user",
                "message_type": "user_query",
                "content": "model only",
            }
        ],
    )
    await replace_display_timeline(
        db_path=db_path,
        user_id="user-2",
        conversation_id="conv-other",
        revision_id="rev-other",
        rows=[
            {
                "id": "other-row",
                "role": "user",
                "type": "user_message",
                "content": "other user",
            }
        ],
    )

    deleted = await clear_chat_events(db_path=db_path, user_id="user-1")

    assert deleted == 1
    assert await list_conversations(db_path=db_path, user_id="user-1", limit=10) == []
    assert [
        conversation["conversation_id"]
        for conversation in await list_conversations(
            db_path=db_path,
            user_id="user-2",
            limit=10,
        )
    ] == ["conv-other"]


@pytest.mark.asyncio
async def test_chat_event_store_round_trips_display_timeline(tmp_path: Path):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    result = await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
        created_at="2026-06-22T12:00:00+00:00",
        reason="user_edit",
        base_revision_id="rev-parent",
        rows=[
            {
                "id": "display-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-child",
                "index": 0,
                "role": "user",
                "type": "user_message",
                "content": "edited hello",
                "metadata": {"eventId": "evt-user"},
            },
            {
                "id": "display-assistant",
                "conversationRef": "conv-1",
                "revisionId": "rev-child",
                "index": 1,
                "role": "assistant",
                "type": "assistant_message",
                "content": "answer",
            },
        ],
    )

    loaded = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
    )
    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert result == {
        "revision_id": "rev-child",
        "row_count": 2,
        "created_at": "2026-06-22T12:00:00+00:00",
    }
    assert loaded == {
        "conversation_id": "conv-1",
        "revision_id": "rev-child",
        "created_at": "2026-06-22T12:00:00+00:00",
        "reason": "user_edit",
        "base_revision_id": "rev-parent",
        "rows": [
            {
                "id": "display-user",
                "conversation_id": "conv-1",
                "revision_id": "rev-child",
                "index": 0,
                "role": "user",
                "type": "user_message",
                "content": "edited hello",
                "turn_ref": None,
                "metadata": {"eventId": "evt-user"},
            },
            {
                "id": "display-assistant",
                "conversation_id": "conv-1",
                "revision_id": "rev-child",
                "index": 1,
                "role": "assistant",
                "type": "assistant_message",
                "content": "answer",
                "turn_ref": None,
                "metadata": {},
            },
        ],
    }
    assert revision == {
        "conversation_id": "conv-1",
        "revision_id": "rev-child",
        "parent_revision_id": "rev-parent",
        "operation": "edit",
        "display_timeline_id": "rev-child",
        "model_history_checkpoint_id": None,
        "created_at": "2026-06-22T12:00:00+00:00",
        "updated_at": "2026-06-22T12:00:00+00:00",
        "active": True,
        "record_kind": "chat_event",
    }


@pytest.mark.asyncio
async def test_chat_event_store_migrates_legacy_revision_table(tmp_path: Path):
    db_path = tmp_path / "history.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE conversation_revisions (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                revision_id TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, conversation_id)
            )
            """)
        conn.execute("""
            INSERT INTO conversation_revisions
            (user_id, conversation_id, revision_id, updated_at)
            VALUES ('user-1', 'conv-1', 'rev-legacy', '2026-06-22T11:00:00+00:00')
            """)

    await init_chat_event_schema(str(db_path))
    revision = await get_conversation_revision(
        db_path=str(db_path),
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert revision == {
        "conversation_id": "conv-1",
        "revision_id": "rev-legacy",
        "parent_revision_id": None,
        "operation": "send",
        "display_timeline_id": "rev-legacy",
        "model_history_checkpoint_id": None,
        "created_at": "2026-06-22T11:00:00+00:00",
        "updated_at": "2026-06-22T11:00:00+00:00",
        "active": True,
        "record_kind": "chat_event",
    }


@pytest.mark.asyncio
async def test_chat_event_store_loads_inactive_display_timeline_by_revision(
    tmp_path: Path,
):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
        created_at="2026-06-22T12:00:00+00:00",
        reason=None,
        base_revision_id=None,
        rows=[
            {
                "id": "display-parent-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-parent",
                "role": "user",
                "type": "user_message",
                "content": "original",
            },
        ],
    )
    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
        created_at="2026-06-22T12:01:00+00:00",
        reason="user_edit",
        base_revision_id="rev-parent",
        rows=[
            {
                "id": "display-child-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-child",
                "role": "user",
                "type": "user_message",
                "content": "edited",
            },
        ],
    )

    active = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )
    parent = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
    )

    assert active is not None
    assert active["revision_id"] == "rev-child"
    assert parent is not None
    assert parent["revision_id"] == "rev-parent"
    assert parent["rows"][0]["content"] == "original"


@pytest.mark.asyncio
async def test_chat_event_store_lists_revision_graph_for_branch_navigation(
    tmp_path: Path,
):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
        created_at="2026-06-22T12:00:00+00:00",
        reason=None,
        base_revision_id=None,
        rows=[
            {
                "id": "display-parent-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-parent",
                "role": "user",
                "type": "user_message",
                "content": "original",
            },
        ],
    )
    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
        created_at="2026-06-22T12:01:00+00:00",
        reason="user_edit",
        base_revision_id="rev-parent",
        rows=[
            {
                "id": "display-child-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-child",
                "role": "user",
                "type": "user_message",
                "content": "edited",
            },
        ],
    )

    revisions = await list_conversation_revisions(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert revisions == [
        {
            "conversation_id": "conv-1",
            "revision_id": "rev-child",
            "parent_revision_id": "rev-parent",
            "operation": "edit",
            "display_timeline_id": "rev-child",
            "model_history_checkpoint_id": None,
            "created_at": "2026-06-22T12:01:00+00:00",
            "updated_at": "2026-06-22T12:01:00+00:00",
            "active": True,
            "record_kind": "chat_event",
        },
        {
            "conversation_id": "conv-1",
            "revision_id": "rev-parent",
            "parent_revision_id": None,
            "operation": "send",
            "display_timeline_id": "rev-parent",
            "model_history_checkpoint_id": None,
            "created_at": "2026-06-22T12:00:00+00:00",
            "updated_at": "2026-06-22T12:00:00+00:00",
            "active": False,
            "record_kind": "chat_event",
        },
    ]


@pytest.mark.asyncio
async def test_chat_event_store_round_trips_empty_active_display_timeline(
    tmp_path: Path,
):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
        created_at="2026-06-22T12:00:00+00:00",
        reason=None,
        base_revision_id=None,
        rows=[
            {
                "id": "display-parent-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-parent",
                "role": "user",
                "type": "user_message",
                "content": "original",
            },
        ],
    )
    result = await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
        created_at="2026-06-22T12:01:00+00:00",
        reason="user_edit",
        base_revision_id="rev-parent",
        rows=[],
    )

    active = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )
    child = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
    )
    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert result["row_count"] == 0
    assert active == {
        "conversation_id": "conv-1",
        "revision_id": "rev-child",
        "created_at": "2026-06-22T12:01:00+00:00",
        "reason": "user_edit",
        "base_revision_id": "rev-parent",
        "rows": [],
    }
    assert child == active
    assert revision is not None
    assert revision["revision_id"] == "rev-child"
    assert revision["active"] is True


@pytest.mark.asyncio
async def test_chat_event_store_keeps_child_revision_active_after_parent_checkpoint(
    tmp_path: Path,
):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
        created_at="2026-06-22T12:00:00+00:00",
        reason=None,
        base_revision_id=None,
        rows=[
            {
                "id": "display-parent-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-parent",
                "role": "user",
                "type": "user_message",
                "content": "original",
            },
        ],
    )
    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
        created_at="2026-06-22T12:01:00+00:00",
        reason="user_edit",
        base_revision_id="rev-parent",
        rows=[],
    )
    await replace_model_history_checkpoint(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
        checkpoint_id="mh-parent-late",
        created_at="2026-06-22T12:02:00+00:00",
        rows=[
            {
                "id": "mh-parent-user",
                "role": "user",
                "message_type": "user_query",
                "content": {"text": "original"},
            },
        ],
    )

    active = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )
    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert active is not None
    assert active["revision_id"] == "rev-child"
    assert active["rows"] == []
    assert revision is not None
    assert revision["revision_id"] == "rev-child"
    assert revision["active"] is True


@pytest.mark.asyncio
async def test_chat_event_store_recovers_stale_parent_active_display_revision(
    tmp_path: Path,
):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-parent",
        created_at="2026-06-22T12:00:00+00:00",
        reason=None,
        base_revision_id=None,
        rows=[
            {
                "id": "display-parent-user",
                "conversationRef": "conv-1",
                "revisionId": "rev-parent",
                "role": "user",
                "type": "user_message",
                "content": "original",
            },
        ],
    )
    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-child",
        created_at="2026-06-22T12:01:00+00:00",
        reason="user_edit",
        base_revision_id="rev-parent",
        rows=[],
    )
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            UPDATE conversation_revisions
            SET active = CASE revision_id
                WHEN 'rev-parent' THEN 1
                ELSE 0
            END,
            updated_at = CASE revision_id
                WHEN 'rev-parent' THEN '2026-06-22T12:02:00+00:00'
                ELSE updated_at
            END
            WHERE user_id = 'user-1' AND conversation_id = 'conv-1'
            """)

    active = await load_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )
    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert active is not None
    assert active["revision_id"] == "rev-child"
    assert active["rows"] == []
    assert revision is not None
    assert revision["revision_id"] == "rev-child"
    assert revision["active"] is False


@pytest.mark.asyncio
async def test_chat_event_store_round_trips_model_history_checkpoint(tmp_path: Path):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    result = await replace_model_history_checkpoint(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-1",
        checkpoint_id="mh-1",
        created_at="2026-06-22T12:00:00+00:00",
        rows=[
            {
                "id": "mh-row-user",
                "role": "user",
                "message_type": "user_query",
                "content": {"text": "hello"},
                "source_display_row_ids": ["display-user"],
            },
            {
                "id": "mh-row-tool",
                "role": "tool",
                "message_type": "tool_output",
                "content": "bounded tool output",
                "tool_call_id": "call-1",
                "tool_name": "read_file",
                "image_refs": ["artifact-1"],
                "tool_calls": [{"id": "call-1", "type": "function"}],
                "compaction_facts": {"bounded": True},
                "source_display_row_ids": ["display-tool"],
            },
        ],
    )

    loaded = await load_model_history_checkpoint(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-1",
    )
    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert result == {
        "checkpoint_id": "mh-1",
        "revision_id": "rev-1",
        "row_count": 2,
        "created_at": "2026-06-22T12:00:00+00:00",
    }
    assert loaded == {
        "checkpoint_id": "mh-1",
        "conversation_id": "conv-1",
        "revision_id": "rev-1",
        "created_at": "2026-06-22T12:00:00+00:00",
        "rows": [
            {
                "id": "mh-row-user",
                "conversation_id": "conv-1",
                "revision_id": "rev-1",
                "role": "user",
                "message_type": "user_query",
                "content": {"text": "hello"},
                "tool_call_id": None,
                "tool_calls": [],
                "tool_name": None,
                "image_refs": [],
                "compaction_facts": {},
                "source_display_row_ids": ["display-user"],
            },
            {
                "id": "mh-row-tool",
                "conversation_id": "conv-1",
                "revision_id": "rev-1",
                "role": "tool",
                "message_type": "tool_output",
                "content": "bounded tool output",
                "tool_call_id": "call-1",
                "tool_calls": [{"id": "call-1", "type": "function"}],
                "tool_name": "read_file",
                "image_refs": ["artifact-1"],
                "compaction_facts": {"bounded": True},
                "source_display_row_ids": ["display-tool"],
            },
        ],
    }
    assert revision is not None
    assert revision["revision_id"] == "rev-1"
    assert revision["operation"] == "send"
    assert revision["model_history_checkpoint_id"] == "mh-1"


@pytest.mark.asyncio
async def test_chat_event_store_marks_compaction_model_history_revision(tmp_path: Path):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    await replace_model_history_checkpoint(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-compact",
        checkpoint_id="mh-compact",
        created_at="2026-06-22T12:00:00+00:00",
        rows=[
            {
                "id": "mh-row-compact",
                "role": "assistant",
                "message_type": "context_compaction",
                "content": "bounded summary",
            },
        ],
    )

    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert revision is not None
    assert revision["revision_id"] == "rev-compact"
    assert revision["operation"] == "compact"
    assert revision["model_history_checkpoint_id"] == "mh-compact"


@pytest.mark.asyncio
async def test_chat_event_store_rejects_provider_specific_model_history_rows(
    tmp_path: Path,
):
    db_path = str(tmp_path / "history.db")
    await init_chat_event_schema(db_path)

    with pytest.raises(ValueError, match="canonical message_type"):
        await replace_model_history_checkpoint(
            db_path=db_path,
            user_id="user-1",
            conversation_id="conv-1",
            revision_id="rev-1",
            checkpoint_id="mh-1",
            rows=[
                {
                    "id": "mh-row-openai",
                    "role": "assistant",
                    "message_type": "openai_assistant_message",
                    "content": "provider-shaped",
                }
            ],
        )


@pytest.mark.asyncio
async def test_chat_event_store_display_messages_view_filters_visible_rows(
    tmp_path: Path,
):
    db_path = tmp_path / "history.db"
    await init_chat_event_schema(str(db_path))

    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            """
            INSERT INTO conversation_events (
                id, user_id, conversation_id, event_type, role, content, timestamp,
                message_index, revision_id, turn_ref, tool_name, correlation_id,
                workspace_path, workspace_name, producer, producer_event_id,
                producer_sequence, metadata, attachments, event_payload,
                compaction_checkpoint
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "evt-user",
                    "user-1",
                    "conv-1",
                    "user_message",
                    "user",
                    "hello",
                    "2026-06-11T12:00:00+00:00",
                    1,
                    "rev-1",
                    "turn-1",
                    None,
                    None,
                    None,
                    None,
                    "sdk",
                    None,
                    None,
                    "{}",
                    "[]",
                    "{}",
                    None,
                ),
                (
                    "evt-trace",
                    "user-1",
                    "conv-1",
                    "trace_event",
                    None,
                    "[sdk event: trace_event]",
                    "2026-06-11T12:00:01+00:00",
                    2,
                    "rev-1",
                    "turn-1",
                    None,
                    None,
                    None,
                    None,
                    "sdk",
                    None,
                    None,
                    "{}",
                    "[]",
                    "{}",
                    None,
                ),
                (
                    "evt-assistant",
                    "user-1",
                    "conv-1",
                    "assistant_message",
                    "assistant",
                    "hi there",
                    "2026-06-11T12:00:02+00:00",
                    3,
                    "rev-1",
                    "turn-1",
                    None,
                    None,
                    None,
                    None,
                    "backend",
                    "backend-evt-3",
                    3,
                    "{}",
                    "[]",
                    "{}",
                    None,
                ),
                (
                    "evt-error",
                    "user-1",
                    "conv-1",
                    "turn_error",
                    None,
                    "model failed",
                    "2026-06-11T12:00:03+00:00",
                    4,
                    "rev-1",
                    "turn-2",
                    None,
                    None,
                    None,
                    None,
                    "backend",
                    "backend-evt-4",
                    4,
                    "{}",
                    "[]",
                    "{}",
                    None,
                ),
            ],
        )
        rows = conn.execute("""
            SELECT event_id, display_role, event_type, content, message_index
            FROM conversation_display_messages
            WHERE conversation_id = 'conv-1'
            ORDER BY message_index ASC
            """).fetchall()

    assert rows == [
        ("evt-user", "user", "user_message", "hello", 1),
        ("evt-assistant", "assistant", "assistant_message", "hi there", 3),
        ("evt-error", "error", "turn_error", "model failed", 4),
    ]


@pytest.mark.asyncio
async def test_chat_event_store_round_trips_image_attachments(tmp_path: Path):
    db_path = str(tmp_path / "memory.db")
    await init_chat_event_schema(db_path)

    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        event_type="tool_output",
        role="tool",
        content="screenshot captured",
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name="browser",
        correlation_id="call-1",
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[
            {
                "kind": "image",
                "ref": "artifact-tool-1",
                "url": "/api/artifacts/artifact-tool-1",
                "contentType": "image/png",
            }
        ],
        event_payload={
            "eventId": "evt-1",
            "type": "tool_output",
            "conversationRef": "conv-1",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "sdk",
            "payload": {"text": "screenshot captured"},
        },
    )

    rows = await load_conversation_events(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        limit=10,
    )

    assert rows[0]["attachments"] == [
        {
            "kind": "image",
            "ref": "artifact-tool-1",
            "url": "/api/artifacts/artifact-tool-1",
            "contentType": "image/png",
        }
    ]


@pytest.mark.asyncio
async def test_chat_event_store_persists_backend_producer_order(tmp_path: Path):
    db_path = str(tmp_path / "memory.db")
    await init_chat_event_schema(db_path)

    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        event_type="tool_call",
        role="assistant",
        content="[sdk event: tool_call]",
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name="browser",
        correlation_id="req-browser",
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "turn-1-evt-000003-tool-call",
            "type": "tool_call",
            "conversationRef": "conv-1",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "backend",
            "payload": {
                "backendSequence": 3,
                "requestId": "req-browser",
            },
        },
        producer="backend",
        producer_event_id="turn-1-evt-000003-tool-call",
        producer_sequence=3,
    )
    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        event_type="turn_completed",
        role="assistant",
        content="[sdk event: turn_completed]",
        timestamp="2026-05-17T12:00:01+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "turn-1-evt-000004-streaming-complete",
            "type": "turn_completed",
            "conversationRef": "conv-1",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:01+00:00",
            "source": "backend",
            "payload": {"backendSequence": 4},
        },
        producer="backend",
        producer_event_id="turn-1-evt-000004-streaming-complete",
        producer_sequence=4,
    )

    rows = await load_conversation_events(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        limit=10,
    )

    assert [row["event_type"] for row in rows] == ["tool_call", "turn_completed"]
    assert [row["message_index"] for row in rows] == [1, 2]
    assert [row["producer"] for row in rows] == ["backend", "backend"]
    assert [row["producer_sequence"] for row in rows] == [3, 4]
    assert [row["producer_event_id"] for row in rows] == [
        "turn-1-evt-000003-tool-call",
        "turn-1-evt-000004-streaming-complete",
    ]


@pytest.mark.asyncio
async def test_list_conversations_prefers_stored_conversation_title(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        event_type="user_message",
        role="user",
        content="please debug the startup failure",
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "evt-user",
            "type": "user_message",
            "conversationRef": "conv-1",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "sdk",
            "payload": {"text": "please debug the startup failure"},
        },
    )

    import aiosqlite

    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT INTO conversation_titles (
                user_id, conversation_id, title, source, is_locked, created_at, updated_at
            )
            VALUES (?, ?, ?, 'model', 0, ?, ?)
            """,
            (
                "user-1",
                "conv-1",
                "Startup Failure Debugging",
                "2026-05-17T12:01:00+00:00",
                "2026-05-17T12:01:00+00:00",
            ),
        )
        await conn.commit()

    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert conversations[0]["title"] == "Startup Failure Debugging"


@pytest.mark.asyncio
async def test_list_conversations_hides_internal_lifecycle_only_rows(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-internal-only",
        event_type="turn_started",
        role="assistant",
        content="[sdk event: turn_started]",
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name=None,
        correlation_id=None,
        workspace_path="/work/project-alpha",
        workspace_name="Project Alpha",
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "evt-turn-started",
            "type": "turn_started",
            "conversationRef": "conv-internal-only",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "sdk",
            "payload": {},
        },
    )

    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert conversations == []


@pytest.mark.asyncio
async def test_list_conversations_uses_user_facing_metadata(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    events = [
        (
            "turn_started",
            "assistant",
            "[sdk event: turn_started]",
            None,
            None,
            {},
        ),
        (
            "user_message",
            "user",
            "what workspace am I in?",
            "/work/project-alpha",
            "Project Alpha",
            {"text": "what workspace am I in?"},
        ),
        (
            "assistant_message",
            "assistant",
            "You are in Project Alpha.",
            None,
            None,
            {"text": "You are in Project Alpha."},
        ),
        (
            "memory_store_changed",
            "assistant",
            "[sdk event: memory_store_changed]",
            None,
            None,
            {},
        ),
    ]
    for index, (
        event_type,
        role,
        content,
        workspace_path,
        workspace_name,
        payload,
    ) in enumerate(
        events,
        start=1,
    ):
        await append_chat_event(
            db_path=db_path,
            user_id="user-1",
            conversation_id="conv-visible",
            event_type=event_type,
            role=role,
            content=content,
            timestamp=f"2026-05-17T12:00:0{index}+00:00",
            message_index=None,
            revision_id="rev-1",
            turn_ref="turn-1",
            tool_name=None,
            correlation_id=None,
            workspace_path=workspace_path,
            workspace_name=workspace_name,
            metadata={},
            attachments=[],
            event_payload={
                "eventId": f"evt-{index}",
                "type": event_type,
                "conversationRef": "conv-visible",
                "revisionId": "rev-1",
                "timestamp": f"2026-05-17T12:00:0{index}+00:00",
                "source": "sdk",
                "payload": payload,
            },
        )

    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert [conversation["conversation_id"] for conversation in conversations] == [
        "conv-visible"
    ]
    assert conversations[0]["entry_count"] == 4
    assert conversations[0]["title"] == "what workspace am I in?"
    assert conversations[0]["last_message"] == "You are in Project Alpha."
    assert conversations[0]["workspace_path"] == "/work/project-alpha"
    assert conversations[0]["workspace_name"] == "Project Alpha"


@pytest.mark.asyncio
async def test_list_conversations_includes_display_only_fork_metadata(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-fork",
        revision_id="rev-fork",
        created_at="2026-06-22T12:30:00+00:00",
        reason="fork",
        base_revision_id="rev-parent",
        rows=[
            {
                "id": "display-user-1",
                "conversationRef": "conv-fork",
                "revisionId": "rev-fork",
                "index": 0,
                "role": "user",
                "type": "user_message",
                "content": "where should this branch go?",
                "metadata": {"revisionId": "rev-fork"},
            },
            {
                "id": "display-assistant-1",
                "conversationRef": "conv-fork",
                "revisionId": "rev-fork",
                "index": 1,
                "role": "assistant",
                "type": "assistant_message",
                "content": "It can continue independently.",
                "metadata": {"revisionId": "rev-fork"},
            },
        ],
    )

    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert conversations == [
        {
            "conversation_id": "conv-fork",
            "first_timestamp": "2026-06-22T12:30:00+00:00",
            "last_timestamp": "2026-06-22T12:30:00+00:00",
            "entry_count": 0,
            "record_kind": "chat_event",
            "revision_id": "rev-fork",
            "title": "where should this branch go?",
            "last_message": "It can continue independently.",
            "workspace_path": "",
            "workspace_name": "",
            "is_resumable": True,
        }
    ]


@pytest.mark.asyncio
async def test_list_conversations_keeps_fork_title_but_uses_newer_event_tail(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await replace_display_timeline(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-fork",
        revision_id="rev-fork",
        created_at="2026-06-22T12:30:00+00:00",
        reason="fork",
        base_revision_id="rev-parent",
        rows=[
            {
                "id": "display-user-1",
                "conversationRef": "conv-fork",
                "revisionId": "rev-fork",
                "index": 0,
                "role": "user",
                "type": "user_message",
                "content": "original branch question",
                "metadata": {"revisionId": "rev-fork"},
            },
            {
                "id": "display-assistant-1",
                "conversationRef": "conv-fork",
                "revisionId": "rev-fork",
                "index": 1,
                "role": "assistant",
                "type": "assistant_message",
                "content": "original branch answer",
                "metadata": {"revisionId": "rev-fork"},
            },
        ],
    )
    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-fork",
        event_type="user_message",
        role="user",
        content="continue from here",
        timestamp="2026-06-22T12:31:00+00:00",
        message_index=None,
        revision_id="rev-fork",
        turn_ref="turn-child",
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "evt-child-user",
            "type": "user_message",
            "conversationRef": "conv-fork",
            "revisionId": "rev-fork",
            "timestamp": "2026-06-22T12:31:00+00:00",
            "source": "sdk",
            "payload": {"text": "continue from here"},
        },
    )

    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert conversations[0]["title"] == "original branch question"
    assert conversations[0]["last_message"] == "continue from here"
    assert conversations[0]["last_timestamp"] == "2026-06-22T12:31:00+00:00"
    assert conversations[0]["entry_count"] == 1


@pytest.mark.asyncio
async def test_list_conversations_returns_one_row_per_conversation(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    for index, (event_type, role, content) in enumerate(
        [
            ("turn_started", "system", ""),
            ("user_message", "user", "hello"),
            ("assistant_delta", "assistant", "Hey"),
            ("assistant_message", "assistant", "Hey! What can I help you with?"),
            ("turn_completed", "system", ""),
        ],
        start=1,
    ):
        await append_chat_event(
            db_path=db_path,
            user_id="user-1",
            conversation_id="conv-1",
            event_type=event_type,
            role=role,
            content=content,
            timestamp=f"2026-05-17T12:00:0{index}+00:00",
            message_index=None,
            revision_id="rev-1",
            turn_ref="turn-1",
            tool_name=None,
            correlation_id=None,
            workspace_path=None,
            workspace_name=None,
            metadata={},
            attachments=[],
            event_payload={
                "eventId": f"evt-{index}",
                "type": event_type,
                "conversationRef": "conv-1",
                "revisionId": "rev-1",
                "timestamp": f"2026-05-17T12:00:0{index}+00:00",
                "source": "sdk",
                "payload": {"text": content},
            },
        )

    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert [conversation["conversation_id"] for conversation in conversations] == [
        "conv-1"
    ]
    assert conversations[0]["entry_count"] == 5
    assert conversations[0]["title"] == "hello"
