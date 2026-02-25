import pytest
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.local_store import LocalMemoryStore  # noqa: E402
from memory.sqlite_store import init_episodic_schema  # noqa: E402


class _DummyEmbedder:
    @property
    def dimension(self) -> int:
        return 8

    async def embed_text(self, text: str):  # pragma: no cover
        raise AssertionError("conversation-search tests should not invoke embeddings")


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
async def test_search_conversations_finds_transcript_by_user_or_assistant_content(tmp_path: Path):
    store = _build_store(tmp_path)
    await init_episodic_schema(store.episodic_db_path)

    await store.add(
        text="Need a Vietnamese-speaking lawyer lead in California",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id="conv_legal",
        record_kind="transcript",
        role="user",
        message_index=1,
        skip_embedding=True,
        timestamp="2026-02-25T00:00:00+00:00",
    )
    await store.add(
        text="I can help shortlist lawyer leads and outreach plan",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id="conv_legal",
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-25T00:00:01+00:00",
    )

    await store.add(
        text="Let's discuss moon landing technology",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id="conv_space",
        record_kind="transcript",
        role="user",
        message_index=1,
        skip_embedding=True,
        timestamp="2026-02-24T00:00:00+00:00",
    )
    await store.add(
        text="Sure, we can compare propulsion tradeoffs",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id="conv_space",
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-24T00:00:01+00:00",
    )

    rows = await store.search_conversations(user_id="user-1", query="vietnamese lawyer", limit=10)

    assert len(rows) >= 1
    assert rows[0]["conversation_id"] == "conv_legal"
    assert "lawyer" in rows[0]["snippet"].lower()
    assert rows[0]["lexical_match_count"] >= 1


@pytest.mark.asyncio
async def test_search_conversations_merges_semantic_hits_when_lexical_miss(tmp_path: Path, monkeypatch):
    store = _build_store(tmp_path)
    await init_episodic_schema(store.episodic_db_path)

    await store.add(
        text="hello there",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id="conv_sem",
        record_kind="transcript",
        role="user",
        message_index=1,
        skip_embedding=True,
        timestamp="2026-02-25T00:10:00+00:00",
    )
    await store.add(
        text="hi, how can I help",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id="conv_sem",
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-25T00:10:01+00:00",
    )

    async def _fake_semantic_search(*_args, **_kwargs):
        return [
            {
                "id": "semantic-hit-1",
                "text": "PulseAudio microphone device is missing from input list",
                "metadata": {
                    "record_kind": "transcript",
                    "role": "assistant",
                    "conversation_id": "conv_sem",
                },
                "conversation_id": "conv_sem",
                "score": 0.81,
                "timestamp": "2026-02-25T00:10:02+00:00",
            }
        ]

    monkeypatch.setattr(store, "search", _fake_semantic_search)

    rows = await store.search_conversations(user_id="user-1", query="mic issue", limit=10)

    assert len(rows) == 1
    assert rows[0]["conversation_id"] == "conv_sem"
    assert rows[0]["semantic_match_count"] >= 1
    assert rows[0]["match_source"] == "semantic"
    assert "microphone" in rows[0]["snippet"].lower()
