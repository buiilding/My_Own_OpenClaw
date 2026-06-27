"""Covers local-runtime memory store delete cleanup behavior."""

import json
import sqlite3
from pathlib import Path

import numpy as np
import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.chat_event_store import (
    append_chat_event,  # noqa: E402
    init_chat_event_schema,
)
from memory.index_artifact_cleanup import cleanup_index_artifacts_if_empty  # noqa: E402
from memory.local_store import LocalMemoryStore  # noqa: E402
from memory.record_kinds import INTERACTION_RECORD_KIND  # noqa: E402

try:
    import faiss  # noqa: E402
except ImportError:  # pragma: no cover
    faiss = None


class _WatermarkStoreStub:
    def __init__(self) -> None:
        self.updates = []

    async def update(self, **kwargs) -> None:
        self.updates.append(kwargs)


def _build_store(tmp_path: Path) -> LocalMemoryStore:
    store = LocalMemoryStore.__new__(LocalMemoryStore)

    store.episodic_db_path = tmp_path / "episodic.db"
    store.semantic_db_path = tmp_path / "semantic.db"
    store.history_db_path = tmp_path / "history" / "history.db"
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
    store._default_embedding_dimension = 8
    store._embedding_space_metadata = None
    store.embedding_space_metadata_path = tmp_path / "embedding_space.json"

    return store


def _create_semantic_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                embedding_id INTEGER
            )
            """)
        conn.commit()


def _create_episodic_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                embedding_id INTEGER,
                conversation_id TEXT,
                record_kind TEXT
            )
            """)
        conn.commit()


def _create_bulk_clear_episodic_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                content TEXT,
                embedding_id INTEGER,
                conversation_id TEXT,
                record_kind TEXT,
                role TEXT,
                message_type TEXT
            )
            """)
        conn.commit()


def _create_bulk_clear_semantic_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                content TEXT,
                embedding_id INTEGER
            )
            """)
        conn.commit()


