import asyncio
import signal
import logging

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import local_backend as local_backend_module  # noqa: E402
from local_backend import LocalBackend  # noqa: E402
from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402


class DummyRegistry:
    def __init__(self, result):
        self._result = result
        self.tools = {"read_file": object(), "write_file": object()}
        self.execute_calls = []

    async def execute_tool(self, tool_name, args):
        self.execute_calls.append((tool_name, args))
        return self._result


class DummyMemoryStore:
    def __init__(self):
        self.added = []
        self.pending_count = 0
        self.next_index = 1
        self.conversation_calls = []
        self.deleted_semantic_calls = []
        self.deleted_episodic_calls = []
        self.cleared_local_memory_calls = []
        self.cleared_chat_history_calls = []
        self.delete_semantic_return = True
        self.delete_episodic_return = True
        self.clear_local_memory_return = {
            "episodic_deleted_count": 0,
            "semantic_deleted_count": 0,
        }
        self.clear_chat_history_return = {
            "deleted_count": 0,
            "deleted_title_count": 0,
        }

    async def search(self, query, user_id, filters, limit):
        return [
            {"type": "semantic", "text": "fact"},
            {"type": "episodic", "text": "event", "conversation_id": "conv-1"},
        ]

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.added.append((content, user_id, metadata, conversation_id, kwargs))
        return "memory-1"

    async def search_conversations(self, user_id, query, limit=40):
        return [
            {
                "conversation_id": "conv-1",
                "title": "Ubuntu mic settings fix",
                "snippet": "Assistant: Open sound settings and select the right input device.",
                "matched_role": "assistant",
                "last_timestamp": "2026-02-25T00:00:00+00:00",
            }
        ]

    async def get_next_message_index(
        self, user_id, conversation_id, record_kind="transcript"
    ):
        value = self.next_index
        self.next_index += 1
        return value

    async def get_episodic_memories_by_conversation(
        self,
        user_id,
        conversation_id,
        limit,
        record_kind="transcript",
        after_message_index=None,
    ):
        self.conversation_calls.append(
            {
                "user_id": user_id,
                "conversation_id": conversation_id,
                "limit": limit,
                "record_kind": record_kind,
                "after_message_index": after_message_index,
            }
        )
        return [{"id": "mem-1"}]

    async def close(self):
        return None

    async def delete_semantic_memory(self, user_id, memory_id):
        self.deleted_semantic_calls.append((user_id, memory_id))
        return self.delete_semantic_return

    async def delete_episodic_memory(self, user_id, memory_id):
        self.deleted_episodic_calls.append((user_id, memory_id))
        return self.delete_episodic_return

    async def clear_local_memory(self, user_id):
        self.cleared_local_memory_calls.append(user_id)
        return self.clear_local_memory_return

    async def clear_chat_history(self, user_id):
        self.cleared_chat_history_calls.append(user_id)
        return self.clear_chat_history_return


class DummyRegistryRaises:
    def __init__(self, error):
        self.error = error
        self.tools = {"read_file": object()}

    async def execute_tool(self, tool_name, args):
        raise self.error


class BrowserToolRegistry:
    def __init__(self, has_browser: bool, result: ToolResult):
        self._result = result
        self.tools = {"browser": object()} if has_browser else {}
        self.reload_calls = 0
        self.execute_calls = []

    def has_tool(self, tool_name):
        return tool_name in self.tools

    def reload_tools(self):
        self.reload_calls += 1
        self.tools["browser"] = object()

    async def execute_tool(self, tool_name, args):
        self.execute_calls.append((tool_name, args))
        return self._result


class DummyMemoryStoreCapturing(DummyMemoryStore):
    def __init__(self, results):
        super().__init__()
        self.results = results
        self.search_calls = []
        self.search_conversation_calls = []

    async def search(self, query, user_id, filters, limit):
        self.search_calls.append((query, user_id, filters, limit))
        if isinstance(self.results, dict):
            normalized_type = None
            if isinstance(filters, dict):
                normalized_type = filters.get("type")
            return self.results.get(normalized_type, [])
        return self.results

    async def search_conversations(self, user_id, query, limit=40):
        self.search_conversation_calls.append((user_id, query, limit))
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


class DummySummarizerRaises:
    def notify_new_memory(self, user_id):
        raise RuntimeError(f"notify-failed-{user_id}")


