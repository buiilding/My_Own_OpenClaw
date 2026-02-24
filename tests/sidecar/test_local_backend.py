import signal

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import local_backend as local_backend_module  # noqa: E402
from local_backend import LocalBackend  # noqa: E402
from tools.result import ToolResult  # noqa: E402


class DummyRegistry:
    def __init__(self, result):
        self._result = result
        self.tools = {"read_file": object(), "write_file": object()}

    async def execute_tool(self, tool_name, args):
        return self._result


class DummyMemoryStore:
    def __init__(self):
        self.added = []
        self.pending_count = 0
        self.next_index = 1

    async def search(self, query, user_id, filters, limit):
        return [
            {"type": "semantic", "text": "fact"},
            {"type": "episodic", "text": "event", "conversation_id": "conv-1"},
        ]

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.added.append((content, user_id, metadata, conversation_id, kwargs))
        return "memory-1"

    async def increment_pending_count(self):
        self.pending_count += 1

    async def get_next_message_index(self, user_id, conversation_id):
        value = self.next_index
        self.next_index += 1
        return value

    async def close(self):
        return None


class DummyRegistryRaises:
    def __init__(self, error):
        self.error = error
        self.tools = {"read_file": object()}

    async def execute_tool(self, tool_name, args):
        raise self.error


class DummyMemoryStoreCapturing(DummyMemoryStore):
    def __init__(self, results):
        super().__init__()
        self.results = results
        self.search_calls = []

    async def search(self, query, user_id, filters, limit):
        self.search_calls.append((query, user_id, filters, limit))
        return self.results


class DummyMemoryStoreRaises(DummyMemoryStore):
    def __init__(self, error):
        super().__init__()
        self.error = error

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        raise self.error


class DummySummarizer:
    def __init__(self):
        self.notified = []

    def notify_new_memory(self, user_id):
        self.notified.append(user_id)


class DummyMemoryStorePendingFails(DummyMemoryStore):
    async def increment_pending_count(self):
        raise RuntimeError("pending-fail")


@pytest.mark.asyncio
async def test_handle_execute_tool_success():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({"ok": True}))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result == {"success": True, "data": {"ok": True}}


@pytest.mark.asyncio
async def test_handle_execute_tool_error():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(ToolResult.error_result("bad"))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result == {"success": False, "error": "bad"}


@pytest.mark.asyncio
async def test_handle_execute_tool_preserves_empty_data_payload():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({}))

    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})

    assert result == {"success": True, "data": {}}


@pytest.mark.asyncio
async def test_handle_execute_tool_exception():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistryRaises(RuntimeError("boom"))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result["success"] is False
    assert result["error"] == "Tool execution failed: boom"


@pytest.mark.asyncio
async def test_handle_get_status_reports_tools():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({}))
    backend.running = True
    backend.memory_store = DummyMemoryStore()

    status = await backend._handle_get_status()
    assert status["running"] is True
    assert status["tool_count"] == 2
    assert "read_file" in status["registered_tools"]


@pytest.mark.asyncio
async def test_handle_get_status_without_store_or_registry():
    backend = LocalBackend()
    backend.tool_registry = None
    backend.memory_store = None
    backend.running = False

    status = await backend._handle_get_status()
    assert status["running"] is False
    assert status["memory_store_initialized"] is False
    assert status["tool_registry_initialized"] is False
    assert status["memory_store_status"] == "not_initialized"


@pytest.mark.asyncio
async def test_handle_get_system_state(monkeypatch):
    backend = LocalBackend()

    async def fake_state(fields=None):
        return {"active_window": "App"}

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", fake_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result == {"success": True, "data": {"active_window": "App"}}


@pytest.mark.asyncio
async def test_handle_get_system_state_error(monkeypatch):
    backend = LocalBackend()

    async def raise_state(fields=None):
        raise RuntimeError("nope")

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", raise_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result["success"] is False
    assert result["error"] == "nope"


@pytest.mark.asyncio
async def test_handle_search_memory_groups_results():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_search_memory("query", user_id="user-1")
    assert result["success"] is True
    assert result["data"]["memories"]["semantic"] == ["fact"]
    assert result["data"]["memories"]["episodic"] == ["event"]


@pytest.mark.asyncio
async def test_handle_search_memory_empty_results():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing([])

    result = await backend._handle_search_memory("query")
    assert result["success"] is True
    assert result["data"]["memories"] == {"semantic": [], "episodic": []}


@pytest.mark.asyncio
async def test_handle_search_memory_applies_filters():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing(
        [{"type": "semantic", "text": "fact"}]
    )

    result = await backend._handle_search_memory(
        "query",
        user_id="user-1",
        limit=3,
        memory_type="semantic",
    )
    assert result["success"] is True
    assert backend.memory_store.search_calls == [("query", "user-1", {"type": "semantic"}, 3)]


@pytest.mark.asyncio
async def test_handle_search_memory_ignores_unknown_type():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing(
        [{"type": "weird", "text": "skip"}, {"text": "fallback"}]
    )

    result = await backend._handle_search_memory("query")
    assert result["success"] is True
    assert result["data"]["memories"]["semantic"] == []
    assert result["data"]["memories"]["episodic"] == ["fallback"]


