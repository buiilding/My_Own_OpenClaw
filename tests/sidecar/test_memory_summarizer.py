import sys
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
            "content": "Please stop the dashboard server.",
            "timestamp": "2026-02-12T10:00:01Z",
            "record_kind": "transcript",
            "role": "user",
            "message_type": "user",
        },
        {
            "id": "3",
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
    assert "Please stop the dashboard server." in chunk_payload
    assert "Done. Port 8050 is now free." in chunk_payload
    assert len(memory_store.add_calls) == 1
    assert memory_store.add_calls[0]["metadata"]["source_memory_count"] == 3
    assert memory_store.marked_ids == ["1", "2", "3"]