class DummyMemoryStoreInit(DummyMemoryStore):
    def __init__(self):
        super().__init__()
        self.initialized = False

    async def initialize(self):
        self.initialized = True


class DummySummarizerInit:
    def __init__(self, memory_store):
        self.memory_store = memory_store
        self.started = False
        self.stopped = False

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True


def test_resolve_sidecar_log_level_defaults_to_warning(monkeypatch):
    monkeypatch.delenv(local_backend_module.ENV_SIDECAR_LOG_LEVEL, raising=False)

    assert (
        local_backend_module._resolve_sidecar_log_level()
        == local_backend_module.logging.WARNING
    )


def test_resolve_sidecar_log_level_accepts_valid_levels(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_SIDECAR_LOG_LEVEL, "info")

    assert (
        local_backend_module._resolve_sidecar_log_level()
        == local_backend_module.logging.INFO
    )


def test_resolve_sidecar_log_level_falls_back_on_invalid_value(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_SIDECAR_LOG_LEVEL, "verbose-ish")

    assert (
        local_backend_module._resolve_sidecar_log_level()
        == local_backend_module.logging.WARNING
    )


def test_collect_runtime_dependency_warnings_linux_missing_xdotool(monkeypatch):
    monkeypatch.setattr(local_backend_module.platform, "system", lambda: "Linux")
    monkeypatch.setattr(local_backend_module.shutil, "which", lambda _name: None)

    warnings = local_backend_module._collect_runtime_dependency_warnings()

    assert len(warnings) == 1
    assert "xdotool" in warnings[0]


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
async def test_handle_execute_tool_preserves_contract_fields_for_backend_boundary():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(
        ToolResult.success_result(
            {
                "llm_content": "ok",
                "screenshot_ref": "artifact-1.png",
                "capture_meta": {
                    "source_w": 1920,
                    "source_h": 1080,
                    "crop_x": 0,
                    "crop_y": 0,
                    "crop_w": 1920,
                    "crop_h": 1080,
                    "timestamp": 1700000000000,
                },
                "system_state": {
                    "active_window": "Terminal",
                    "mouse_position": "(10, 20)",
                },
            }
        )
    )

    result = await backend._handle_execute_tool(
        "mouse_control",
        {"action": "click", "x": 10, "y": 20},
    )

    assert result == {
        "success": True,
        "data": {
            "llm_content": "ok",
            "screenshot_ref": "artifact-1.png",
            "capture_meta": {
                "source_w": 1920,
                "source_h": 1080,
                "crop_x": 0,
                "crop_y": 0,
                "crop_w": 1920,
                "crop_h": 1080,
                "timestamp": 1700000000000,
            },
            "system_state": {
                "active_window": "Terminal",
                "mouse_position": "(10, 20)",
            },
        },
    }


@pytest.mark.asyncio
async def test_handle_execute_tool_preserves_direct_tool_fields():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({"ok": True}))
    args = {
        "action": "click",
        "find_coordinates_by": "ocr",
        "ocr_text": "Submit",
    }

    result = await backend._handle_execute_tool("mouse_control", args)

    assert result == {"success": True, "data": {"ok": True}}
    assert backend.tool_registry.execute_calls == [("mouse_control", args)]


@pytest.mark.asyncio
async def test_handle_execute_tool_routes_direct_tool_with_real_registry():
    backend = LocalBackend()
    registry = ToolRegistry()
    captured = {}

    def mouse_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True})

    registry.tools["mouse_control"] = mouse_tool
    backend.tool_registry = registry
    args = {
        "action": "click",
        "x": 10,
        "y": 20,
    }

    result = await backend._handle_execute_tool("mouse_control", args)

    assert result == {"success": True, "data": {"ok": True}}
    assert captured["args"] == {"action": "click", "x": 10, "y": 20}


@pytest.mark.asyncio
async def test_handle_execute_tool_prevents_argument_mutation_leak():
    backend = LocalBackend()
    registry = ToolRegistry()
    captured = {}

    def mouse_tool(args):
        captured["before"] = {
            "action": args.get("action"),
            "x": args.get("x"),
            "nested": dict(args.get("nested", {})),
        }
        args["x"] = 999
        nested = args.get("nested")
        if isinstance(nested, dict):
            nested["candidate_id"] = "mutated"
        return ToolResult.success_result({"ok": True})

    registry.tools["mouse_control"] = mouse_tool
    backend.tool_registry = registry
    args = {
        "action": "click",
        "x": 10,
        "nested": {"candidate_id": "cand-1"},
    }

    result = await backend._handle_execute_tool("mouse_control", args)

    assert result == {"success": True, "data": {"ok": True}}
    assert captured["before"] == {
        "action": "click",
        "x": 10,
        "nested": {"candidate_id": "cand-1"},
    }
    assert args == {
        "action": "click",
        "x": 10,
        "nested": {"candidate_id": "cand-1"},
    }


