"""Covers local-runtime memory store initialization behavior."""

import types

import numpy as np
import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import memory.local_store as local_store_module  # noqa: E402
import memory.transcript_embedding_policy as embedding_policy_module  # noqa: E402
from memory.local_store import LocalMemoryStore  # noqa: E402
from memory.transcript_embedding_policy import should_embed_episodic_entry  # noqa: E402


def test_transcript_embedding_policy_doc_uses_local_runtime_wording():
    assert "local-runtime memory writes" in (embedding_policy_module.__doc__ or "")
    assert "sidecar memory writes" not in (embedding_policy_module.__doc__ or "")


def test_local_memory_store_init_skips_sync_faiss_reads(monkeypatch, tmp_path):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    memory_dir = tmp_path / "memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "episodic.faiss.index").write_bytes(b"stale-index")
    (memory_dir / "semantic.faiss.index").write_bytes(b"stale-index")

    def fail_read_index(_index_path):
        raise AssertionError(
            "LocalMemoryStore.__init__ should not read FAISS indices synchronously"
        )

    monkeypatch.setattr(local_store_module.faiss, "read_index", fail_read_index)

    store = LocalMemoryStore(db_path=str(memory_dir))

    assert store.episodic_index is None
    assert store.semantic_index is None
    assert store.episodic_db_path == str(memory_dir / "episodic.db")
    assert store.semantic_db_path == str(memory_dir / "semantic.db")
    assert store.history_db_path == str(tmp_path / "history" / "history.db")


def test_local_memory_store_default_root_uses_windieos(monkeypatch, tmp_path):
    monkeypatch.setattr(
        local_store_module, "app_user_data_root", lambda: tmp_path / "windieos"
    )

    store = LocalMemoryStore()

    assert store.memory_dir == tmp_path / "windieos" / "memory"
    assert store.history_dir == tmp_path / "windieos" / "history"
    assert store.episodic_db_path == str(
        tmp_path / "windieos" / "memory" / "episodic.db"
    )
    assert store.semantic_db_path == str(
        tmp_path / "windieos" / "memory" / "semantic.db"
    )
    assert store.history_db_path == str(
        tmp_path / "windieos" / "history" / "history.db"
    )


@pytest.mark.asyncio
async def test_initialize_creates_faiss_indices_without_remote_clients(
    monkeypatch,
    tmp_path,
):
    if local_store_module.faiss is None:
        pytest.skip("FAISS runtime dependency is unavailable")

    async def _noop_async(*_args, **_kwargs):
        return None

    async def _read_index_none(*_args, **_kwargs):
        return None

    monkeypatch.setattr(local_store_module, "read_index_safe_async", _read_index_none)
    monkeypatch.setattr(LocalMemoryStore, "_init_databases", _noop_async)
    monkeypatch.setattr(LocalMemoryStore, "_load_vector_mappings", _noop_async)
    monkeypatch.setattr(LocalMemoryStore, "_repair_index_mapping_mismatch", _noop_async)

    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_index_path = tmp_path / "episodic.faiss.index"
    store.semantic_index_path = tmp_path / "semantic.faiss.index"
    store.embedding_space_metadata_path = tmp_path / "embedding_space.json"
    store.episodic_index = None
    store.semantic_index = None
    store.episodic_vector_id_to_memory_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 0
    store.semantic_next_vector_id = 0
    store._embedding_space_metadata = None
    store._default_embedding_dimension = 8

    await LocalMemoryStore.initialize(store)

    assert store.episodic_index is not None
    assert store.semantic_index is not None
    assert store.episodic_index.d == 8
    assert store.semantic_index.d == 8
    assert not hasattr(store, "embedder")
    assert not hasattr(store, "title_client")


@pytest.mark.asyncio
async def test_sync_vector_mappings_is_noop_without_backend_embedding(monkeypatch):
    store = LocalMemoryStore.__new__(LocalMemoryStore)
    save_calls = []

    async def _record_save():
        save_calls.append("saved")

    monkeypatch.setattr(store, "_save_faiss_indices", _record_save)

    await LocalMemoryStore._sync_vector_mappings(store)

    assert save_calls == []


@pytest.mark.asyncio
async def test_sync_vector_mappings_for_db_does_not_backfill_embeddings(tmp_path):
    next_vector_id, embedded_count = await LocalMemoryStore._sync_vector_mappings_for_db(
        LocalMemoryStore.__new__(LocalMemoryStore),
        memory_type="episodic",
        db_path=str(tmp_path / "episodic.db"),
        index=object(),
        vector_id_to_memory_id={},
        memory_id_to_vector_id={},
        next_vector_id=41,
    )

    assert next_vector_id == 41
    assert embedded_count == 0


