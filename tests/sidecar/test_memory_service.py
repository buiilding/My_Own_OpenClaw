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


class DummyStoreRaises(DummyStore):
    def __init__(self, error):
        super().__init__()
        self.error = error

    async def search(self, query, user_id, filters, limit):
        raise self.error

    async def add(self, content, user_id, metadata, conversation_id=None):
        raise self.error


@pytest.mark.asyncio
async def test_handle_search_groups_results():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search("req", {"query": "hello"})
    assert response["success"] is True
    assert response["data"]["memories"]["episodic"] == ["note 1"]
    assert response["data"]["memories"]["semantic"] == ["fact 1"]


@pytest.mark.asyncio
async def test_handle_search_defaults_filters():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search("req", {"query": "hello"})
    assert response["success"] is True
    assert service.memory_store.search_calls == [("hello", "default_user", {}, 5)]


@pytest.mark.asyncio
async def test_handle_search_passes_filters():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search(
        "req",
        {"query": "hello", "user_id": "u1", "limit": 3, "memory_type": "semantic"},
    )
    assert response["success"] is True
    assert service.memory_store.search_calls == [("hello", "u1", {"type": "semantic"}, 3)]


@pytest.mark.asyncio
async def test_handle_search_missing_query():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search("req", {})
    assert response["success"] is False


@pytest.mark.asyncio
async def test_handle_search_error():
    service = MemoryService()
    service.memory_store = DummyStoreRaises(RuntimeError("fail"))

    response = await service.handle_search("req", {"query": "hello"})
    assert response["success"] is False
    assert response["error"] == "Memory search failed: fail"


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
    assert service.memory_store.add_calls == [
        (
            "User: Hi\nAssistant: Hello",
            "user",
            {"type": "episodic", "source": "interaction_completed", "conversation_id": "s1"},
            "s1",
        )
    ]


@pytest.mark.asyncio
async def test_handle_store_missing_fields():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store("req", {"user_query": "Hi"})
    assert response["success"] is False


@pytest.mark.asyncio
async def test_handle_store_error():
    service = MemoryService()
    service.memory_store = DummyStoreRaises(RuntimeError("fail"))

    payload = {
        "user_query": "Hi",
        "assistant_response": "Hello",
        "memory_type": "episodic",
        "user_id": "user",
        "session_id": "s1",
    }
    response = await service.handle_store("req", payload)

    assert response["success"] is False
    assert response["error"] == "Memory store failed: fail"


@pytest.mark.asyncio
async def test_handle_request_dispatches_search(monkeypatch):
    service = MemoryService()

    async def fake_search(request_id, payload):
        return {"id": request_id, "success": True, "data": payload}

    monkeypatch.setattr(service, "handle_search", fake_search)

    response = await service.handle_request(
        {"id": "req-1", "type": "search", "payload": {"query": "hello"}}
    )
    assert response == {"id": "req-1", "success": True, "data": {"query": "hello"}}


@pytest.mark.asyncio
async def test_handle_request_dispatches_store(monkeypatch):
    service = MemoryService()

    async def fake_store(request_id, payload):
        return {"id": request_id, "success": True, "data": payload}

    monkeypatch.setattr(service, "handle_store", fake_store)

    response = await service.handle_request(
        {"id": "req-2", "type": "store", "payload": {"user_query": "hi"}}
    )
    assert response == {"id": "req-2", "success": True, "data": {"user_query": "hi"}}


@pytest.mark.asyncio
async def test_handle_request_exception(monkeypatch):
    service = MemoryService()

    async def fake_search(request_id, payload):
        raise RuntimeError("boom")

    monkeypatch.setattr(service, "handle_search", fake_search)

    response = await service.handle_request(
        {"id": "req-3", "type": "search", "payload": {"query": "hello"}}
    )
    assert response["id"] == "req-3"
    assert response["success"] is False
    assert response["error"] == "boom"


@pytest.mark.asyncio
async def test_handle_request_invalid_type():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_request({"id": "req", "type": "unknown"})
    assert response["success"] is False
