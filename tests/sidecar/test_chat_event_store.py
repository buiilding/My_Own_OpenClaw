from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.chat_event_store import (  # noqa: E402
    append_chat_event,
    get_chat_events,
    init_chat_event_schema,
    list_chat_conversations,
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
