import asyncio
import sqlite3
from pathlib import Path

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
        raise AssertionError("title tests should skip embedding")


class _DummyTitleClient:
    def __init__(self, generated_title: str = "Linux mic troubleshooting", delay_seconds: float = 0.0):
        self.generated_title = generated_title
        self.delay_seconds = delay_seconds
        self.calls = []

    async def generate_title(self, **kwargs):
        self.calls.append(kwargs)
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
        return self.generated_title


def _build_store(tmp_path: Path) -> LocalMemoryStore:
    store = LocalMemoryStore.__new__(LocalMemoryStore)

    store.embedder = _DummyEmbedder()
    store.title_client = _DummyTitleClient()
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
    store._title_generation_tasks = {}
    store._title_generation_semaphore = asyncio.Semaphore(2)

    return store


async def _wait_for_title_tasks(store: LocalMemoryStore) -> None:
    tasks = [task for task in store._title_generation_tasks.values() if task and not task.done()]
    if tasks:
        await asyncio.gather(*tasks)


@pytest.mark.asyncio
async def test_title_generation_requires_user_and_assistant_rows(tmp_path: Path):
    store = _build_store(tmp_path)
    store.title_client = _DummyTitleClient(
        generated_title="Ubuntu mic timeout troubleshooting",
        delay_seconds=0.03,
    )
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
    assert user_only_conversations[0]["title"] == user_text
    assert user_only_conversations[0]["title_source"] == "heuristic"

    with sqlite3.connect(store.episodic_db_path) as conn:
        title_count_before = conn.execute(
            "SELECT COUNT(*) FROM conversation_titles WHERE user_id = ? AND conversation_id = ?",
            ("user-1", conversation_id),
        ).fetchone()[0]
    assert title_count_before == 0

    await store.add(
        text="I hit an API timeout while generating that response.",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="error",
        skip_embedding=True,
        timestamp="2026-02-25T00:00:01+00:00",
    )

    error_only_conversations = await store.list_conversations("user-1")
    assert len(error_only_conversations) == 1
    assert error_only_conversations[0]["title"] == user_text
    assert error_only_conversations[0]["title_source"] == "heuristic"

    with sqlite3.connect(store.episodic_db_path) as conn:
        title_count_after_error = conn.execute(
            "SELECT COUNT(*) FROM conversation_titles WHERE user_id = ? AND conversation_id = ?",
            ("user-1", conversation_id),
        ).fetchone()[0]
    assert title_count_after_error == 0

    await store.add(
        text=assistant_text,
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="assistant",
        message_index=3,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-25T00:00:02+00:00",
    )

    conversations_while_pending = await store.list_conversations("user-1")
    assert len(conversations_while_pending) == 1
    assert conversations_while_pending[0]["title"] == user_text
    assert conversations_while_pending[0]["title_source"] == "heuristic"

    await _wait_for_title_tasks(store)

    conversations = await store.list_conversations("user-1")
    assert len(conversations) == 1
    assert conversations[0]["conversation_id"] == conversation_id
    assert conversations[0]["title"] == "Ubuntu mic timeout troubleshooting"
    assert conversations[0]["title_source"] == "model"
    assert conversations[0]["is_resumable"] is True


@pytest.mark.asyncio
async def test_delete_conversation_removes_conversation_title_row(tmp_path: Path):
    store = _build_store(tmp_path)
    store.title_client = _DummyTitleClient(generated_title="API migration plan")
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
    await _wait_for_title_tasks(store)

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


@pytest.mark.asyncio
async def test_title_generation_normalizes_to_short_concise_title(tmp_path: Path):
    store = _build_store(tmp_path)
    store.title_client = _DummyTitleClient(
        generated_title="Title: A very long title with too many words and trailing punctuation.",
    )
    await init_episodic_schema(store.episodic_db_path)

    conversation_id = "conv_trim_title"

    await store.add(
        text="help with migration plan",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="user",
        message_index=1,
        skip_embedding=True,
        timestamp="2026-02-25T00:02:00+00:00",
    )
    await store.add(
        text="Let's break this into phases and rollback plans.",
        user_id="user-1",
        metadata={"type": "episodic"},
        conversation_id=conversation_id,
        record_kind="transcript",
        role="assistant",
        message_index=2,
        message_type="llm-text",
        skip_embedding=True,
        timestamp="2026-02-25T00:02:01+00:00",
    )
    await _wait_for_title_tasks(store)

    conversations = await store.list_conversations("user-1")
    assert len(conversations) == 1
    assert conversations[0]["title"] == "A very long title with too"
