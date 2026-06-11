from pathlib import Path
import sqlite3

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.chat_event_store import (  # noqa: E402
    append_chat_event,
    get_chat_conversation_revision,
    get_chat_events,
    init_chat_event_schema,
    list_chat_conversations,
    replace_chat_conversation,
    rewrite_chat_conversation_after_event,
)
from memory.sqlite_store import init_episodic_schema  # noqa: E402


def _create_legacy_chat_history_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE chat_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                conversation_id TEXT,
                event_type TEXT NOT NULL,
                role TEXT,
                content TEXT,
                timestamp TEXT NOT NULL,
                message_index INTEGER NOT NULL,
                revision_id TEXT,
                turn_ref TEXT,
                tool_name TEXT,
                correlation_id TEXT,
                workspace_path TEXT,
                workspace_name TEXT,
                producer TEXT NOT NULL DEFAULT 'sdk',
                producer_event_id TEXT,
                producer_sequence INTEGER,
                metadata TEXT,
                attachments TEXT,
                event_payload TEXT NOT NULL,
                compaction_checkpoint TEXT
            )
            """)
        conn.execute("""
            CREATE TABLE chat_conversation_revisions (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                revision_id TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, conversation_id)
            )
            """)
        conn.execute("""
            CREATE TABLE conversation_titles (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                title TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'heuristic',
                is_locked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, conversation_id)
            )
            """)
        conn.execute(
            """
            INSERT INTO chat_events (
                id, user_id, conversation_id, event_type, role, content, timestamp,
                message_index, revision_id, turn_ref, tool_name, correlation_id,
                workspace_path, workspace_name, producer, producer_event_id,
                producer_sequence, metadata, attachments, event_payload,
                compaction_checkpoint
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "evt-legacy",
                "user-1",
                "conv-legacy",
                "user_message",
                "user",
                "legacy hello",
                "2026-05-17T12:00:00+00:00",
                1,
                "rev-legacy",
                "turn-legacy",
                None,
                None,
                "/work/WindieOS",
                "WindieOS",
                "sdk",
                None,
                None,
                "{}",
                "[]",
                '{"eventId":"evt-legacy","type":"user_message","conversationRef":"conv-legacy","revisionId":"rev-legacy","timestamp":"2026-05-17T12:00:00+00:00","source":"sdk","payload":{"text":"legacy hello"}}',
                None,
            ),
        )
        conn.execute(
            """
            INSERT INTO chat_conversation_revisions
            (user_id, conversation_id, revision_id, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                "user-1",
                "conv-legacy",
                "rev-legacy",
                "2026-05-17T12:00:00+00:00",
            ),
        )
        conn.execute(
            """
            INSERT INTO conversation_titles
            (user_id, conversation_id, title, source, is_locked, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-1",
                "conv-legacy",
                "Legacy Title",
                "model",
                0,
                "2026-05-17T12:00:00+00:00",
                "2026-05-17T12:00:00+00:00",
            ),
        )
        conn.commit()