@pytest.mark.asyncio
async def test_handle_execute_tool_exception():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistryRaises(RuntimeError("boom"))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result["success"] is False
    assert result["error"] == "Tool execution failed: boom"


@pytest.mark.asyncio
async def test_handle_execute_tool_browser_feature_pack_install_failure(monkeypatch):
    backend = LocalBackend()
    backend.tool_registry = BrowserToolRegistry(
        has_browser=False,
        result=ToolResult.success_result({"ok": True}),
    )
    backend._browser_feature_pack_autoinstall_enabled = True

    monkeypatch.setattr(
        local_backend_module, "is_feature_pack_available", lambda *_: False
    )
    monkeypatch.setattr(
        local_backend_module, "install_feature_pack", lambda *_: (False, "network down")
    )

    result = await backend._handle_execute_tool("browser", {"action": "snapshot"})

    assert result["success"] is False
    assert "Browser feature pack installation failed" in result["error"]
    assert "network down" in result["error"]
    assert "pip install" in result["error"]
    assert backend.tool_registry.execute_calls == []


@pytest.mark.asyncio
async def test_handle_execute_tool_browser_feature_pack_install_success(monkeypatch):
    backend = LocalBackend()
    backend.tool_registry = BrowserToolRegistry(
        has_browser=False,
        result=ToolResult.success_result({"ok": True}),
    )
    backend._browser_feature_pack_autoinstall_enabled = True
    feature_state = {"available": False}

    def _is_feature_pack_available(_pack):
        return feature_state["available"]

    def _install_feature_pack(_pack):
        feature_state["available"] = True
        return True, None

    monkeypatch.setattr(
        local_backend_module, "is_feature_pack_available", _is_feature_pack_available
    )
    monkeypatch.setattr(
        local_backend_module, "install_feature_pack", _install_feature_pack
    )

    result = await backend._handle_execute_tool("browser", {"action": "snapshot"})

    assert result == {"success": True, "data": {"ok": True}}
    assert backend.tool_registry.reload_calls == 1
    assert backend.tool_registry.execute_calls == [("browser", {"action": "snapshot"})]


@pytest.mark.asyncio
async def test_handle_execute_tool_browser_feature_pack_autoinstall_disabled(
    monkeypatch,
):
    backend = LocalBackend()
    backend.tool_registry = BrowserToolRegistry(
        has_browser=False,
        result=ToolResult.success_result({"ok": True}),
    )
    backend._browser_feature_pack_autoinstall_enabled = False

    monkeypatch.setattr(
        local_backend_module, "is_feature_pack_available", lambda *_: False
    )

    result = await backend._handle_execute_tool("browser", {"action": "snapshot"})

    assert result["success"] is False
    assert "Browser feature pack is unavailable in this runtime" in result["error"]
    assert "pip install" in result["error"]


@pytest.mark.asyncio
async def test_handle_get_status_reports_tools():
    backend = LocalBackend()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({}))
    backend.running = True
    backend.memory_store = DummyMemoryStore()
    backend._runtime_dependency_warnings = ["missing xdotool"]
    backend._find_available_browser_binary = lambda: "/tmp/chromium"  # type: ignore[assignment]

    status = await backend._handle_get_status()
    assert status["running"] is True
    assert status["tool_count"] == 2
    assert "read_file" in status["registered_tools"]
    assert status["semantic_summarizer_enabled"] is True
    assert status["runtime_dependency_warnings"] == ["missing xdotool"]
    assert status["browser_binary_available"] is True
    assert status["browser_binary_path"] == "/tmp/chromium"


@pytest.mark.asyncio
async def test_handle_install_browser_chromium_skips_when_browser_already_available():
    backend = LocalBackend()
    backend._find_available_browser_binary = lambda: "/usr/bin/chromium"  # type: ignore[assignment]

    result = await backend._handle_install_browser_chromium()

    assert result["success"] is True
    assert result["installed"] is False
    assert result["skipped"] is True
    assert result["browser_binary_path"] == "/usr/bin/chromium"


