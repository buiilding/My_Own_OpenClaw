"""Covers local-runtime memory summarizer behavior."""

import asyncio
from datetime import datetime

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.summarizer import MemorySummarizer, SummarizerSettings  # noqa: E402


@pytest.fixture(autouse=True)
def clear_summarizer_auth(monkeypatch):
    monkeypatch.setattr("memory.summarizer.get_authenticated_user_id", lambda: None)


class FakeMemoryStore:
    def __init__(self, memories):
        self.memories = memories
        self.add_calls = []
        self.mark_calls = []

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

    async def mark_episodic_memories_semanticized(self, memory_ids, metadata_patch=None):
        self.mark_calls.append(
            {
                "memory_ids": list(memory_ids),
                "metadata_patch": dict(metadata_patch or {}),
            }
        )


class FakeSemanticClient:
    def __init__(self):
        self.requests = []
        self.initialized = False
        self.closed = False

    async def initialize(self):
        self.initialized = True

    async def close(self):
        self.closed = True

    async def summarize(self, conversations, user_id):
        self.requests.append({"conversations": conversations, "user_id": user_id})
        return "User is building an F1 dashboard.", ["User wants local dashboard runs."]


class FakeCycleMemoryStore:
    def __init__(self):
        self.watermark_updates = []

    async def count_unsemanticized_interaction_memories(self, user_id=None):
        return 10

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


class FakeShouldRunMemoryStore:
    def __init__(self, unsemanticized_count):
        self.unsemanticized_count = unsemanticized_count
        self.count_calls = 0
        self.count_user_ids = []

    async def count_unsemanticized_interaction_memories(self, user_id=None):
        self.count_calls += 1
        self.count_user_ids.append(user_id)
        return self.unsemanticized_count


def test_summarizer_settings_defaults_favor_small_idle_batches_and_higher_cycle_throughput():
    settings = SummarizerSettings()

    assert settings.min_batch_size == 6
    assert settings.min_batch_size_idle == 1
    assert settings.max_summaries_per_cycle == 3