def _create_old_legacy_chat_history_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE chat_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                conversation_id TEXT,
                event_type TEXT NOT NULL,
                role TEXT,
                content TEXT,
                timestamp TEXT NOT NULL,
                message_index INTEGER NOT NULL,
                revision_id TEXT,
                turn_ref TEXT,
                tool_name TEXT,
                correlation_id TEXT,
                workspace_path TEXT,
                workspace_name TEXT,
                metadata TEXT,
                event_payload TEXT NOT NULL
            )
            """)
        conn.execute(
            """
            INSERT INTO chat_events (
                id, user_id, conversation_id, event_type, role, content, timestamp,
                message_index, revision_id, turn_ref, tool_name, correlation_id,
                workspace_path, workspace_name, metadata, event_payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "evt-old-legacy",
                "user-1",
                "conv-old-legacy",
                "user_message",
                "user",
                "old legacy hello",
                "2026-05-16T12:00:00+00:00",
                1,
                "rev-old-legacy",
                "turn-old-legacy",
                None,
                None,
                None,
                None,
                "{}",
                '{"eventId":"evt-old-legacy","type":"user_message","conversationRef":"conv-old-legacy","revisionId":"rev-old-legacy","timestamp":"2026-05-16T12:00:00+00:00","source":"sdk","payload":{"text":"old legacy hello"}}',
            ),
        )
        conn.commit()


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
                    'conversation_revisions',
                    'conversations',
                    'conversation_turns',
                    'conversation_titles',
                    'chat_events',
                    'chat_conversation_revisions'
                )
                """
            ).fetchall()
        )

    assert objects["conversation_events"] == "table"
    assert objects["conversation_revisions"] == "table"
    assert objects["conversations"] == "table"
    assert objects["conversation_turns"] == "table"
    assert objects["conversation_titles"] == "table"
    assert objects["chat_events"] == "view"
    assert objects["chat_conversation_revisions"] == "view"


@pytest.mark.asyncio
async def test_chat_event_store_migrates_legacy_history_rows(tmp_path: Path):
    legacy_db_path = tmp_path / "episodic.db"
    history_db_path = tmp_path / "history.db"
    _create_legacy_chat_history_db(legacy_db_path)

    await init_chat_event_schema(
        str(history_db_path),
        legacy_db_path=str(legacy_db_path),
    )

    rows = await get_chat_events(
        db_path=str(history_db_path),
        user_id="user-1",
        conversation_id="conv-legacy",
        limit=10,
    )
    conversations = await list_chat_conversations(
        db_path=str(history_db_path),
        user_id="user-1",
        limit=10,
    )
    revision = await get_chat_conversation_revision(
        db_path=str(history_db_path),
        user_id="user-1",
        conversation_id="conv-legacy",
    )

    assert [row["id"] for row in rows] == ["evt-legacy"]
    assert conversations[0]["title"] == "Legacy Title"
    assert conversations[0]["workspace_path"] == "/work/WindieOS"
    assert revision["revision_id"] == "rev-legacy"

    with sqlite3.connect(history_db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM conversation_events").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM conversation_revisions").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM conversation_titles").fetchone()[0] == 1


@pytest.mark.asyncio
async def test_chat_event_store_migrates_older_legacy_event_rows(tmp_path: Path):
    legacy_db_path = tmp_path / "old_episodic.db"
    history_db_path = tmp_path / "history.db"
    _create_old_legacy_chat_history_db(legacy_db_path)

    await init_chat_event_schema(
        str(history_db_path),
        legacy_db_path=str(legacy_db_path),
    )

    rows = await get_chat_events(
        db_path=str(history_db_path),
        user_id="user-1",
        conversation_id="conv-old-legacy",
        limit=10,
    )

    assert len(rows) == 1
    assert rows[0]["id"] == "evt-old-legacy"
    assert rows[0]["producer"] == "sdk"
    assert rows[0]["attachments"] == []
    assert "compaction_checkpoint" not in rows[0]


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

    rows = await get_chat_events(
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

    rows = await get_chat_events(
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
async def test_list_chat_conversations_prefers_stored_conversation_title(
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

    conversations = await list_chat_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert conversations[0]["title"] == "Startup Failure Debugging"


@pytest.mark.asyncio
async def test_list_chat_conversations_hides_internal_lifecycle_only_rows(
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
        workspace_path="/work/WindieOS",
        workspace_name="WindieOS",
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

    conversations = await list_chat_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert conversations == []


@pytest.mark.asyncio
async def test_list_chat_conversations_uses_user_facing_metadata(
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
            "/work/WindieOS",
            "WindieOS",
            {"text": "what workspace am I in?"},
        ),
        (
            "assistant_message",
            "assistant",
            "You are in WindieOS.",
            None,
            None,
            {"text": "You are in WindieOS."},
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
    for index, (event_type, role, content, workspace_path, workspace_name, payload) in enumerate(
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

    conversations = await list_chat_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert [conversation["conversation_id"] for conversation in conversations] == [
        "conv-visible"
    ]
    assert conversations[0]["entry_count"] == 4
    assert conversations[0]["title"] == "what workspace am I in?"
    assert conversations[0]["last_message"] == "You are in WindieOS."
    assert conversations[0]["workspace_path"] == "/work/WindieOS"
    assert conversations[0]["workspace_name"] == "WindieOS"


@pytest.mark.asyncio
async def test_list_chat_conversations_returns_one_row_per_conversation(
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

    conversations = await list_chat_conversations(
        db_path=db_path,
        user_id="user-1",
        limit=10,
    )

    assert [conversation["conversation_id"] for conversation in conversations] == ["conv-1"]
    assert conversations[0]["entry_count"] == 5
    assert conversations[0]["title"] == "hello"


@pytest.mark.asyncio
async def test_replace_chat_conversation_rolls_back_when_replacement_insert_fails(
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
        await replace_chat_conversation(
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

    rows = await get_chat_events(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        limit=10,
    )

    assert [row["content"] for row in rows] == ["original"]
    assert rows[0]["revision_id"] == "rev-old"


@pytest.mark.asyncio
async def test_replace_chat_conversation_persists_rewrite_revision_metadata(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await replace_chat_conversation(
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

    revision = await get_chat_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )
    conversations = await list_chat_conversations(
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
async def test_replace_chat_conversation_preserves_empty_rewrite_revision(
    tmp_path: Path,
):
    db_path = str(tmp_path / "memory.db")
    await init_episodic_schema(db_path)
    await init_chat_event_schema(db_path)

    await replace_chat_conversation(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-empty",
        revision_id="rev-empty",
        revision_updated_at="2026-05-17T12:03:00+00:00",
        events=[],
    )

    revision = await get_chat_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-empty",
    )
    conversations = await list_chat_conversations(
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
async def test_rewrite_chat_conversation_after_event_deletes_tail_only(tmp_path: Path):
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

    result = await rewrite_chat_conversation_after_event(
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

    rows = await get_chat_events(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
        limit=10,
    )
    revision = await get_chat_conversation_revision(
        db_path=db_path,
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert result == {"deleted_count": 2, "inserted_count": 1}
    assert [row["id"] for row in rows] == ["evt-user", "evt-rewrite"]
    assert [row["message_index"] for row in rows] == [1, 2]
    assert revision["revision_id"] == "rev-new"
