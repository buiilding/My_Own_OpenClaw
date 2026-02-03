import sys
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

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

    async def search(self, query, user_id, filters, limit):
        return [
            {"type": "semantic", "text": "fact"},
            {"type": "episodic", "text": "event"},
        ]

    async def add(self, content, user_id, metadata, conversation_id=None):
        self.added.append((content, user_id, metadata, conversation_id))
        return "memory-1"

    async def increment_pending_count(self):
        self.pending_count += 1

    async def close(self):
        return None


class DummySummarizer:
    def __init__(self):
        self.notified = []

    def notify_new_memory(self, user_id):
        self.notified.append(user_id)


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
async def test_handle_get_system_state(monkeypatch):
    backend = LocalBackend()

    async def fake_state(fields=None):
        return {"active_window": "App"}

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", fake_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result == {"success": True, "data": {"active_window": "App"}}


@pytest.mark.asyncio
async def test_handle_search_memory_groups_results():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_search_memory("query", user_id="user-1")
    assert result["success"] is True
    assert result["data"]["memories"]["semantic"] == ["fact"]
    assert result["data"]["memories"]["episodic"] == ["event"]


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
async def test_handle_store_memory_fails_without_store():
    backend = LocalBackend()
    backend.memory_store = None
    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
    )
    assert result["success"] is False
