import sqlite3
from pathlib import Path

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.conversation_titles import derive_conversation_title  # noqa: E402
from memory.local_store import LocalMemoryStore  # noqa: E402
from memory.sqlite_store import init_episodic_schema  # noqa: E402


class _DummyEmbedder:
    @property
    def dimension(self) -> int:
        return 8

    async def embed_text(self, text: str):  # pragma: no cover
        raise AssertionError("title tests should skip embedding")


def _build_store(tmp_path: Path) -> LocalMemoryStore:
    store = LocalMemoryStore.__new__(LocalMemoryStore)

    store.embedder = _DummyEmbedder()
    store.episodic_db_path = tmp_path / "episodic.db"
    store.semantic_db_path = tmp_path / "semantic.db"
    store.episodic_index_path = tmp_path / "episodic.faiss.index"
    store.semantic_index_path = tmp_path / "semantic.faiss.index"

    store.episodic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 0
    store.episodic_index = None

    store.semantic_vector_id_to_memory_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.semantic_next_vector_id = 0
    store.semantic_index = None

    return store


@pytest.mark.asyncio
async def test_title_generation_requires_user_and_assistant_rows(tmp_path: Path):
    store = _build_store(tmp_path)
    await init_episodic_schema(store.episodic_db_path)

    conversation_id = "conv_abc123"
    user_text = "How to fix ubuntu mic settings"
    assistant_text = "Sure, let's troubleshoot PulseAudio and input sources."

    await store.add(
        text=user_text,
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="user",
        message_index=1,
        skip_embedding=True,
        timestamp="2026-02-25T00:00:00+00:00",
    )

    user_only_conversations = await store.list_conversations("user-1")
    assert len(user_only_conversations) == 1
    assert user_only_conversations[0]["conversation_id"] == conversation_id
    assert user_only_conversations[0]["title"] is None
    assert user_only_conversations[0]["title_source"] is None

    with sqlite3.connect(store.episodic_db_path) as conn:
        title_count_before = conn.execute(
            "SELECT COUNT(*) FROM conversation_titles WHERE user_id = ? AND conversation_id = ?",
            ("user-1", conversation_id),
        ).fetchone()[0]
    assert title_count_before == 0

    await store.add(
        text=assistant_text,
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-25T00:00:01+00:00",
    )

    conversations = await store.list_conversations("user-1")
    assert len(conversations) == 1
    assert conversations[0]["conversation_id"] == conversation_id
    assert conversations[0]["title"] == derive_conversation_title(user_text, assistant_text)
    assert conversations[0]["title_source"] == "heuristic"
    assert conversations[0]["is_resumable"] is True


@pytest.mark.asyncio
async def test_delete_conversation_removes_conversation_title_row(tmp_path: Path):
    store = _build_store(tmp_path)
    await init_episodic_schema(store.episodic_db_path)

    conversation_id = "conv_delete_me"

    await store.add(
        text="Please help me build an API migration plan",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="user",
        message_index=1,
        skip_embedding=True,
        timestamp="2026-02-25T00:01:00+00:00",
    )
    await store.add(
        text="Start by mapping current endpoints to the new contract.",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-25T00:01:01+00:00",
    )

    conversations_before_delete = await store.list_conversations("user-1")
    assert len(conversations_before_delete) == 1
    assert conversations_before_delete[0]["title"]

    with sqlite3.connect(store.episodic_db_path) as conn:
        title_count_before_delete = conn.execute(
            "SELECT COUNT(*) FROM conversation_titles WHERE user_id = ? AND conversation_id = ?",
            ("user-1", conversation_id),
        ).fetchone()[0]
    assert title_count_before_delete == 1

    deleted_count = await store.delete_conversation(
        user_id="user-1",
        conversation_id=conversation_id,
        record_kind="transcript",
    )

    assert deleted_count == 2

    with sqlite3.connect(store.episodic_db_path) as conn:
        remaining_transcript_rows = conn.execute(
            "SELECT COUNT(*) FROM memories WHERE user_id = ? AND conversation_id = ?",
            ("user-1", conversation_id),
        ).fetchone()[0]
        remaining_title_rows = conn.execute(
            "SELECT COUNT(*) FROM conversation_titles WHERE user_id = ? AND conversation_id = ?",
            ("user-1", conversation_id),
        ).fetchone()[0]

    assert remaining_transcript_rows == 0
    assert remaining_title_rows == 0