@pytest.mark.asyncio
async def test_summarizer_processes_interaction_batch():
    memories = [
        {
            "id": "1",
            "content": "User: Please stop the dashboard server.\nAssistant: Done. Port 8050 is now free.",
            "timestamp": "2026-02-12T10:00:00Z",
            "record_kind": "interaction",
        },
        {
            "id": "2",
            "content": "User: Summarize project status\nAssistant: Milestone 2 complete, waiting on QA.",
            "timestamp": "2026-02-12T10:00:00.500Z",
            "record_kind": "interaction",
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
    assert "Please stop the dashboard server." in chunk_payload
    assert "Done. Port 8050 is now free." in chunk_payload
    assert "Summarize project status" in chunk_payload
    assert len(memory_store.add_calls) == 1
    assert memory_store.add_calls[0]["metadata"]["source_memory_count"] == 2
    assert len(memory_store.mark_calls) == 1
    assert memory_store.mark_calls[0]["memory_ids"] == ["1", "2"]
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_status"] == "stored"
    assert (
        memory_store.mark_calls[0]["metadata_patch"]["semantic_summary_hash"]
        == memory_store.add_calls[0]["metadata"]["summary_hash"]
    )
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_durable_fact_count"] == 1
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_skipped_fact_count"] == 0
    assert "semantic_processed_at" in memory_store.mark_calls[0]["metadata_patch"]


@pytest.mark.asyncio
async def test_summarizer_marks_low_signal_batches_processed_without_storing_semantic_row():
    memories = [
        {
            "id": "1",
            "content": "User: hi\nAssistant: Hello! How can I help you today?",
            "timestamp": "2026-02-12T10:00:00Z",
            "record_kind": "interaction",
        }
    ]
    memory_store = FakeMemoryStore(memories)

    class LowSignalSemanticClient:
        async def summarize(self, conversations, user_id):
            return "NONE", [
                "No user preferences stated",
                "User initiated contact with a casual greeting",
                "Finder open to Applications folder (ephemeral context)",
            ]

    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=LowSignalSemanticClient(),
        settings=SummarizerSettings(min_batch_size=1, min_batch_size_idle=1),
    )

    summarized = await summarizer._summarize_conversation_batch(
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert summarized == 1
    assert memory_store.add_calls == []
    assert len(memory_store.mark_calls) == 1
    assert memory_store.mark_calls[0]["memory_ids"] == ["1"]
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_status"] == "skipped_low_signal"
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_durable_fact_count"] == 0
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_skipped_fact_count"] == 3
    assert "semantic_summary_hash" in memory_store.mark_calls[0]["metadata_patch"]
    assert "semantic_processed_at" in memory_store.mark_calls[0]["metadata_patch"]


@pytest.mark.asyncio
async def test_summarizer_marks_explicit_no_durable_memory_batches_processed_without_storing_semantic_row():
    memories = [
        {
            "id": "1",
            "content": "User: hi\nAssistant: Hello!",
            "timestamp": "2026-02-12T10:00:00Z",
            "record_kind": "interaction",
        }
    ]
    memory_store = FakeMemoryStore(memories)

    class NoDurableMemorySemanticClient:
        async def summarize(self, conversations, user_id):
            return "NONE", []

    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=NoDurableMemorySemanticClient(),
        settings=SummarizerSettings(min_batch_size=1, min_batch_size_idle=1),
    )

    summarized = await summarizer._summarize_conversation_batch(
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert summarized == 1
    assert memory_store.add_calls == []
    assert len(memory_store.mark_calls) == 1
    assert memory_store.mark_calls[0]["memory_ids"] == ["1"]
    assert (
        memory_store.mark_calls[0]["metadata_patch"]["semantic_status"]
        == "skipped_no_durable_memory"
    )
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_durable_fact_count"] == 0
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_skipped_fact_count"] == 0
    assert "semantic_summary_hash" in memory_store.mark_calls[0]["metadata_patch"]


@pytest.mark.asyncio
async def test_summarizer_marks_grouped_no_durable_memory_batches_processed_without_storing_semantic_row():
    memories = [
        {
            "id": "1",
            "content": "User: hi\nAssistant: Hello!",
            "timestamp": "2026-02-12T10:00:00Z",
            "record_kind": "interaction",
        },
        {
            "id": "2",
            "content": "User: thanks\nAssistant: You are welcome.",
            "timestamp": "2026-02-12T10:00:01Z",
            "record_kind": "interaction",
        },
    ]
    memory_store = FakeMemoryStore(memories)

    class NoDurableMemorySemanticClient:
        async def summarize(self, conversations, user_id):
            return "NONE", []

    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=NoDurableMemorySemanticClient(),
        settings=SummarizerSettings(min_batch_size=1, min_batch_size_idle=1),
    )

    summarized = await summarizer._summarize_conversation_batch(
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert summarized == 1
    assert memory_store.add_calls == []
    assert len(memory_store.mark_calls) == 1
    assert memory_store.mark_calls[0]["memory_ids"] == ["1", "2"]
    assert (
        memory_store.mark_calls[0]["metadata_patch"]["semantic_status"]
        == "skipped_no_durable_memory"
    )
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_durable_fact_count"] == 0
    assert memory_store.mark_calls[0]["metadata_patch"]["semantic_skipped_fact_count"] == 0
    assert "semantic_summary_hash" in memory_store.mark_calls[0]["metadata_patch"]
    assert "semantic_processed_at" in memory_store.mark_calls[0]["metadata_patch"]


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
async def test_get_user_ids_with_work_merges_known_ids_with_discovered_work():
    memory_store = FakeUserIdMemoryStore(["stale-a", "stale-b"])
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )
    summarizer.notify_new_memory("current-user")

    user_ids = await summarizer._get_user_ids_with_work()

    assert user_ids == ["current-user", "stale-a", "stale-b"]
    assert memory_store.discovery_calls == [summarizer.settings.max_conversations_per_cycle]


@pytest.mark.asyncio
async def test_get_user_ids_with_work_cold_start_discovers_recent_users():
    memory_store = FakeUserIdMemoryStore(["first-user", "second-user"])
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )

    user_ids = await summarizer._get_user_ids_with_work()

    assert user_ids == ["first-user", "second-user"]
    assert memory_store.discovery_calls == [summarizer.settings.max_conversations_per_cycle]


