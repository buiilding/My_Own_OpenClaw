import json
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
        value = float((len(text) % 7) + 1)
        return np.full((self.dimension,), value, dtype=np.float32)


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


def _create_episodic_search_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                content TEXT,
                timestamp TEXT,
                metadata TEXT,
                embedding_id INTEGER,
                conversation_id TEXT,
                record_kind TEXT,
                role TEXT,
                message_index INTEGER,
                message_type TEXT
            )
            """
        )
        conn.commit()


def _create_semantic_search_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                content TEXT,
                timestamp TEXT,
                metadata TEXT,
                embedding_id INTEGER
            )
            """
        )
        conn.commit()


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
async def test_search_enriches_user_transcript_results_with_assistant_pairs(tmp_path: Path):
    store = _build_store(tmp_path)
    _create_episodic_search_table(store.episodic_db_path)
    _create_semantic_search_table(store.semantic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.execute(
            """
            INSERT INTO memories (
                id, user_id, content, timestamp, metadata, embedding_id,
                conversation_id, record_kind, role, message_index, message_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-row",
                "user-1",
                "Please draft a follow-up email",
                "2026-03-01T00:00:00+00:00",
                json.dumps({"record_kind": "transcript", "role": "user", "message_index": 1}),
                0,
                "conv-1",
                "transcript",
                "user",
                1,
                "llm-text",
            ),
        )
        conn.execute(
            """
            INSERT INTO memories (
                id, user_id, content, timestamp, metadata, embedding_id,
                conversation_id, record_kind, role, message_index, message_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "assistant-row",
                "user-1",
                "Absolutely. Here is a concise follow-up draft.",
                "2026-03-01T00:01:00+00:00",
                json.dumps({"record_kind": "transcript", "role": "assistant", "message_index": 2}),
                None,
                "conv-1",
                "transcript",
                "assistant",
                2,
                "llm-text",
            ),
        )
        conn.commit()

    with sqlite3.connect(store.semantic_db_path) as conn:
        conn.execute(
            """
            INSERT INTO memories (id, user_id, content, timestamp, metadata, embedding_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "semantic-row",
                "user-1",
                "User prefers concise writing",
                "2026-03-01T00:02:00+00:00",
                json.dumps({}),
                0,
            ),
        )
        conn.commit()

    store.episodic_index = faiss.IndexFlatIP(store.embedder.dimension)
    episodic_vector = np.full((1, store.embedder.dimension), 0.9, dtype=np.float32)
    faiss.normalize_L2(episodic_vector)
    store.episodic_index.add(episodic_vector)
    store.episodic_vector_id_to_memory_id = {0: "user-row"}
    store.episodic_memory_id_to_vector_id = {"user-row": 0}

    store.semantic_index = faiss.IndexFlatIP(store.embedder.dimension)
    semantic_vector = np.full((1, store.embedder.dimension), 0.8, dtype=np.float32)
    faiss.normalize_L2(semantic_vector)
    store.semantic_index.add(semantic_vector)
    store.semantic_vector_id_to_memory_id = {0: "semantic-row"}
    store.semantic_memory_id_to_vector_id = {"semantic-row": 0}

    results = await store.search("follow-up", "user-1", limit=3)

    episodic_rows = [row for row in results if row.get("type") == "episodic"]
    semantic_rows = [row for row in results if row.get("type") == "semantic"]

    assert len(episodic_rows) == 1
    assert episodic_rows[0]["text"] == (
        "User: Please draft a follow-up email\n"
        "Assistant: Absolutely. Here is a concise follow-up draft."
    )
    assert len(semantic_rows) == 1
    assert semantic_rows[0]["text"] == "User prefers concise writing"
