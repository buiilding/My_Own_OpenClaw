from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import pytest
import types
import numpy as np

import memory.local_store as local_store_module  # noqa: E402
from memory.local_store import LocalMemoryStore  # noqa: E402


def test_local_memory_store_init_skips_sync_faiss_reads(monkeypatch, tmp_path):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    memory_dir = tmp_path / "memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "episodic.faiss.index").write_bytes(b"stale-index")
    (memory_dir / "semantic.faiss.index").write_bytes(b"stale-index")

    def fail_read_index(_index_path):
        raise AssertionError("LocalMemoryStore.__init__ should not read FAISS indices synchronously")

    monkeypatch.setattr(local_store_module.faiss, "read_index", fail_read_index)

    store = LocalMemoryStore(db_path=str(memory_dir))

    assert store.episodic_index is None
    assert store.semantic_index is None


@pytest.mark.asyncio
async def test_initialize_creates_faiss_indices_before_sync(monkeypatch, tmp_path):
    if local_store_module.faiss is None:
        pytest.skip("FAISS runtime dependency is unavailable")

    async def _noop_async(*_args, **_kwargs):
        return None

    async def _read_index_none(*_args, **_kwargs):
        return None

    observed_sync_state = []

    async def _record_sync(self):
        observed_sync_state.append(
            (
                self.episodic_index is not None,
                self.semantic_index is not None,
            )
        )

    monkeypatch.setattr(local_store_module, "read_index_safe_async", _read_index_none)
    monkeypatch.setattr(LocalMemoryStore, "_init_databases", _noop_async)
    monkeypatch.setattr(LocalMemoryStore, "_load_vector_mappings", _noop_async)
    monkeypatch.setattr(LocalMemoryStore, "_rebuild_index", _noop_async)
    monkeypatch.setattr(LocalMemoryStore, "_sync_vector_mappings", _record_sync)

    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_index_path = tmp_path / "episodic.faiss.index"
    store.semantic_index_path = tmp_path / "semantic.faiss.index"
    store.episodic_index = None
    store.semantic_index = None
    store.episodic_vector_id_to_memory_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.episodic_next_vector_id = 0
    store.semantic_next_vector_id = 0
    store.embedder = types.SimpleNamespace(
        dimension=8,
        initialize=_noop_async,
    )
    store.title_client = types.SimpleNamespace(initialize=_noop_async)

    await LocalMemoryStore.initialize(store)

    assert observed_sync_state == [(True, True)]


@pytest.mark.asyncio
async def test_sync_vector_mappings_skips_index_save_when_no_backfill(monkeypatch):
    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_db_path = "/tmp/episodic.db"
    store.semantic_db_path = "/tmp/semantic.db"
    store.episodic_index = object()
    store.semantic_index = object()
    store.episodic_vector_id_to_memory_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 3
    store.semantic_next_vector_id = 5

    async def _no_updates(*, next_vector_id, **_kwargs):
        return next_vector_id, 0

    save_calls = []

    async def _record_save():
        save_calls.append("saved")

    monkeypatch.setattr(store, "_sync_vector_mappings_for_db", _no_updates)
    monkeypatch.setattr(store, "_save_faiss_indices", _record_save)

    await LocalMemoryStore._sync_vector_mappings(store)

    assert save_calls == []
    assert store.episodic_next_vector_id == 3
    assert store.semantic_next_vector_id == 5


@pytest.mark.asyncio
async def test_sync_vector_mappings_saves_once_when_backfill_added(monkeypatch):
    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_db_path = "/tmp/episodic.db"
    store.semantic_db_path = "/tmp/semantic.db"
    store.episodic_index = object()
    store.semantic_index = object()
    store.episodic_vector_id_to_memory_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 7
    store.semantic_next_vector_id = 11

    async def _updates(memory_type, *, next_vector_id, **_kwargs):
        if memory_type == "episodic":
            return next_vector_id + 2, 2
        return next_vector_id, 0

    save_calls = []

    async def _record_save():
        save_calls.append("saved")

    monkeypatch.setattr(store, "_sync_vector_mappings_for_db", _updates)
    monkeypatch.setattr(store, "_save_faiss_indices", _record_save)

    await LocalMemoryStore._sync_vector_mappings(store)

    assert save_calls == ["saved"]
    assert store.episodic_next_vector_id == 9
    assert store.semantic_next_vector_id == 11