@pytest.mark.asyncio
async def test_handle_search_memory_excludes_active_conversation():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing(
        [
            {"type": "episodic", "text": "from active", "conversation_id": "conv-active"},
            {"type": "episodic", "text": "from old", "conversation_id": "conv-old"},
            {"type": "semantic", "text": "semantic fact"},
        ]
    )

    result = await backend._handle_search_memory(
        "query",
        user_id="user-1",
        exclude_conversation_id="conv-active",
    )
    assert result["success"] is True
    assert result["data"]["memories"]["episodic"] == ["from old"]
    assert result["data"]["memories"]["semantic"] == ["semantic fact"]


@pytest.mark.asyncio
async def test_handle_store_memory_success_notifies_summarizer():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type="episodic",
        user_id="user-1",
        session_id="session-1",
    )
    assert result["success"] is True
    assert backend.memory_store.pending_count == 1
    assert backend._summarizer.notified == ["user-1"]


@pytest.mark.asyncio
async def test_handle_store_memory_semantic_does_not_notify():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type="semantic",
        user_id="user-1",
        session_id="session-1",
    )
    assert result["success"] is True
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_memory_pending_failure_still_succeeds():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStorePendingFails()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type="episodic",
        user_id="user-1",
    )
    assert result["success"] is True
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_memory_add_failure():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreRaises(RuntimeError("fail"))

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type="episodic",
    )
    assert result["success"] is False
    assert result["error"] == "fail"


@pytest.mark.asyncio
async def test_handle_store_memory_fails_without_store():
    backend = LocalBackend()
    backend.memory_store = None
    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
    )
    assert result["success"] is False
    assert result["error"] == "Memory store not initialized"


@pytest.mark.asyncio
async def test_handle_store_memory_requires_query_and_response():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory(
        user_query="",
        assistant_response="hello",
    )

    assert result["success"] is False
    assert result["error"] == "Missing user_query or assistant_response"
    assert backend.memory_store.added == []
    assert backend.memory_store.pending_count == 0


@pytest.mark.asyncio
async def test_handle_list_conversations_fails_without_store():
    backend = LocalBackend()
    backend.memory_store = None

    result = await backend._handle_list_conversations(user_id="user-1")
    assert result["success"] is False
    assert result["error"] == "Memory store not initialized"


@pytest.mark.asyncio
async def test_handle_store_transcript_success():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_transcript(
        content="hello",
        user_id="user-1",
        conversation_ref="conv-1",
        role="assistant",
        message_type="llm-text",
        tool_name=None,
        correlation_id=None,
        message_index=None,
        model_id="gpt-test",
        model_provider="openai",
        screenshot="base64-shot",
        timestamp="2024-01-01T00:00:00",
    )

    assert result["success"] is True
    assert result["data"]["record_kind"] == "transcript"
    assert backend.memory_store.added
    _, _, _, conversation_id, kwargs = backend.memory_store.added[-1]
    assert conversation_id == "conv-1"
    assert kwargs["model_id"] == "gpt-test"
    assert kwargs["model_provider"] == "openai"
    assert kwargs["screenshot"] == "base64-shot"
    assert kwargs["skip_embedding"] is False
    assert backend.memory_store.pending_count == 1
    assert backend._summarizer.notified == ["user-1"]


@pytest.mark.asyncio
async def test_handle_store_transcript_skips_non_semantic_candidate():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_transcript(
        content='{"name":"run_shell_command"}',
        user_id="user-1",
        conversation_ref="conv-1",
        role="tool",
        message_type="tool-call",
    )

    assert result["success"] is True
    _, _, _, _, kwargs = backend.memory_store.added[-1]
    assert kwargs["skip_embedding"] is True
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_transcript_user_message_does_not_increment_pending():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_transcript(
        content="hello",
        user_id="user-1",
        conversation_ref="conv-1",
        role="user",
        message_type="user",
    )

    assert result["success"] is True
    _, _, _, _, kwargs = backend.memory_store.added[-1]
    assert kwargs["skip_embedding"] is False
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_transcript_pending_failure_still_succeeds():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStorePendingFails()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_transcript(
        content="assistant reply",
        user_id="user-1",
        conversation_ref="conv-1",
        role="assistant",
        message_type="llm-text",
    )

    assert result["success"] is True
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_transcript_requires_content():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_transcript(content="")
    assert result["success"] is False
    assert "Content is required" in result["error"]


def test_signal_handler_requests_shutdown(monkeypatch):
    backend = LocalBackend()
    called = []

    def fake_request_shutdown(signum):
        called.append(signum)

    monkeypatch.setattr(backend, "request_shutdown", fake_request_shutdown)
    monkeypatch.setattr(local_backend_module, "_active_backend", backend)

    local_backend_module.signal_handler(signal.SIGTERM, None)

    assert called == [signal.SIGTERM]


def test_request_shutdown_marks_backend_and_closes_stdin(monkeypatch):
    backend = LocalBackend()

    class DummyStdin:
        def __init__(self):
            self.closed = False
            self.close_calls = 0

        def close(self):
            self.closed = True
            self.close_calls += 1

    dummy_stdin = DummyStdin()
    monkeypatch.setattr(local_backend_module.sys, "stdin", dummy_stdin)

    backend.request_shutdown(signal.SIGTERM)

    assert backend.running is False
    assert backend._shutdown_requested is True
    assert dummy_stdin.closed is True
    assert dummy_stdin.close_calls == 1
