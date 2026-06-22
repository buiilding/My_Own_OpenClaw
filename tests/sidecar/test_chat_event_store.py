"""Covers local-runtime conversation event store behavior."""

import sqlite3
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.chat_event_store import (  # noqa: E402
    append_chat_event,
    get_conversation_revision,
    load_model_history_checkpoint,
    load_conversation_events,
    init_chat_event_schema,
    list_conversations,
    replace_model_history_checkpoint,
    replace_conversation,
    rewrite_conversation_after_event,
)
from memory.sqlite_store import init_episodic_schema  # noqa: E402


@pytest.mark.asyncio
async def test_chat_event_store_creates_conversation_centered_schema(tmp_path: Path):
    db_path = tmp_path / "history.db"
    await init_chat_event_schema(str(db_path))

    with sqlite3.connect(db_path) as conn:
        objects = dict(
            conn.execute(
                """
                SELECT name, type
                FROM sqlite_master
                WHERE name IN (
                    'conversation_events',
                    'conversation_model_history',
                    'conversation_revisions',
                    'conversations',
                    'conversation_turns',
                    'conversation_titles',
                    'conversation_display_messages'
                )
                """
            ).fetchall()
        )

    assert objects["conversation_events"] == "table"
    assert objects["conversation_model_history"] == "table"
    assert objects["conversation_revisions"] == "table"
    assert objects["conversations"] == "table"
    assert objects["conversation_turns"] == "table"
    assert objects["conversation_titles"] == "table"
    assert objects["conversation_display_messages"] == "view"


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
        rows = conn.execute(
            """
            SELECT event_id, display_role, event_type, content, message_index
            FROM conversation_display_messages
            WHERE conversation_id = 'conv-1'
            ORDER BY message_index ASC
            """
        ).fetchall()

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


@pytest.mark.asyncio
async def test_replace_conversation_rolls_back_when_replacement_insert_fails(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_chat_event_schema(db_path)
    await append_chat_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        event_type="user_message",
        role="user",
        content="original",
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=1,
        revision_id="rev-old",
        turn_ref=None,
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "evt-original",
            "type": "user_message",
            "conversationRef": "conv-1",
            "revisionId": "rev-old",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "sdk",
            "payload": {"text": "original"},
        },
    )

    with pytest.raises(TypeError):
        await replace_conversation(
            db_path=db_path,
            user_id="user-1",
            conversation_id="conv-1",
            events=[
                {
                    "event_type": "user_message",
                    "role": "user",
                    "content": "replacement",
                    "timestamp": "2026-05-17T12:01:00+00:00",
                    "message_index": 1,
                    "revision_id": "rev-new",
                    "metadata": {"invalid": object()},
                    "attachments": [],
                    "event_payload": {
                        "eventId": "evt-replacement",
                        "type": "user_message",
                        "conversationRef": "conv-1",
                        "revisionId": "rev-new",
                        "timestamp": "2026-05-17T12:01:00+00:00",
                        "source": "sdk",
                        "payload": {"text": "replacement"},
                    },
                }
            ],
        )

    rows = await load_conversation_events(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        limit=10,
    )

    assert [row["content"] for row in rows] == ["original"]
    assert rows[0]["revision_id"] == "rev-old"


@pytest.mark.asyncio
async def test_replace_conversation_persists_rewrite_revision_metadata(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await replace_conversation(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        revision_id="rev-new",
        revision_updated_at="2026-05-17T12:02:00+00:00",
        events=[
            {
                "event_type": "user_message",
                "role": "user",
                "content": "preserved",
                "timestamp": "2026-05-17T12:00:00+00:00",
                "message_index": 1,
                "revision_id": "rev-old",
                "metadata": {},
                "attachments": [],
                "event_payload": {
                    "eventId": "evt-preserved",
                    "type": "user_message",
                    "conversationRef": "conv-1",
                    "revisionId": "rev-old",
                    "timestamp": "2026-05-17T12:00:00+00:00",
                    "source": "sdk",
                    "payload": {"text": "preserved"},
                },
            }
        ],
    )

    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )
    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert revision == {
        "conversation_id": "conv-1",
        "revision_id": "rev-new",
        "updated_at": "2026-05-17T12:02:00+00:00",
        "record_kind": "chat_event",
    }
    assert conversations[0]["revision_id"] == "rev-new"


@pytest.mark.asyncio
async def test_replace_conversation_preserves_empty_rewrite_revision(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await replace_conversation(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-empty",
        revision_id="rev-empty",
        revision_updated_at="2026-05-17T12:03:00+00:00",
        events=[],
    )

    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-empty",
    )
    conversations = await list_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert revision == {
        "conversation_id": "conv-empty",
        "revision_id": "rev-empty",
        "updated_at": "2026-05-17T12:03:00+00:00",
        "record_kind": "chat_event",
    }
    assert conversations == []


@pytest.mark.asyncio
async def test_rewrite_conversation_after_event_deletes_tail_only(tmp_path: Path):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    for index, (event_id, content) in enumerate(
        [("evt-user", "hello"), ("evt-assistant", "old answer"), ("evt-tail", "tail")],
        start=1,
    ):
        await append_chat_event(
            db_path=db_path,
            user_id="user-1",
            conversation_id="conv-1",
            event_type="user_message" if index == 1 else "assistant_message",
            role="user" if index == 1 else "assistant",
            content=content,
            timestamp=f"2026-05-17T12:0{index}:00+00:00",
            message_index=index,
            revision_id="rev-old",
            turn_ref=None,
            tool_name=None,
            correlation_id=None,
            workspace_path=None,
            workspace_name=None,
            metadata={},
            attachments=[],
            event_payload={
                "eventId": event_id,
                "type": "user_message" if index == 1 else "assistant_message",
                "conversationRef": "conv-1",
                "revisionId": "rev-old",
                "timestamp": f"2026-05-17T12:0{index}:00+00:00",
                "source": "sdk",
                "payload": {"text": content},
            },
        )

    result = await rewrite_conversation_after_event(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        cut_after_event_id="evt-user",
        revision_id="rev-new",
        revision_updated_at="2026-05-17T12:05:00+00:00",
        event={
            "event_type": "conversation_rewritten",
            "role": "assistant",
            "content": "[sdk event: conversation_rewritten]",
            "timestamp": "2026-05-17T12:05:00+00:00",
            "revision_id": "rev-new",
            "metadata": {},
            "attachments": [],
            "event_payload": {
                "eventId": "evt-rewrite",
                "type": "conversation_rewritten",
                "conversationRef": "conv-1",
                "revisionId": "rev-new",
                "timestamp": "2026-05-17T12:05:00+00:00",
                "source": "sdk",
                "payload": {"reason": "edit_resend"},
            },
        },
    )

    rows = await load_conversation_events(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        limit=10,
    )
    revision = await get_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert result == {"deleted_count": 2, "inserted_count": 1}
    assert [row["id"] for row in rows] == ["evt-user", "evt-rewrite"]
    assert [row["message_index"] for row in rows] == [1, 2]
    assert revision["revision_id"] == "rev-new"