def test_find_available_browser_binary_prefers_system_browser_over_playwright_cache(
    monkeypatch, tmp_path
):
    backend = LocalBackend()
    playwright_root = tmp_path / "ms-playwright"
    playwright_browser = playwright_root / "chromium-123" / "chrome-linux" / "chrome"
    playwright_browser.parent.mkdir(parents=True, exist_ok=True)
    playwright_browser.write_text("")

    existing_paths = {
        "/usr/bin/google-chrome",
        str(playwright_browser),
    }

    monkeypatch.setattr(local_backend_module.platform, "system", lambda: "Linux")
    monkeypatch.setattr(
        backend,
        "_resolve_playwright_browsers_path",
        lambda: playwright_root,
    )
    monkeypatch.setattr(
        local_backend_module.glob,
        "glob",
        lambda pattern: [str(playwright_browser)] if "chromium-*" in pattern else [],
    )
    monkeypatch.setattr(
        local_backend_module.Path,
        "exists",
        lambda self: str(self) in existing_paths,
    )
    monkeypatch.setattr(
        local_backend_module.Path,
        "is_file",
        lambda self: str(self) in existing_paths,
    )

    assert backend._find_available_browser_binary() == "/usr/bin/google-chrome"


@pytest.mark.asyncio
async def test_handle_install_browser_chromium_installs_when_missing(
    monkeypatch, tmp_path
):
    backend = LocalBackend()
    browser_checks = {"count": 0}

    def _find_browser():
        browser_checks["count"] += 1
        if browser_checks["count"] >= 3:
            return str(
                tmp_path / "ms-playwright" / "chromium-123" / "chrome-linux" / "chrome"
            )
        return None

    async def _ensure_ready():
        return None

    class _RunResult:
        returncode = 0
        stdout = "ok"
        stderr = ""

    backend._find_available_browser_binary = _find_browser  # type: ignore[assignment]
    backend._ensure_browser_tool_ready = _ensure_ready  # type: ignore[assignment]
    backend._resolve_playwright_browsers_path = lambda: tmp_path / "ms-playwright"  # type: ignore[assignment]

    monkeypatch.setattr(
        local_backend_module.subprocess, "run", lambda *args, **kwargs: _RunResult()
    )

    result = await backend._handle_install_browser_chromium()

    assert result["success"] is True
    assert result["installed"] is True
    assert result["skipped"] is False
    assert "browser_binary_path" in result


@pytest.mark.asyncio
async def test_handle_install_browser_chromium_reports_install_failure(
    monkeypatch, tmp_path
):
    backend = LocalBackend()

    async def _ensure_ready():
        return None

    class _RunResult:
        returncode = 1
        stdout = ""
        stderr = "download failed"

    backend._find_available_browser_binary = lambda: None  # type: ignore[assignment]
    backend._ensure_browser_tool_ready = _ensure_ready  # type: ignore[assignment]
    backend._resolve_playwright_browsers_path = lambda: tmp_path / "ms-playwright"  # type: ignore[assignment]

    monkeypatch.setattr(
        local_backend_module.subprocess, "run", lambda *args, **kwargs: _RunResult()
    )

    result = await backend._handle_install_browser_chromium()

    assert result["success"] is False
    assert result["installed"] is False
    assert "Chromium install command failed" in result["error"]
    assert result["returncode"] == 1


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
async def test_initialize_starts_memory_summarizer_when_enabled(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_ENABLE_SEMANTIC_SUMMARIZER, "1")

    fake_store = DummyMemoryStoreInit()
    created_summarizers = []

    class _DummySummarizer(DummySummarizerInit):
        def __init__(self, memory_store):
            super().__init__(memory_store)
            created_summarizers.append(self)

    monkeypatch.setattr(local_backend_module, "LocalMemoryStore", lambda: fake_store)
    monkeypatch.setattr(local_backend_module, "MemorySummarizer", _DummySummarizer)

    backend = LocalBackend()
    await backend.initialize()
    await backend._wait_for_memory_runtime_initialization()
    await backend.shutdown()

    assert fake_store.initialized is True
    assert len(created_summarizers) == 1
    assert created_summarizers[0].started is True
    assert backend._summarizer is created_summarizers[0]


