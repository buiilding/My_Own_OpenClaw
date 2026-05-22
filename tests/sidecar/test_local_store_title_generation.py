import asyncio

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import memory.local_store as local_store_module  # noqa: E402
from memory.local_store import LocalMemoryStore  # noqa: E402


class FakeTitleClient:
    def __init__(self, title="Repo Startup Debugging"):
        self.title = title
        self.calls = []

    async def generate_title(self, **kwargs):
        self.calls.append(kwargs)
        return self.title


async def _append_chat_event(store, *, role, content, message_type, event_type):
    return await store.append_chat_event(
        user_id="user-title",
        conversation_id="conv-title",
        event_type=event_type,
        role=role,
        content=content,
        timestamp="2026-05-17T12:00:00+00:00",
        message_index=None,
        revision_id="rev-1",
        turn_ref="turn-1",
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={
            "model_id": "k2p5",
            "model_provider": "kimi-coding",
        },
        attachments=[],
        event_payload={
            "eventId": f"evt-{role}",
            "type": event_type,
            "conversationRef": "conv-title",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "sdk",
            "payload": {
                "text": content,
                "role": role,
                "messageType": message_type,
            },
        },
    )


async def _await_title_tasks(store):
    tasks = list(store._title_generation_tasks.values())
    if tasks:
        await asyncio.gather(*tasks)


@pytest.mark.asyncio
async def test_title_generation_runs_after_first_completed_assistant_text(tmp_path):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    store = LocalMemoryStore(db_path=str(tmp_path / "memory"))
    await store._init_databases()
    fake_client = FakeTitleClient()
    store.title_client = fake_client

    await _append_chat_event(
        store,
        role="user",
        content="can you debug the repo startup failure",
        message_type="user",
        event_type="user_message",
    )
    assert fake_client.calls == []

    await _append_chat_event(
        store,
        role="assistant",
        content="The failure is in the frontend dev server startup path.",
        message_type="llm-text",
        event_type="assistant_message",
    )
    await _await_title_tasks(store)

    conversations = await store.list_chat_conversations("user-title", limit=10)

    assert conversations[0]["title"] == "Repo Startup Debugging"
    assert fake_client.calls == [
        {
            "user_id": "user-title",
            "user_message": "can you debug the repo startup failure",
            "assistant_message": "The failure is in the frontend dev server startup path.",
            "model_id": "k2p5",
            "model_provider": "kimi-coding",
        }
    ]


@pytest.mark.asyncio
async def test_title_generation_does_not_overwrite_locked_title(tmp_path):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    store = LocalMemoryStore(db_path=str(tmp_path / "memory"))
    await store._init_databases()
    fake_client = FakeTitleClient("Generated Title")
    store.title_client = fake_client

    await _append_chat_event(
        store,
        role="user",
        content="plan my deployment",
        message_type="user",
        event_type="user_message",
    )

    import aiosqlite

    async with aiosqlite.connect(store.episodic_db_path) as conn:
        await conn.execute(
            """
            INSERT INTO conversation_titles (
                user_id, conversation_id, title, source, is_locked, created_at, updated_at
            )
            VALUES (?, ?, ?, 'manual', 1, ?, ?)
            ON CONFLICT(user_id, conversation_id) DO UPDATE SET
                title = excluded.title,
                source = excluded.source,
                is_locked = excluded.is_locked,
                updated_at = excluded.updated_at
            """,
            (
                "user-title",
                "conv-title",
                "Manual Deployment Plan",
                "2026-05-17T12:01:00+00:00",
                "2026-05-17T12:01:00+00:00",
            ),
        )
        await conn.commit()

    await _append_chat_event(
        store,
        role="assistant",
        content="Let's plan the deployment steps.",
        message_type="llm-text",
        event_type="assistant_message",
    )
    await _await_title_tasks(store)

    conversations = await store.list_chat_conversations("user-title", limit=10)

    assert conversations[0]["title"] == "Manual Deployment Plan"
    assert fake_client.calls == []
