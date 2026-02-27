import signal

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import memory_service as memory_service_module  # noqa: E402
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

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.add_calls.append((content, user_id, metadata, conversation_id, kwargs))
        return "mem-2"


class DummyStoreRaises(DummyStore):
    def __init__(self, error):
        super().__init__()
        self.error = error

    async def search(self, query, user_id, filters, limit):
        raise self.error

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
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
    assert response["id"] == "req"
    assert response["error"] == "Query is required for memory search"
    assert service.memory_store.search_calls == []


@pytest.mark.asyncio
async def test_handle_search_rejects_invalid_memory_type():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search(
        "req",
        {"query": "hello", "memory_type": "archive"},
    )
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "Invalid memory_type: archive"
    assert service.memory_store.search_calls == []


@pytest.mark.asyncio
async def test_handle_search_normalizes_memory_type_filter():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_search(
        "req",
        {"query": " hello ", "memory_type": " SEMANTIC ", "user_id": "u1"},
    )
    assert response["success"] is True
    assert service.memory_store.search_calls == [("hello", "u1", {"type": "semantic"}, 5)]


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
            {"record_kind": "interaction"},
        )
    ]


@pytest.mark.asyncio
async def test_handle_store_missing_fields():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store("req", {"user_query": "Hi"})
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "Missing user_query or assistant_response"
    assert service.memory_store.add_calls == []


@pytest.mark.asyncio
async def test_handle_store_treats_none_fields_as_missing():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store(
        "req",
        {
            "user_query": "Hi",
            "assistant_response": None,  # type: ignore[dict-item]
        },
    )
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "Missing user_query or assistant_response"
    assert service.memory_store.add_calls == []


@pytest.mark.asyncio
async def test_handle_store_rejects_whitespace_only_fields():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store(
        "req",
        {"user_query": "   ", "assistant_response": "\n\t"},
    )
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "Missing user_query or assistant_response"
    assert service.memory_store.add_calls == []


@pytest.mark.asyncio
async def test_handle_store_rejects_invalid_memory_type():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store(
        "req",
        {
            "user_query": "hi",
            "assistant_response": "hello",
            "memory_type": "archive",
        },
    )
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "Invalid memory_type: archive"
    assert service.memory_store.add_calls == []


@pytest.mark.asyncio
async def test_handle_store_rejects_non_string_query_or_response():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store(
        "req",
        {"user_query": 1, "assistant_response": "hello"},  # type: ignore[dict-item]
    )
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "user_query and assistant_response must be strings"
    assert service.memory_store.add_calls == []


@pytest.mark.asyncio
async def test_handle_store_rejects_non_string_memory_type():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_store(
        "req",
        {
            "user_query": "hi",
            "assistant_response": "hello",
            "memory_type": 1,  # type: ignore[dict-item]
        },
    )
    assert response["success"] is False
    assert response["id"] == "req"
    assert response["error"] == "memory_type must be a string"
    assert service.memory_store.add_calls == []


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
    assert response["id"] == "req"
    assert response["error"] == "Unknown request type: unknown"


@pytest.mark.asyncio
async def test_handle_request_rejects_non_object_request():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_request(["not", "an", "object"])
    assert response["success"] is False
    assert response["id"] == "unknown"
    assert response["error"] == "Request must be a JSON object"


@pytest.mark.asyncio
async def test_handle_request_rejects_non_object_payload():
    service = MemoryService()
    service.memory_store = DummyStore()

    response = await service.handle_request(
        {"id": "req-4", "type": "search", "payload": "not-an-object"}
    )
    assert response["success"] is False
    assert response["id"] == "req-4"
    assert response["error"] == "Request payload must be a JSON object"


def test_signal_handler_requests_shutdown(monkeypatch):
    service = MemoryService()
    called = []

    def fake_request_shutdown(signum):
        called.append(signum)

    monkeypatch.setattr(service, "request_shutdown", fake_request_shutdown)
    monkeypatch.setattr(memory_service_module, "_active_service", service)

    memory_service_module.signal_handler(signal.SIGTERM, None)

    assert called == [signal.SIGTERM]


def test_request_shutdown_marks_service_and_closes_stdin(monkeypatch):
    service = MemoryService()

    class DummyStdin:
        def __init__(self):
            self.closed = False
            self.close_calls = 0

        def close(self):
            self.closed = True
            self.close_calls += 1

    dummy_stdin = DummyStdin()
    monkeypatch.setattr(memory_service_module.sys, "stdin", dummy_stdin)

    service.request_shutdown(signal.SIGTERM)

    assert service.running is False
    assert service._shutdown_requested is True
    assert dummy_stdin.closed is True
    assert dummy_stdin.close_calls == 1
