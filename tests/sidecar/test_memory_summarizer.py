import sys
from datetime import datetime
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from memory.summarizer import MemorySummarizer, SummarizerSettings  # noqa: E402


class FakeMemoryStore:
    def __init__(self, memories):
        self.memories = memories
        self.add_calls = []
        self.marked_ids = []

    async def get_unsemanticized_episodic_memories_by_conversation(self, user_id, conversation_id, limit):
        return self.memories

    async def semantic_summary_exists(self, summary_hash):
        return False

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.add_calls.append(
            {
                "content": content,
                "user_id": user_id,
                "metadata": metadata,
                "conversation_id": conversation_id,
            }
        )
        return "semantic-1"

    async def mark_episodic_memories_semanticized(self, memory_ids):
        self.marked_ids = list(memory_ids)


class FakeSemanticClient:
    def __init__(self):
        self.requests = []

    async def summarize(self, conversations, user_id):
        self.requests.append({"conversations": conversations, "user_id": user_id})
        return "User is building an F1 dashboard.", ["User wants local dashboard runs."]


class FakeCycleMemoryStore:
    def __init__(self):
        self.watermark_updates = []

    async def get_watermark(self):
        return {"pending_message_count": 10}

    async def get_unsemanticized_conversation_windows(self, user_id):
        return [f"conv-for-{user_id}"]

    async def update_watermark(self, last_semanticized_id=None, pending_message_count=0):
        self.watermark_updates.append(
            {
                "last_semanticized_id": last_semanticized_id,
                "pending_message_count": pending_message_count,
            }
        )


class FakeUserIdMemoryStore:
    def __init__(self, discovered_user_ids):
        self.discovered_user_ids = list(discovered_user_ids)
        self.discovery_calls = []

    async def get_user_ids_with_unsemanticized_memories(self, limit=100):
        self.discovery_calls.append(limit)
        return self.discovered_user_ids[:limit]


@pytest.mark.asyncio
async def test_summarizer_processes_transcript_batch_and_skips_tool_calls():
    memories = [
        {
            "id": "1",
            "content": "run shell command with args",
            "timestamp": "2026-02-12T10:00:00Z",
            "record_kind": "transcript",
            "role": "tool",
            "message_type": "tool-call",
        },
        {
            "id": "2",
            "content": "stdout: npm run dev\nexit code: 0",
            "timestamp": "2026-02-12T10:00:00.500Z",
            "record_kind": "transcript",
            "role": "tool",
            "message_type": "tool-output",
        },
        {
            "id": "3",
            "content": "Bundle output: 3 tools succeeded",
            "timestamp": "2026-02-12T10:00:00.900Z",
            "record_kind": "transcript",
            "role": "tool",
            "message_type": "tool-bundle-result",
        },
        {
            "id": "4",
            "content": "Please stop the dashboard server.",
            "timestamp": "2026-02-12T10:00:01Z",
            "record_kind": "transcript",
            "role": "user",
            "message_type": "user",
        },
        {
            "id": "5",
            "content": "Done. Port 8050 is now free.",
            "timestamp": "2026-02-12T10:00:02Z",
            "record_kind": "transcript",
            "role": "assistant",
            "message_type": "llm-text",
        },
    ]
    memory_store = FakeMemoryStore(memories)
    semantic_client = FakeSemanticClient()
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=semantic_client,
        settings=SummarizerSettings(min_batch_size=1, min_batch_size_idle=1),
    )

    summarized = await summarizer._summarize_conversation_batch(
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert summarized == 1
    assert len(semantic_client.requests) == 1
    chunk_payload = "\n".join(semantic_client.requests[0]["conversations"])
    assert "tool-call" not in chunk_payload
    assert "tool-output" not in chunk_payload
    assert "tool-bundle-result" not in chunk_payload
    assert "stdout: npm run dev" not in chunk_payload
    assert "Bundle output: 3 tools succeeded" not in chunk_payload
    assert "Please stop the dashboard server." in chunk_payload
    assert "Done. Port 8050 is now free." in chunk_payload
    assert len(memory_store.add_calls) == 1
    assert memory_store.add_calls[0]["metadata"]["source_memory_count"] == 5
    assert memory_store.marked_ids == ["1", "2", "3", "4", "5"]


@pytest.mark.asyncio
async def test_summarizer_continues_when_one_user_batch_fails(monkeypatch):
    memory_store = FakeCycleMemoryStore()
    semantic_client = FakeSemanticClient()
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=semantic_client,
        settings=SummarizerSettings(
            min_batch_size=1,
            min_batch_size_idle=1,
            max_summaries_per_cycle=2,
            max_conversations_per_cycle=1,
        ),
    )

    async def fake_get_user_ids():
        return ["broken-user", "healthy-user"]

    calls = []

    async def fake_summarize_batch(user_id, conversation_id):
        calls.append((user_id, conversation_id))
        if user_id == "broken-user":
            raise RuntimeError("intentional-failure")
        return 1

    monkeypatch.setattr(summarizer, "_get_user_ids_with_work", fake_get_user_ids)
    monkeypatch.setattr(summarizer, "_summarize_conversation_batch", fake_summarize_batch)

    await summarizer._maybe_summarize()

    assert ("broken-user", "conv-for-broken-user") in calls
    assert ("healthy-user", "conv-for-healthy-user") in calls
    assert memory_store.watermark_updates == [
        {"last_semanticized_id": None, "pending_message_count": 0}
    ]


@pytest.mark.asyncio
async def test_get_user_ids_with_work_prefers_known_ids_and_skips_discovery():
    memory_store = FakeUserIdMemoryStore(["stale-a", "stale-b"])
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )
    summarizer.notify_new_memory("current-user")

    user_ids = await summarizer._get_user_ids_with_work()

    assert user_ids == ["current-user"]
    assert memory_store.discovery_calls == []


@pytest.mark.asyncio
async def test_get_user_ids_with_work_cold_start_discovers_only_one_user():
    memory_store = FakeUserIdMemoryStore(["first-user", "second-user"])
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )

    user_ids = await summarizer._get_user_ids_with_work()

    assert user_ids == ["first-user"]
    assert memory_store.discovery_calls == [1]


@pytest.mark.asyncio
async def test_parse_timestamp_normalizes_mixed_timezone_formats():
    summarizer = MemorySummarizer(
        memory_store=FakeUserIdMemoryStore([]),
        semantic_client=FakeSemanticClient(),
    )

    naive = summarizer._parse_timestamp("2026-02-12T01:28:18.489995")
    aware = summarizer._parse_timestamp("2026-02-12T06:28:11.875Z")

    assert naive is not None
    assert aware is not None
    assert naive.tzinfo is not None
    assert aware.tzinfo is not None


@pytest.mark.asyncio
async def test_should_summarize_batch_handles_naive_timestamp_without_error():
    summarizer = MemorySummarizer(
        memory_store=FakeUserIdMemoryStore([]),
        semantic_client=FakeSemanticClient(),
        settings=SummarizerSettings(
            min_batch_size=10,
            min_batch_size_idle=1,
            idle_seconds=0,
            min_memory_age_seconds=0,
        ),
    )

    naive_timestamp = datetime.now().replace(tzinfo=None).isoformat()
    memories = [{"id": "1", "timestamp": naive_timestamp, "content": "hello"}]

    assert summarizer._should_summarize_batch(memories) is True