def _create_unprocessed_memories_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
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
            """)
        conn.commit()


@pytest.mark.asyncio
async def test_search_by_embedding_short_circuits_when_no_searchable_indices(
    tmp_path: Path,
):
    store = _build_store(tmp_path)
    store.episodic_index = None
    store.semantic_index = None

    results = await store.search_by_embedding([1.0], "user-1")

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
    store.semantic_index = faiss.IndexFlatIP(store._default_embedding_dimension)
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
async def test_list_episodic_memories_returns_interaction_rows_only(tmp_path: Path):
    store = _build_store(tmp_path)
    _create_unprocessed_memories_table(store.episodic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.executemany(
            """
            INSERT INTO memories (
                id, user_id, content, timestamp, metadata, conversation_id, record_kind, role, message_type, tool_name, is_semanticized
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "interaction-1",
                    "user-1",
                    "User: keep this\nAssistant: yes",
                    "2026-04-15T21:44:00Z",
                    json.dumps(
                        {
                            "record_kind": INTERACTION_RECORD_KIND,
                            "source": "interaction_completed",
                        }
                    ),
                    "conv-1",
                    INTERACTION_RECORD_KIND,
                    "assistant",
                    "llm-text",
                    None,
                    0,
                ),
                (
                    "raw-memory-1",
                    "user-1",
                    "raw memory row",
                    "2026-04-15T21:43:00Z",
                    json.dumps({"record_kind": "memory", "role": "user"}),
                    "conv-1",
                    "memory",
                    "user",
                    "user",
                    None,
                    0,
                ),
            ],
        )
        conn.commit()

    results = await store.list_episodic_memories("user-1")

    assert results == [
        {
            "id": "interaction-1",
            "content": "User: keep this\nAssistant: yes",
            "timestamp": "2026-04-15T21:44:00Z",
            "metadata": {
                "record_kind": INTERACTION_RECORD_KIND,
                "source": "interaction_completed",
            },
            "conversation_id": "conv-1",
            "record_kind": INTERACTION_RECORD_KIND,
        }
    ]


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
async def test_delete_episodic_memory_clears_faiss_artifacts_when_empty(tmp_path: Path):
    store = _build_store(tmp_path)
    _create_episodic_memories_table(store.episodic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.execute(
            """
            INSERT INTO memories (id, user_id, embedding_id, conversation_id, record_kind)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("episodic-1", "user-1", 0, "conv-1", "interaction"),
        )
        conn.commit()

    store.episodic_memory_id_to_vector_id = {"episodic-1": 0}
    store.episodic_vector_id_to_memory_id = {0: "episodic-1"}
    store.episodic_next_vector_id = 7
    store.episodic_index = faiss.IndexFlatIP(store._default_embedding_dimension)
    store.episodic_index_path.write_bytes(b"stale-index")

    deleted = await store.delete_episodic_memory("user-1", "episodic-1")

    assert deleted is True
    assert store.episodic_memory_id_to_vector_id == {}
    assert store.episodic_vector_id_to_memory_id == {}
    assert store.episodic_next_vector_id == 0
    assert store.episodic_index is not None
    assert store.episodic_index.ntotal == 0
    assert store.episodic_index_path.exists() is False


@pytest.mark.asyncio
async def test_index_artifact_cleanup_preserves_artifacts_when_indexed_rows_remain(
    tmp_path: Path,
):
    db_path = tmp_path / "semantic.db"
    index_path = tmp_path / "semantic.faiss.index"
    _create_semantic_memories_table(db_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO memories (id, user_id, embedding_id) VALUES (?, ?, ?)",
            ("semantic-1", "user-1", 0),
        )
        conn.commit()

    vector_id_to_memory_id = {0: "semantic-1"}
    memory_id_to_vector_id = {"semantic-1": 0}
    index_path.write_bytes(b"live-index")

    result = await cleanup_index_artifacts_if_empty(
        memory_type="semantic",
        db_path=str(db_path),
        index_path=index_path,
        embedding_dimension=8,
        faiss_module=None,
        vector_id_to_memory_id=vector_id_to_memory_id,
        memory_id_to_vector_id=memory_id_to_vector_id,
    )

    assert result is None
    assert vector_id_to_memory_id == {0: "semantic-1"}
    assert memory_id_to_vector_id == {"semantic-1": 0}
    assert index_path.read_bytes() == b"live-index"


@pytest.mark.asyncio
async def test_index_artifact_cleanup_clears_mappings_without_faiss(
    tmp_path: Path,
):
    db_path = tmp_path / "semantic.db"
    index_path = tmp_path / "semantic.faiss.index"
    _create_semantic_memories_table(db_path)
    index_path.write_bytes(b"stale-index")

    vector_id_to_memory_id = {0: "semantic-1"}
    memory_id_to_vector_id = {"semantic-1": 0}

    result = await cleanup_index_artifacts_if_empty(
        memory_type="semantic",
        db_path=str(db_path),
        index_path=index_path,
        embedding_dimension=8,
        faiss_module=None,
        vector_id_to_memory_id=vector_id_to_memory_id,
        memory_id_to_vector_id=memory_id_to_vector_id,
    )

    assert result is not None
    assert result.empty_index is None
    assert vector_id_to_memory_id == {}
    assert memory_id_to_vector_id == {}
    assert index_path.exists() is False


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
async def test_clear_local_memory_preserves_non_interaction_rows_and_rebuilds_indices(
    tmp_path: Path,
):
    store = _build_store(tmp_path)
    _create_bulk_clear_episodic_memories_table(store.episodic_db_path)
    _create_bulk_clear_semantic_memories_table(store.semantic_db_path)

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.executemany(
            """
            INSERT INTO memories (
                id, user_id, content, embedding_id, conversation_id, record_kind, role, message_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "interaction-1",
                    "user-1",
                    "episodic memory",
                    0,
                    "conv-1",
                    INTERACTION_RECORD_KIND,
                    "assistant",
                    "llm-text",
                ),
                (
                    "raw-memory-1",
                    "user-1",
                    "raw memory row",
                    1,
                    "conv-1",
                    "memory",
                    "user",
                    "user",
                ),
            ],
        )
        conn.commit()

    with sqlite3.connect(store.semantic_db_path) as conn:
        conn.execute(
            "INSERT INTO memories (id, user_id, content, embedding_id) VALUES (?, ?, ?, ?)",
            ("semantic-1", "user-1", "semantic memory", 0),
        )
        conn.commit()

    store.episodic_index = faiss.IndexFlatIP(store._default_embedding_dimension)
    store.episodic_index.add(
        np.stack(
            [
                np.full((store._default_embedding_dimension,), 1.0, dtype=np.float32),
                np.full((store._default_embedding_dimension,), 2.0, dtype=np.float32),
            ],
            axis=0,
        )
    )
    store.semantic_index = faiss.IndexFlatIP(store._default_embedding_dimension)
    store.semantic_index.add(
        np.full((1, store._default_embedding_dimension), 3.0, dtype=np.float32)
    )
    store._watermark_store = _WatermarkStoreStub()

    result = await store.clear_local_memory("user-1")

    assert result == {
        "episodic_deleted_count": 1,
        "semantic_deleted_count": 1,
    }
    assert store.episodic_index is not None
    assert store.episodic_index.ntotal == 0
    assert store.semantic_index is not None
    assert store.semantic_index.ntotal == 0
    assert store.semantic_index_path.exists() is False
    assert store._watermark_store.updates == [
        {
            "last_semanticized_id": None,
            "pending_message_count": 0,
        },
    ]

    with sqlite3.connect(store.episodic_db_path) as conn:
        remaining_rows = conn.execute(
            "SELECT id, record_kind, embedding_id FROM memories ORDER BY id"
        ).fetchall()
    assert remaining_rows == [
        ("raw-memory-1", "memory", None),
    ]

    with sqlite3.connect(store.semantic_db_path) as conn:
        remaining_semantic_rows = conn.execute(
            "SELECT COUNT(*) FROM memories"
        ).fetchone()[0]
    assert remaining_semantic_rows == 0


