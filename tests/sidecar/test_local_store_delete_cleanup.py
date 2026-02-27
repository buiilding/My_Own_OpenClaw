import sqlite3
from pathlib import Path

import numpy as np
import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.local_store import LocalMemoryStore  # noqa: E402

try:
    import faiss  # noqa: E402
except ImportError:  # pragma: no cover
    faiss = None


class _DummyEmbedder:
    @property
    def dimension(self) -> int:
        return 8

    async def embed_text(self, text: str):
        value = float((len(text) % 9) + 1)
        return np.full((self.dimension,), value, dtype=np.float32)


class _FailOnEmbedder:
    @property
    def dimension(self) -> int:
        return 8

    async def embed_text(self, text: str):
        raise AssertionError("search should not call embedder when no indices are searchable")


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


def _create_semantic_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                embedding_id INTEGER
            )
            """
        )
        conn.commit()


def _create_episodic_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                embedding_id INTEGER,
                conversation_id TEXT,
                record_kind TEXT
            )
            """
        )
        conn.execute(
            """
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
            """
        )
        conn.commit()


def _create_rebuild_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                content TEXT,
                embedding_id INTEGER
            )
            """
        )
        conn.commit()


def _create_unprocessed_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                content TEXT,
                timestamp TEXT,
                metadata TEXT,
                conversation_id TEXT,
                record_kind TEXT,
                role TEXT,
                message_type TEXT,
                tool_name TEXT,
                is_semanticized INTEGER
            )
            """
        )
        conn.commit()