@pytest.mark.asyncio
async def test_add_stores_without_vector_mapping_when_embedding_is_not_provided(
    monkeypatch,
    tmp_path,
):
    if local_store_module.aiosqlite is None:
        pytest.skip("aiosqlite runtime dependency is unavailable")

    db_path = tmp_path / "episodic.db"
    await local_store_module.init_episodic_schema(str(db_path))

    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_db_path = str(db_path)
    store.semantic_db_path = str(tmp_path / "semantic.db")
    store.episodic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 3
    store.semantic_next_vector_id = 0
    store.episodic_index = types.SimpleNamespace(
        add=lambda _embedding: pytest.fail("No vector should be added")
    )
    store.semantic_index = types.SimpleNamespace()
    store._embedding_space_metadata = None

    save_calls = []

    async def _record_save():
        save_calls.append("saved")

    monkeypatch.setattr(store, "_save_faiss_indices", _record_save)

    memory_id = await LocalMemoryStore.add(
        store,
        "hello",
        "user-1",
        {"type": "episodic"},
    )

    assert isinstance(memory_id, str)
    assert store.episodic_next_vector_id == 3
    assert store.episodic_vector_id_to_memory_id == {}
    assert store.episodic_memory_id_to_vector_id == {}
    assert save_calls == []

    async with local_store_module.aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute("SELECT id, content, embedding_id FROM memories")
        row = await cursor.fetchone()

    assert row[0] == memory_id
    assert row[1] == "hello"
    assert row[2] is None


@pytest.mark.asyncio
async def test_add_indexes_caller_provided_embedding(monkeypatch, tmp_path):
    if local_store_module.faiss is None or local_store_module.aiosqlite is None:
        pytest.skip("LocalMemoryStore runtime dependencies are unavailable")

    db_path = tmp_path / "episodic.db"
    await local_store_module.init_episodic_schema(str(db_path))

    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_db_path = str(db_path)
    store.semantic_db_path = str(tmp_path / "semantic.db")
    store.episodic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 0
    store.semantic_next_vector_id = 0
    store.episodic_index = local_store_module.faiss.IndexFlatIP(2)
    store.semantic_index = local_store_module.faiss.IndexFlatIP(2)
    store.episodic_index_path = tmp_path / "episodic.faiss.index"
    store.semantic_index_path = tmp_path / "semantic.faiss.index"
    store.embedding_space_metadata_path = tmp_path / "embedding_space.json"
    store._embedding_space_metadata = None
    store._default_embedding_dimension = 2

    saved = []

    async def _record_save():
        saved.append("saved")

    monkeypatch.setattr(store, "_save_faiss_indices", _record_save)

    memory_id = await LocalMemoryStore.add(
        store,
        "User: hi\nAssistant: hello",
        "user-1",
        {"type": "episodic"},
        conversation_id="conv-1",
        record_kind="interaction",
        embedding=[1.0, 0.0],
        embedding_space_version="space-1",
    )

    assert store.episodic_index.ntotal == 1
    assert store.episodic_vector_id_to_memory_id == {0: memory_id}
    assert store.episodic_memory_id_to_vector_id == {memory_id: 0}
    assert saved

    async with local_store_module.aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute("SELECT embedding_id, conversation_id, record_kind FROM memories")
        row = await cursor.fetchone()

    assert row == (0, "conv-1", "interaction")


@pytest.mark.asyncio
async def test_search_by_embedding_returns_empty_without_searchable_indices(tmp_path):
    store = LocalMemoryStore.__new__(LocalMemoryStore)
    store.episodic_db_path = str(tmp_path / "episodic.db")
    store.semantic_db_path = str(tmp_path / "semantic.db")
    store.episodic_index = None
    store.semantic_index = None
    store.episodic_vector_id_to_memory_id = {}
    store.semantic_vector_id_to_memory_id = {}
    store.episodic_memory_id_to_vector_id = {}
    store.semantic_memory_id_to_vector_id = {}
    store.episodic_next_vector_id = 0
    store.semantic_next_vector_id = 0

    results = await LocalMemoryStore.search_by_embedding(store, [1.0], "user-1")

    assert results == []


def test_should_embed_episodic_entry_embeds_all_memory_rows():
    assert (
        should_embed_episodic_entry(
            record_kind="memory",
            role="tool",
            message_type="tool-call",
        )
        is True
    )
