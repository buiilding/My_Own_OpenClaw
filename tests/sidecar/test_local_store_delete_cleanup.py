import sqlite3
import sys
from pathlib import Path

import pytest

frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from memory.local_store import LocalMemoryStore  # noqa: E402

try:
    import faiss  # noqa: E402
except ImportError:  # pragma: no cover
    faiss = None


class _DummyEmbedder:
    @property
    def dimension(self) -> int:
        return 8


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
        conn.commit()


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
async def test_delete_conversation_clears_faiss_artifacts_when_empty(tmp_path: Path):
    store = _build_store(tmp_path)
    _create_episodic_memories_table(store.episodic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.execute(
            """
            INSERT INTO memories (id, user_id, embedding_id, conversation_id, record_kind)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("episodic-1", "user-1", 3, "conv-1", "transcript"),
        )
        conn.commit()

    store.episodic_memory_id_to_vector_id = {"episodic-1": 3}
    store.episodic_vector_id_to_memory_id = {3: "episodic-1"}
    store.episodic_next_vector_id = 9
    store.episodic_index = faiss.IndexFlatIP(store.embedder.dimension)
    store.episodic_index_path.write_bytes(b"stale-index")

    deleted_count = await store.delete_conversation(
        user_id="user-1",
        conversation_id="conv-1",
        record_kind="transcript",
    )

    assert deleted_count == 1
    assert store.episodic_memory_id_to_vector_id == {}
    assert store.episodic_vector_id_to_memory_id == {}
    assert store.episodic_next_vector_id == 0
    assert store.episodic_index is not None
    assert store.episodic_index.ntotal == 0
    assert store.episodic_index_path.exists() is False
