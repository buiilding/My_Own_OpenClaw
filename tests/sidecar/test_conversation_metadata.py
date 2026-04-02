from pathlib import Path

import aiosqlite
import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.local_store import LocalMemoryStore  # noqa: E402
from memory.sqlite_store import init_episodic_schema  # noqa: E402


class _DummyEmbedder:
    @property
    def dimension(self) -> int:
        return 8

    async def embed_text(self, text: str):  # pragma: no cover
        raise AssertionError("conversation metadata tests should not invoke embeddings")


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
async def test_update_conversation_metadata_persists_manual_title_and_pin_state(tmp_path: Path):
    store = _build_store(tmp_path)
    await init_episodic_schema(store.episodic_db_path)

    await store.add(
      text="Need help debugging Linux audio",
      user_id="user-1",
      metadata={"type": "episodic"},
      conversation_id="conv_audio",
      record_kind="transcript",
      role="user",
      message_index=1,
      skip_embedding=True,
      timestamp="2026-04-01T00:00:00+00:00",
    )

    updated = await store.update_conversation_metadata(
        user_id="user-1",
        conversation_id="conv_audio",
        title="Linux audio fixes",
        pinned=True,
    )

    assert updated["conversation_id"] == "conv_audio"
    assert updated["title"] == "Linux audio fixes"
    assert updated["title_source"] == "manual"
    assert updated["is_locked"] is True
    assert updated["is_pinned"] is True

    conversations = await store.list_conversations(user_id="user-1", limit=10)
    assert conversations == [
        {
            "conversation_id": "conv_audio",
            "first_timestamp": "2026-04-01T00:00:00+00:00",
            "last_timestamp": "2026-04-01T00:00:00+00:00",
            "entry_count": 1,
            "record_kind": "transcript",
            "model_id": None,
            "model_provider": None,
            "title": "Linux audio fixes",
            "title_source": "manual",
            "is_pinned": True,
            "is_resumable": True,
        }
    ]

    async with aiosqlite.connect(store.episodic_db_path) as conn:
        conn.row_factory = aiosqlite.Row
        row = await (
            await conn.execute(
                """
                SELECT title, source, is_locked, is_pinned
                FROM conversation_titles
                WHERE user_id = ? AND conversation_id = ?
                """,
                ("user-1", "conv_audio"),
            )
        ).fetchone()

    assert row["title"] == "Linux audio fixes"
    assert row["source"] == "manual"
    assert row["is_locked"] == 1
    assert row["is_pinned"] == 1
