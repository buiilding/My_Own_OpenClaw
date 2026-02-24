import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.memory import memory_tool  # noqa: E402
from tools.memory.memory_tool import MemoryTool  # noqa: E402


class DummyStore:
    def __init__(self):
        self.add_calls = []
        self.search_calls = []
        self.stats_calls = 0

    async def initialize(self):
        return None

    async def add(self, content, user_id, metadata, conversation_id=None):
        self.add_calls.append((content, user_id, metadata, conversation_id))
        return "mem-1"

    async def search(self, query, user_id, filters, limit):
        self.search_calls.append((query, user_id, filters, limit))
        return [
            {
                "id": "m1",
                "text": "remember this",
                "type": "episodic",
                "score": 0.9,
                "timestamp": "2024-01-01",
            }
        ]

    async def get_stats(self, user_id):
        self.stats_calls += 1
        return {"total_count": 2, "by_type": {"episodic": 1, "semantic": 1}}


@pytest.mark.asyncio
async def test_memory_tool_add_and_search(monkeypatch):
    monkeypatch.setattr(memory_tool, "LocalMemoryStore", lambda: DummyStore())

    tool = MemoryTool()

    add_result = await tool.run({"operation": "add", "content": "note", "memory_type": "episodic"})
    assert add_result["success"] is True
    assert add_result["data"]["memory_id"] == "mem-1"

    search_result = await tool.run({"operation": "search", "query": "note"})
    assert search_result["success"] is True
    assert search_result["data"]["count"] == 1


@pytest.mark.asyncio
async def test_memory_tool_stats_and_errors(monkeypatch):
    monkeypatch.setattr(memory_tool, "LocalMemoryStore", lambda: DummyStore())
    tool = MemoryTool()

    stats_result = await tool.run({"operation": "stats"})
    assert stats_result["success"] is True
    assert "total_count" in stats_result["data"]["stats"]

    missing_query = await tool.run({"operation": "search"})
    assert missing_query["success"] is False

    unknown = await tool.run({"operation": "unknown"})
    assert unknown["success"] is False