@pytest.mark.asyncio
async def test_initialize_skips_memory_summarizer_when_disabled(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_ENABLE_SEMANTIC_SUMMARIZER, "0")

    fake_store = DummyMemoryStoreInit()
    created = {"count": 0}

    class _DummySummarizer:
        def __init__(self, *_args, **_kwargs):
            created["count"] += 1

    monkeypatch.setattr(local_backend_module, "LocalMemoryStore", lambda: fake_store)
    monkeypatch.setattr(local_backend_module, "MemorySummarizer", _DummySummarizer)

    backend = LocalBackend()
    await backend.initialize()
    await backend._wait_for_memory_runtime_initialization()
    await backend.shutdown()

    assert backend._semantic_summarizer_enabled is False
    assert fake_store.initialized is True
    assert created["count"] == 0
    assert backend._summarizer is None


@pytest.mark.asyncio
async def test_initialize_does_not_block_on_memory_store_initialization(monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()

    class _SlowMemoryStore(DummyMemoryStore):
        def __init__(self):
            super().__init__()
            self.initialized = False

        async def initialize(self):
            started.set()
            await release.wait()
            self.initialized = True

    monkeypatch.setattr(local_backend_module, "LocalMemoryStore", _SlowMemoryStore)
    monkeypatch.setattr(local_backend_module, "MemorySummarizer", None)

    backend = LocalBackend()
    await backend.initialize()
    await asyncio.wait_for(started.wait(), timeout=1)

    status = await backend._handle_get_status()
    assert status["memory_store_initialized"] is False
    assert status["memory_store_initializing"] is True
    assert status["memory_store_status"] == "initializing"

    release.set()
    await backend._wait_for_memory_runtime_initialization()

    assert backend.memory_store is not None
    assert backend.memory_store.initialized is True
    await backend.shutdown()


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
async def test_handle_get_system_state_system_exit_error(monkeypatch):
    backend = LocalBackend()

    async def raise_state(fields=None):
        raise SystemExit("tkinter missing")

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", raise_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result["success"] is False
    assert result["error"] == "tkinter missing"


def test_initialize_methods_keeps_memory_handlers_registered():
    backend = LocalBackend()

    expected_methods = {
        "search_memory",
        "store_memory",
        "search_conversations",
        "list_conversations",
        "list_episodic_memories",
        "get_conversation",
        "list_semantic_memories",
        "delete_episodic_memory",
        "delete_conversation",
        "delete_semantic_memory",
        "clear_local_memory",
        "clear_chat_history",
        "store_transcript",
    }
    assert expected_methods.issubset(set(backend.protocol.methods.keys()))


@pytest.mark.asyncio
async def test_handle_search_memory_groups_results():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_search_memory("query", user_id="user-1")
    assert result["success"] is True
    assert result["data"]["memories"]["semantic"] == ["fact"]
    assert result["data"]["memories"]["episodic"] == ["event"]


@pytest.mark.asyncio
async def test_handle_search_conversations_returns_matches():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing(
        [
            {
                "conversation_id": "conv-2",
                "title": "Legal research thread",
                "snippet": "You: Need a Vietnamese-speaking lawyer lead in CA.",
                "matched_role": "user",
                "last_timestamp": "2026-02-25T00:00:00+00:00",
            }
        ]
    )

    result = await backend._handle_search_conversations(
        query="vietnamese lawyer",
        user_id="user-1",
        limit=25,
    )
    assert result["success"] is True
    assert result["data"]["count"] == 1
    assert result["data"]["conversations"][0]["conversation_id"] == "conv-2"
    assert backend.memory_store.search_conversation_calls == [
        ("user-1", "vietnamese lawyer", 25)
    ]


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
    assert backend.memory_store.search_calls == [
        ("query", "user-1", {"type": "semantic"}, 3)
    ]


@pytest.mark.asyncio
async def test_handle_search_memory_rejects_invalid_memory_type_filter():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing([])

    result = await backend._handle_search_memory(
        "query",
        memory_type="archive",
    )
    assert result["success"] is False
    assert result["error"] == "Invalid memory_type: archive"
    assert backend.memory_store.search_calls == []


@pytest.mark.asyncio
async def test_handle_search_memory_normalizes_query_and_type_filter():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing([])

    result = await backend._handle_search_memory(
        "  query  ",
        user_id="user-1",
        memory_type=" SEMANTIC ",
    )
    assert result["success"] is True
    assert backend.memory_store.search_calls == [
        ("query", "user-1", {"type": "semantic"}, 5)
    ]


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
            {
                "type": "episodic",
                "text": "from active",
                "conversation_id": "conv-active",
            },
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
async def test_handle_search_memory_balances_episodic_and_semantic_results():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStoreCapturing(
        {
            "episodic": [
                {
                    "type": "episodic",
                    "text": "from active",
                    "conversation_id": "conv-active",
                    "score": 0.95,
                },
                {
                    "type": "episodic",
                    "text": "from old",
                    "conversation_id": "conv-old",
                    "score": 0.9,
                },
            ],
            "semantic": [
                {"type": "semantic", "text": "high value fact", "score": 0.3},
                {"type": "semantic", "text": "low value fact", "score": 0.1},
            ],
        }
    )

    result = await backend._handle_search_memory(
        "query",
        user_id="user-1",
        limit=6,
        exclude_conversation_id="conv-active",
        episodic_limit=4,
        semantic_limit=2,
        semantic_min_score=0.2,
    )

    assert result["success"] is True
    assert result["data"]["memories"]["episodic"] == ["from old"]
    assert result["data"]["memories"]["semantic"] == ["high value fact"]
    assert backend.memory_store.search_calls == [
        ("query", "user-1", {"type": "episodic"}, 4),
        ("query", "user-1", {"type": "semantic"}, 2),
    ]


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
    _, _, _, conversation_id, kwargs = backend.memory_store.added[-1]
    assert conversation_id == "session-1"
    assert kwargs["record_kind"] == "interaction"
    assert backend.memory_store.pending_count == 0
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
    _, _, _, conversation_id, kwargs = backend.memory_store.added[-1]
    assert conversation_id == "session-1"
    assert kwargs["record_kind"] == "interaction"
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_memory_notify_failure_still_succeeds():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizerRaises()

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type="episodic",
        user_id="user-1",
    )
    assert result["success"] is True
    assert backend.memory_store.pending_count == 0


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
async def test_handle_store_memory_treats_none_fields_as_missing():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory(
        user_query=None,  # type: ignore[arg-type]
        assistant_response="hello",
    )

    assert result["success"] is False
    assert result["error"] == "Missing user_query or assistant_response"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_rejects_whitespace_only_fields():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory(
        user_query="   ",
        assistant_response="\n\t",
    )

    assert result["success"] is False
    assert result["error"] == "Missing user_query or assistant_response"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_rejects_invalid_memory_type():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type="archive",
    )

    assert result["success"] is False
    assert result["error"] == "Invalid memory_type: archive"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_rejects_non_string_query_or_response():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory(
        user_query=123,  # type: ignore[arg-type]
        assistant_response="hello",
    )

    assert result["success"] is False
    assert result["error"] == "user_query and assistant_response must be strings"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_rejects_non_string_memory_type():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory(
        user_query="hi",
        assistant_response="hello",
        memory_type=7,  # type: ignore[arg-type]
    )

    assert result["success"] is False
    assert result["error"] == "memory_type must be a string"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_list_conversations_fails_without_store():
    backend = LocalBackend()
    backend.memory_store = None

    result = await backend._handle_list_conversations(user_id="user-1")
    assert result["success"] is False
    assert result["error"] == "Memory store not initialized"


