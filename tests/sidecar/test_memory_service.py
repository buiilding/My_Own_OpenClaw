import sys
from pathlib import Path

import pytest

frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from memory_service import MemoryService  # noqa: E402


class DummyStore:
    def __init__(self):
        self.search_calls = []
        self.add_calls = []

    async def search(self, query, user_id, filters, limit):
        self.search_calls.append((query, user_id, filters, limit))
        return [
            {"type": "episodic", "text": "note 1"},
            {"type": "semantic", "text": "fact 1"},
        ]

    async def add(self, content, user_id, metadata, conversation_id=None):
        self.add_calls.append((content, user_id, metadata, conversation_id))
        return "mem-2"


@pytest.mark.asyncio
async def test_handle_search_groups_results():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search("req", {"query": "hello"})
    assert response["success"] is True
    assert response["data"]["memories"]["episodic"] == ["note 1"]
    assert response["data"]["memories"]["semantic"] == ["fact 1"]


@pytest.mark.asyncio
async def test_handle_search_missing_query():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search("req", {})
    assert response["success"] is False


@pytest.mark.asyncio
async def test_handle_store_builds_memory_entry():
    service = MemoryService()
    service.memory_store = DummyStore()

    payload = {
        "user_query": "Hi",
        "assistant_response": "Hello",
        "memory_type": "episodic",
        "user_id": "user",
        "session_id": "s1",
    }
    response = await service.handle_store("req", payload)

    assert response["success"] is True
    assert response["data"]["memory_id"] == "mem-2"


@pytest.mark.asyncio
async def test_handle_request_invalid_type():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_request({"id": "req", "type": "unknown"})
    assert response["success"] is False