@pytest.mark.asyncio
async def test_sync_vector_mappings_backfill_query_skips_non_embeddable_transcript_tool_rows(
    monkeypatch,
    tmp_path,
):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    db_path = tmp_path / "episodic.db"
    async with local_store_module.aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                content TEXT,
                embedding_id INTEGER,
                record_kind TEXT,
                role TEXT,
                message_type TEXT
            )
            """
        )
        await conn.executemany(
            """
            INSERT INTO memories (id, content, embedding_id, record_kind, role, message_type)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                ("tool-call-1", "tool payload", None, "transcript", "tool", "tool-call"),
                ("user-turn-1", "user text", None, "transcript", "user", "llm-text"),
            ],
        )
        await conn.commit()

    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.embedder = types.SimpleNamespace(
        embed_text=lambda _text: None,
    )

    async def _embed_text(_text):
        return np.array([1.0, 0.0], dtype=np.float32)

    store.embedder.embed_text = _embed_text

    def _unexpected_embed_gate_check(*_args, **_kwargs):
        raise AssertionError("startup backfill should rely on SQL prefilter, not python per-row embed gate")

    monkeypatch.setattr(store, "_should_embed_episodic_entry", _unexpected_embed_gate_check, raising=False)
    monkeypatch.setattr(local_store_module.faiss, "normalize_L2", lambda _vector: None)

    class _Index:
        def __init__(self):
            self.vectors = []

        def add(self, vector):
            self.vectors.append(vector)

    index = _Index()
    vector_id_to_memory_id = {}
    memory_id_to_vector_id = {}

    next_vector_id, embedded_count = await LocalMemoryStore._sync_vector_mappings_for_db(
        store,
        memory_type="episodic",
        db_path=str(db_path),
        index=index,
        vector_id_to_memory_id=vector_id_to_memory_id,
        memory_id_to_vector_id=memory_id_to_vector_id,
        next_vector_id=41,
    )

    assert embedded_count == 1
    assert next_vector_id == 42
    assert vector_id_to_memory_id == {41: "user-turn-1"}
    assert memory_id_to_vector_id == {"user-turn-1": 41}
    assert len(index.vectors) == 1

    async with local_store_module.aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "SELECT id, embedding_id FROM memories ORDER BY id"
        )
        rows = await cursor.fetchall()

    assert rows == [
        ("tool-call-1", None),
        ("user-turn-1", 41),
    ]


@pytest.mark.asyncio
async def test_sync_vector_mappings_backfill_query_skips_transcript_replay_rows(
    monkeypatch,
    tmp_path,
):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    db_path = tmp_path / "episodic.db"
    async with local_store_module.aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                content TEXT,
                embedding_id INTEGER,
                record_kind TEXT,
                role TEXT,
                message_type TEXT
            )
            """
        )
        await conn.executemany(
            """
            INSERT INTO memories (id, content, embedding_id, record_kind, role, message_type)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                ("replay-tool-output", "very long replay payload", None, "transcript_replay", "tool", "tool-output"),
                ("assistant-turn", "assistant text", None, "transcript", "assistant", "llm-text"),
            ],
        )
        await conn.commit()

    embedded_texts = []

    async def _embed_text(text):
        embedded_texts.append(text)
        return np.array([1.0, 0.0], dtype=np.float32)

    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.embedder = types.SimpleNamespace(embed_text=_embed_text)

    monkeypatch.setattr(local_store_module.faiss, "normalize_L2", lambda _vector: None)

    class _Index:
        def __init__(self):
            self.vectors = []

        def add(self, vector):
            self.vectors.append(vector)

    index = _Index()
    vector_id_to_memory_id = {}
    memory_id_to_vector_id = {}

    next_vector_id, embedded_count = await LocalMemoryStore._sync_vector_mappings_for_db(
        store,
        memory_type="episodic",
        db_path=str(db_path),
        index=index,
        vector_id_to_memory_id=vector_id_to_memory_id,
        memory_id_to_vector_id=memory_id_to_vector_id,
        next_vector_id=10,
    )

    assert embedded_count == 1
    assert next_vector_id == 11
    assert embedded_texts == ["assistant text"]
    assert vector_id_to_memory_id == {10: "assistant-turn"}
    assert memory_id_to_vector_id == {"assistant-turn": 10}
