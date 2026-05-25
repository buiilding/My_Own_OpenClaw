from pathlib import Path

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
)
from memory.sqlite_store import init_episodic_schema  # noqa: E402


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
    assert conversations[0]["conversation_id"] == "conv-empty"
    assert conversations[0]["revision_id"] == "rev-empty"
    assert conversations[0]["entry_count"] == 0
