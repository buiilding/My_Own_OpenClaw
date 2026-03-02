from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import pytest

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