@pytest.mark.asyncio
async def test_handle_get_conversation_forwards_after_message_index_cursor():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_get_conversation(
        user_id="user-1",
        conversation_id="conv-1",
        limit=250,
        record_kind="transcript",
        after_message_index=1200,
    )

    assert result["success"] is True
    assert result["data"]["conversation_id"] == "conv-1"
    assert result["data"]["count"] == 1
    assert backend.memory_store.conversation_calls == [
        {
            "user_id": "user-1",
            "conversation_id": "conv-1",
            "limit": 250,
            "record_kind": "transcript",
            "after_message_index": 1200,
        }
    ]


@pytest.mark.asyncio
async def test_handle_delete_episodic_memory_routes_to_store():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_delete_episodic_memory(
        user_id="user-1",
        memory_id="ep-1",
    )

    assert result == {
        "success": True,
        "data": {
            "memory_id": "ep-1",
            "deleted": True,
        },
    }
    assert backend.memory_store.deleted_episodic_calls == [("user-1", "ep-1")]


@pytest.mark.asyncio
async def test_handle_delete_episodic_memory_requires_memory_id():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_delete_episodic_memory(
        user_id="user-1",
        memory_id=None,
    )

    assert result["success"] is False
    assert result["error"] == "memory_id is required"


@pytest.mark.asyncio
async def test_handle_clear_local_memory_routes_to_store():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend.memory_store.clear_local_memory_return = {
        "episodic_deleted_count": 4,
        "semantic_deleted_count": 2,
    }

    result = await backend._handle_clear_local_memory(user_id="user-1")

    assert result == {
        "success": True,
        "data": {
            "episodic_deleted_count": 4,
            "semantic_deleted_count": 2,
        },
    }
    assert backend.memory_store.cleared_local_memory_calls == ["user-1"]