@pytest.mark.asyncio
@pytest.mark.skipif(faiss is None, reason="faiss is required")
async def test_clear_chat_history_preserves_memory_rows_and_titles_are_removed(
    tmp_path: Path,
):
    store = _build_store(tmp_path)
    _create_bulk_clear_episodic_memories_table(store.episodic_db_path)
    store.history_db_path.parent.mkdir(parents=True, exist_ok=True)
    await init_chat_event_schema(str(store.history_db_path))

    with sqlite3.connect(store.episodic_db_path) as conn:
        conn.executemany(
            """
            INSERT INTO memories (
                id, user_id, content, embedding_id, conversation_id, record_kind, role, message_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "interaction-1",
                    "user-1",
                    "episodic memory",
                    0,
                    "conv-1",
                    "interaction",
                    "assistant",
                    "llm-text",
                ),
            ],
        )
        conn.commit()

    with sqlite3.connect(store.history_db_path) as conn:
        conn.execute(
            """
            INSERT INTO conversation_titles (
                user_id, conversation_id, title, source, is_locked, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-1",
                "conv-1",
                "Saved title",
                "heuristic",
                0,
                "2026-03-11T00:00:00+00:00",
                "2026-03-11T00:00:00+00:00",
            ),
        )
        conn.execute(
            """
            INSERT INTO conversation_display_timeline (
                user_id, conversation_id, revision_id, row_index, row_id, role, row_type,
                content, turn_ref, metadata, reason, base_revision_id, created_at, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-1",
                "conv-1",
                "rev-display",
                0,
                "row-user",
                "user",
                "user_message",
                '"display-only chat"',
                "turn-1",
                "{}",
                "send",
                None,
                "2026-03-11T00:00:00+00:00",
                1,
            ),
        )
        conn.execute(
            """
            INSERT INTO conversation_model_history (
                user_id, conversation_id, revision_id, checkpoint_id, row_index, row_id,
                role, message_type, content, tool_call_id, tool_calls, tool_name,
                image_refs, compaction_facts, source_display_row_ids, created_at, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-1",
                "conv-1",
                "rev-model",
                "checkpoint-1",
                0,
                "model-row-user",
                "user",
                "text",
                '"model history chat"',
                None,
                "[]",
                None,
                "[]",
                "{}",
                "[]",
                "2026-03-11T00:00:00+00:00",
                1,
            ),
        )
        conn.execute(
            """
            INSERT INTO conversation_display_timeline (
                user_id, conversation_id, revision_id, row_index, row_id, role, row_type,
                content, turn_ref, metadata, reason, base_revision_id, created_at, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-2",
                "conv-other",
                "rev-other",
                0,
                "row-other",
                "user",
                "user_message",
                '"other user chat"',
                "turn-other",
                "{}",
                "send",
                None,
                "2026-03-11T00:00:00+00:00",
                1,
            ),
        )
        conn.commit()
    await append_chat_event(
        db_path=str(store.history_db_path),
        user_id="user-1",
        conversation_id="conv-1",
        event_type="user_message",
        role="user",
        content="sdk event",
        timestamp="2026-03-11T00:00:00+00:00",
        message_index=1,
        revision_id="rev-1",
        turn_ref=None,
        tool_name=None,
        correlation_id=None,
        workspace_path=None,
        workspace_name=None,
        metadata={},
        attachments=[],
        event_payload={
            "eventId": "chat-event-1",
            "type": "user_message",
            "conversationRef": "conv-1",
            "revisionId": "rev-1",
            "timestamp": "2026-03-11T00:00:00+00:00",
            "source": "sdk",
            "payload": {"text": "sdk event"},
        },
    )

    store.episodic_index = faiss.IndexFlatIP(store._default_embedding_dimension)
    store.episodic_index.add(
        np.stack(
            [
                np.full((store._default_embedding_dimension,), 1.0, dtype=np.float32),
                np.full((store._default_embedding_dimension,), 2.0, dtype=np.float32),
            ],
            axis=0,
        )
    )
    cancel_calls = []

    async def _cancel_titles():
        cancel_calls.append("called")

    store._cancel_title_generation_tasks = _cancel_titles

    result = await store.clear_chat_history("user-1")

    assert result == {
        "deleted_count": 1,
        "deleted_display_row_count": 1,
        "deleted_model_history_row_count": 1,
        "deleted_revision_count": 1,
        "deleted_title_count": 1,
    }
    assert cancel_calls == []
    assert store.episodic_index is not None
    assert store.episodic_index.ntotal == 2

    with sqlite3.connect(store.episodic_db_path) as conn:
        remaining_rows = conn.execute(
            "SELECT id, record_kind, embedding_id FROM memories ORDER BY id"
        ).fetchall()
    with sqlite3.connect(store.history_db_path) as conn:
        remaining_titles = conn.execute(
            "SELECT COUNT(*) FROM conversation_titles"
        ).fetchone()[0]
        remaining_revisions = conn.execute(
            "SELECT COUNT(*) FROM conversation_revisions"
        ).fetchone()[0]
        remaining_display_rows = conn.execute(
            "SELECT user_id, conversation_id FROM conversation_display_timeline ORDER BY user_id"
        ).fetchall()
        remaining_model_history_rows = conn.execute(
            "SELECT COUNT(*) FROM conversation_model_history"
        ).fetchone()[0]
    assert remaining_rows == [("interaction-1", "interaction", 0)]
    assert remaining_titles == 0
    assert remaining_revisions == 0
    assert remaining_display_rows == [("user-2", "conv-other")]
    assert remaining_model_history_rows == 0


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