@pytest.mark.asyncio
async def test_search_short_circuits_without_embedding_when_no_searchable_indices(
    tmp_path: Path,
):
    store = _build_store(tmp_path)
    store.embedder = _FailOnEmbedder()
    store.episodic_index = None
    store.semantic_index = None

    results = await store.search("hello", "user-1")

    assert results == []


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
async def test_delete_semantic_memory_clears_faiss_artifacts_when_empty(tmp_path: Path):
    store = _build_store(tmp_path)
    _create_semantic_memories_table(store.semantic_db_path)

    with sqlite3.connect(store.semantic_db_path) as conn:
        conn.execute(
            "INSERT INTO memories (id, user_id, embedding_id) VALUES (?, ?, ?)",
            ("semantic-1", "user-1", 0),
        )
        conn.commit()

    store.semantic_memory_id_to_vector_id = {"semantic-1": 0}
    store.semantic_vector_id_to_memory_id = {0: "semantic-1"}
    store.semantic_next_vector_id = 12
    store.semantic_index = faiss.IndexFlatIP(store.embedder.dimension)
    store.semantic_index_path.write_bytes(b"stale-index")

    deleted = await store.delete_semantic_memory("user-1", "semantic-1")

    assert deleted is True
    assert store.semantic_memory_id_to_vector_id == {}
    assert store.semantic_vector_id_to_memory_id == {}
    assert store.semantic_next_vector_id == 0
    assert store.semantic_index is not None
    assert store.semantic_index.ntotal == 0
    assert store.semantic_index_path.exists() is False


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
@pytest.mark.parametrize(
    ("memory_id", "embedding_id", "conversation_id"),
    [
        ("episodic-1", 3, "conv-1"),
        ("episodic-null", 5, None),
    ],
    ids=["conversation-id", "null-conversation-id"],
)
async def test_delete_conversation_clears_faiss_artifacts_when_empty(
    tmp_path: Path,
    memory_id: str,
    embedding_id: int,
    conversation_id: str | None,
):
    store = _build_store(tmp_path)
    _create_episodic_memories_table(store.episodic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.execute(
            """
            INSERT INTO memories (id, user_id, embedding_id, conversation_id, record_kind)
            VALUES (?, ?, ?, ?, ?)
            """,
            (memory_id, "user-1", embedding_id, conversation_id, "transcript"),
        )
        conn.commit()

    store.episodic_memory_id_to_vector_id = {memory_id: embedding_id}
    store.episodic_vector_id_to_memory_id = {embedding_id: memory_id}
    store.episodic_next_vector_id = 10
    store.episodic_index = faiss.IndexFlatIP(store.embedder.dimension)
    store.episodic_index_path.write_bytes(b"stale-index")

    deleted_count = await store.delete_conversation(
        user_id="user-1",
        conversation_id=conversation_id,
        record_kind="transcript",
    )

    assert deleted_count == 1
    assert store.episodic_memory_id_to_vector_id == {}
    assert store.episodic_vector_id_to_memory_id == {}
    assert store.episodic_next_vector_id == 0
    assert store.episodic_index is not None
    assert store.episodic_index.ntotal == 0
    assert store.episodic_index_path.exists() is False


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
async def test_rebuild_index_rewrites_sparse_embedding_ids_to_contiguous_ids(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    store = _build_store(tmp_path)
    _create_rebuild_memories_table(store.episodic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.execute(
            "INSERT INTO memories (id, user_id, content, embedding_id) VALUES (?, ?, ?, ?)",
            ("episodic-a", "user-1", "alpha", 11),
        )
        conn.execute(
            "INSERT INTO memories (id, user_id, content, embedding_id) VALUES (?, ?, ?, ?)",
            ("episodic-b", "user-1", "bravo", 4),
        )
        conn.commit()

    store.episodic_memory_id_to_vector_id = {"episodic-a": 11, "episodic-b": 4}
    store.episodic_vector_id_to_memory_id = {11: "episodic-a", 4: "episodic-b"}
    store.episodic_next_vector_id = 12
    store.episodic_index = faiss.IndexFlatIP(store.embedder.dimension)

    async def _noop_save():
        return None

    monkeypatch.setattr(store, "_save_faiss_indices", _noop_save)

    await store._rebuild_index("episodic")

    assert store.episodic_index.ntotal == 2
    assert store.episodic_next_vector_id == 2
    assert set(store.episodic_vector_id_to_memory_id.keys()) == {0, 1}
    assert set(store.episodic_memory_id_to_vector_id.values()) == {0, 1}

    with sqlite3.connect(store.episodic_db_path) as conn:
        rows = conn.execute(
            "SELECT id, embedding_id FROM memories ORDER BY id ASC"
        ).fetchall()
    embedding_by_id = {row[0]: row[1] for row in rows}
    assert embedding_by_id["episodic-b"] == 0
    assert embedding_by_id["episodic-a"] == 1


@pytest.mark.asyncio
async def test_get_unprocessed_memories_after_id_handles_existing_and_missing_watermarks(
    tmp_path: Path,
):
    store = _build_store(tmp_path)
    _create_unprocessed_memories_table(store.episodic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.executemany(
            """
            INSERT INTO memories (
                id,
                user_id,
                content,
                timestamp,
                metadata,
                conversation_id,
                record_kind,
                role,
                message_type,
                tool_name,
                is_semanticized
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "m1",
                    "user-1",
                    "first",
                    "2026-01-01T00:00:00+00:00",
                    "{}",
                    "conv-1",
                    "interaction",
                    "user",
                    "llm-text",
                    None,
                    0,
                ),
                (
                    "m2",
                    "user-1",
                    "second",
                    "2026-01-02T00:00:00+00:00",
                    "{}",
                    "conv-1",
                    "interaction",
                    "assistant",
                    "llm-text",
                    None,
                    0,
                ),
                (
                    "m3",
                    "user-1",
                    "same-timestamp-after-watermark",
                    "2026-01-02T00:00:00+00:00",
                    "{}",
                    "conv-1",
                    "interaction",
                    "assistant",
                    "llm-text",
                    None,
                    0,
                ),
                (
                    "m4",
                    "user-1",
                    "semanticized",
                    "2026-01-03T00:00:00+00:00",
                    "{}",
                    "conv-1",
                    "interaction",
                    "assistant",
                    "llm-text",
                    None,
                    1,
                ),
                (
                    "m5",
                    "user-2",
                    "different-user",
                    "2026-01-03T00:00:00+00:00",
                    "{}",
                    "conv-1",
                    "interaction",
                    "assistant",
                    "llm-text",
                    None,
                    0,
                ),
            ],
        )
        conn.commit()

    after_existing_watermark = await store.get_unprocessed_memories_after_id(
        last_id="m2",
        user_id="user-1",
        limit=100,
    )
    all_after_missing_watermark = await store.get_unprocessed_memories_after_id(
        last_id="missing-watermark",
        user_id="user-1",
        limit=100,
    )

    assert [row["id"] for row in after_existing_watermark] == ["m3"]
    assert [row["id"] for row in all_after_missing_watermark] == ["m1", "m2", "m3"]