@pytest.mark.asyncio
async def test_handle_clear_chat_history_routes_to_store():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend.memory_store.clear_chat_history_return = {
        "deleted_count": 8,
        "deleted_title_count": 3,
    }

    result = await backend._handle_clear_chat_history(user_id="user-1")

    assert result == {
        "success": True,
        "data": {
            "deleted_count": 8,
            "deleted_title_count": 3,
        },
    }
    assert backend.memory_store.cleared_chat_history_calls == ["user-1"]


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
        transparency={
            "systemPrompt": "prompt text",
            "fullAssistantMessage": {"content": "raw assistant"},
        },
    )

    assert result["success"] is True
    assert result["data"]["record_kind"] == "transcript"
    assert backend.memory_store.added
    _, _, metadata, conversation_id, kwargs = backend.memory_store.added[-1]
    assert conversation_id == "conv-1"
    assert metadata["transparency"] == {
        "systemPrompt": "prompt text",
        "fullAssistantMessage": {"content": "raw assistant"},
    }
    assert kwargs["model_id"] == "gpt-test"
    assert kwargs["model_provider"] == "openai"
    assert kwargs["screenshot"] == "base64-shot"
    assert kwargs["skip_embedding"] is False
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_transcript_omits_whitespace_correlation_id():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_transcript(
        content="hello",
        user_id="user-1",
        conversation_ref="conv-1",
        role="assistant",
        message_type="llm-text",
        correlation_id=" \t ",
    )

    assert result["success"] is True
    _, _, metadata, _, kwargs = backend.memory_store.added[-1]
    assert "correlation_id" not in metadata
    assert kwargs["correlation_id"] is None


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
async def test_handle_store_transcript_requires_content():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_transcript(content="")
    assert result["success"] is False
    assert "Content is required" in result["error"]


@pytest.mark.asyncio
async def test_handle_store_transcript_sanitizes_lone_surrogates_in_content(caplog):
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    caplog.set_level(logging.WARNING, logger="local_backend_memory_handlers")

    result = await backend._handle_store_transcript(
        content="bad\udc9dtitle",
        user_id="user-1",
        conversation_ref="conv-1",
        role="assistant",
        message_type="llm-text",
    )

    assert result["success"] is True
    content, _, _, _, _ = backend.memory_store.added[-1]
    assert content == "bad�title"
    assert "store_transcript.content" in caplog.text


@pytest.mark.asyncio
async def test_handle_store_transcript_sanitizes_surrogate_in_transparency():
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_transcript(
        content="assistant",
        user_id="user-1",
        conversation_ref="conv-1",
        role="assistant",
        message_type="llm-text",
        transparency={
            "systemPrompt": "bad\udc9dprompt",
            "fullAssistantMessage": {"content": "ok"},
        },
    )

    assert result["success"] is True
    _, _, metadata, _, _ = backend.memory_store.added[-1]
    assert metadata["transparency"]["systemPrompt"] == "bad�prompt"


@pytest.mark.asyncio
async def test_handle_store_memory_logs_surrogate_field_paths(caplog):
    backend = LocalBackend()
    backend.memory_store = DummyMemoryStore()
    caplog.set_level(logging.WARNING, logger="local_backend_memory_handlers")

    result = await backend._handle_store_memory(
        user_query="bad\udc9dquery",
        assistant_response="ok",
        memory_type="episodic",
        user_id="user-1",
        session_id="conv-1",
    )

    assert result["success"] is True
    assert "store_memory.user_query" in caplog.text


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