@pytest.mark.asyncio
async def test_get_user_ids_with_work_scopes_to_authenticated_user():
    memory_store = FakeUserIdMemoryStore(["legacy-user", "other-user"])
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
        authenticated_user_id_resolver=lambda: "current-user",
    )
    summarizer.notify_new_memory("legacy-user")

    user_ids = await summarizer._get_user_ids_with_work()

    assert user_ids == ["current-user"]
    assert memory_store.discovery_calls == []


@pytest.mark.asyncio
async def test_should_run_counts_only_authenticated_user_work():
    memory_store = FakeShouldRunMemoryStore(unsemanticized_count=6)
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
        authenticated_user_id_resolver=lambda: "current-user",
    )

    should_run = await summarizer._should_run()

    assert should_run is True
    assert memory_store.count_user_ids == ["current-user"]


@pytest.mark.asyncio
async def test_summarize_conversation_batch_skips_non_authenticated_user():
    memories = [
        {
            "id": "1",
            "content": "User: legacy row\nAssistant: old response",
            "timestamp": "2026-02-12T10:00:00Z",
            "record_kind": "interaction",
        }
    ]
    memory_store = FakeMemoryStore(memories)
    semantic_client = FakeSemanticClient()
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=semantic_client,
        authenticated_user_id_resolver=lambda: "current-user",
    )

    summarized = await summarizer._summarize_conversation_batch(
        user_id="legacy-user",
        conversation_id="conv-legacy",
    )

    assert summarized == 0
    assert semantic_client.requests == []
    assert memory_store.add_calls == []
    assert memory_store.mark_calls == []


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


@pytest.mark.asyncio
async def test_should_summarize_batch_allows_aged_singletons_at_idle_floor():
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

    memories = [{"id": "1", "timestamp": "2026-02-12T10:00:00Z", "content": "hello"}]

    assert summarizer._should_summarize_batch(memories) is True


@pytest.mark.asyncio
async def test_should_run_allows_idle_low_volume_backlog():
    memory_store = FakeShouldRunMemoryStore(unsemanticized_count=1)
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )

    should_run = await summarizer._should_run()

    assert should_run is True
    assert memory_store.count_calls == 1


@pytest.mark.asyncio
async def test_should_run_when_unsemanticized_interactions_reach_min_batch_size():
    memory_store = FakeShouldRunMemoryStore(unsemanticized_count=6)
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )

    should_run = await summarizer._should_run()

    assert should_run is True
    assert memory_store.count_calls == 1


@pytest.mark.asyncio
async def test_should_run_stays_blocked_for_fresh_low_volume_work():
    memory_store = FakeShouldRunMemoryStore(unsemanticized_count=1)
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=FakeSemanticClient(),
    )
    summarizer.notify_new_memory("user-1")

    should_run = await summarizer._should_run()

    assert should_run is False
    assert memory_store.count_calls == 1


@pytest.mark.asyncio
async def test_start_triggers_immediate_cycle_without_waiting_full_interval(monkeypatch):
    memory_store = FakeShouldRunMemoryStore(unsemanticized_count=0)
    semantic_client = FakeSemanticClient()
    summarizer = MemorySummarizer(
        memory_store=memory_store,
        semantic_client=semantic_client,
        settings=SummarizerSettings(interval_seconds=3600),
    )

    cycle_calls = []

    async def fake_maybe_summarize():
        cycle_calls.append("run")
        summarizer._shutdown_event.set()

    monkeypatch.setattr(summarizer, "_maybe_summarize", fake_maybe_summarize)

    await summarizer.start()
    await asyncio.wait_for(summarizer._task, timeout=0.2)
    await summarizer.stop()

    assert semantic_client.initialized is True
    assert cycle_calls == ["run"]
