"""Covers local-runtime Python service behavior."""

import asyncio
import logging
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import local_backend as local_backend_module  # noqa: E402
import local_backend_memory_handlers as memory_handlers_module  # noqa: E402
from local_backend import LocalRuntimeService  # noqa: E402
from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402


def direct_chat_method(*parts: str) -> str:
    return "_".join(parts)


RETIRED_DIRECT_CHAT_METHODS = {
    direct_chat_method("store", "chat", "event"),
    direct_chat_method("list", "chat", "conversations"),
    direct_chat_method("search", "chat", "conversations"),
    direct_chat_method("get", "chat", "events"),
    direct_chat_method("get", "chat", "conversation", "revision"),
    direct_chat_method("delete", "chat", "conversation"),
    direct_chat_method("replace", "chat", "conversation"),
    direct_chat_method("rewrite", "chat", "conversation", "after", "event"),
}


def test_local_runtime_service_copy_uses_local_runtime_terms():
    sources = "\n".join(
        Path(module_path).read_text(encoding="utf-8")
        for module_path in [
            local_backend_module.__file__,
            memory_handlers_module.__file__,
            Path(local_backend_module.__file__).parent / "core" / "ipc_protocol.py",
            Path(local_backend_module.__file__).parent / "folder_structure.md",
            Path(local_backend_module.__file__).parent / "requirements.txt",
            Path(local_backend_module.__file__).parent / "requirements.runtime.txt",
        ]
    )

    retired_runtime_label = "Python " + "sidecar runtime"
    retired_daemon_phrase = "sidecar " + "daemon"
    retired_dependency_phrase = "Python " + "sidecar dependencies"
    retired_product_backend_service = "Local backend service for " + ("Windie" "OS")

    assert "Python local runtime" in sources
    assert "Local-runtime Python dependencies" in sources
    assert "local runtime daemon" in sources
    assert "local-runtime storage/search" in sources
    assert retired_runtime_label not in sources
    assert retired_daemon_phrase not in sources
    assert retired_dependency_phrase not in sources
    assert "sidecar " + "storage/search" not in sources
    assert retired_product_backend_service not in sources
    assert "Main local backend service" not in sources
    assert "Initializing local backend" not in sources
    assert "Shutting down local backend" not in sources
    assert "Get detailed backend status" not in sources


def test_local_runtime_python_tests_use_boundary_labels():
    test_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in [
            Path(__file__),
            Path(__file__).parent / "test_browser_registry.py",
        ]
    )

    retired_docstring = (
        "Covers " + "local " + "backend behavior in the sidecar test suite."
    )
    retired_backend_test = (
        "test_" + "local_backend_runtime_copy_uses_local_runtime_terms"
    )
    retired_helper_paths = "SIDECAR_" + "TOOL_HELPER_PATHS"
    retired_helper_test = "test_" + "sidecar_tool_helper_copy_uses_local_runtime_terms"

    assert "Covers local-runtime Python service behavior." in test_sources
    assert "test_local_runtime_service_copy_uses_local_runtime_terms" in test_sources
    assert "LOCAL_RUNTIME_TOOL_HELPER_PATHS" in test_sources
    assert (
        "test_local_runtime_tool_helper_copy_uses_local_runtime_terms" in test_sources
    )
    assert retired_docstring not in test_sources
    assert retired_backend_test not in test_sources
    assert retired_helper_paths not in test_sources
    assert retired_helper_test not in test_sources


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
        self.deleted_semantic_calls = []
        self.deleted_episodic_calls = []
        self.cleared_local_memory_calls = []
        self.cleared_chat_history_calls = []
        self.chat_event_calls = []
        self.list_chat_conversation_calls = []
        self.chat_event_rows = []
        self.deleted_chat_conversation_calls = []
        self.list_conversation_revisions_calls = []
        self.replaced_display_timeline_calls = []
        self.loaded_display_timeline_calls = []
        self.replaced_model_history_calls = []
        self.loaded_model_history_calls = []
        self.delete_semantic_return = True
        self.delete_episodic_return = True
        self.clear_local_memory_return = {
            "episodic_deleted_count": 0,
            "semantic_deleted_count": 0,
        }
        self.clear_chat_history_return = {
            "deleted_count": 0,
            "deleted_revision_count": 0,
            "deleted_title_count": 0,
        }

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.added.append((content, user_id, metadata, conversation_id, kwargs))
        return "memory-1"

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

    async def append_chat_event(self, **kwargs):
        self.chat_event_calls.append(kwargs)
        return {"event_id": "evt-1", "message_index": kwargs.get("message_index") or 1}

    async def list_conversations(self, user_id, limit=None):
        self.list_chat_conversation_calls.append((user_id, limit))
        return [{"conversation_id": "conv-chat"}]

    async def search_conversations(self, user_id, query, limit=40):
        return [{"conversation_id": "conv-chat", "query": query, "limit": limit}]

    async def load_conversation_events(
        self, user_id, conversation_id, limit=1000, after_message_index=None
    ):
        return self.chat_event_rows or [
            {"id": "evt-1", "conversation_id": conversation_id}
        ]

    async def delete_conversation(self, user_id, conversation_id):
        self.deleted_chat_conversation_calls.append((user_id, conversation_id))
        return 1

    async def get_conversation_revision(self, user_id, conversation_id):
        return {
            "conversation_id": conversation_id,
            "revision_id": "rev-next",
            "updated_at": "2026-05-17T12:00:00+00:00",
            "record_kind": "chat_event",
        }

    async def list_conversation_revisions(self, user_id, conversation_id, limit=None):
        self.list_conversation_revisions_calls.append((user_id, conversation_id, limit))
        return [
            {
                "conversation_id": conversation_id,
                "revision_id": "rev-next",
                "updated_at": "2026-05-17T12:00:00+00:00",
                "active": True,
                "record_kind": "chat_event",
            }
        ]

    async def replace_display_timeline(
        self,
        user_id,
        conversation_id,
        revision_id,
        rows,
        created_at=None,
        reason=None,
        base_revision_id=None,
    ):
        self.replaced_display_timeline_calls.append(
            (
                user_id,
                conversation_id,
                revision_id,
                rows,
                created_at,
                reason,
                base_revision_id,
            )
        )
        return {
            "revision_id": revision_id,
            "row_count": len(rows),
            "created_at": created_at,
        }

    async def load_display_timeline(
        self,
        user_id,
        conversation_id,
        revision_id=None,
    ):
        self.loaded_display_timeline_calls.append(
            (user_id, conversation_id, revision_id)
        )
        return {
            "conversation_id": conversation_id,
            "revision_id": revision_id or "rev-latest",
            "created_at": "2026-06-22T12:00:00+00:00",
            "rows": [
                {
                    "id": "display-row-1",
                    "role": "user",
                    "type": "user_message",
                    "content": "hello",
                }
            ],
        }

    async def replace_model_history_checkpoint(
        self,
        user_id,
        conversation_id,
        revision_id,
        checkpoint_id,
        rows,
        created_at=None,
    ):
        self.replaced_model_history_calls.append(
            (user_id, conversation_id, revision_id, checkpoint_id, rows, created_at)
        )
        return {
            "checkpoint_id": checkpoint_id,
            "revision_id": revision_id,
            "row_count": len(rows),
            "created_at": created_at,
        }

    async def load_model_history_checkpoint(
        self,
        user_id,
        conversation_id,
        revision_id=None,
    ):
        self.loaded_model_history_calls.append((user_id, conversation_id, revision_id))
        return {
            "checkpoint_id": "mh-1",
            "conversation_id": conversation_id,
            "revision_id": revision_id or "rev-latest",
            "created_at": "2026-06-22T12:00:00+00:00",
            "rows": [
                {
                    "id": "row-1",
                    "role": "user",
                    "message_type": "user_query",
                    "content": "hello",
                }
            ],
        }


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
        self.search_by_embedding_calls = []

    async def search_by_embedding(
        self,
        embedding,
        user_id,
        filters,
        limit,
        embedding_space_version=None,
    ):
        self.search_by_embedding_calls.append(
            (embedding, user_id, filters, limit, embedding_space_version)
        )
        if isinstance(self.results, dict):
            normalized_type = None
            if isinstance(filters, dict):
                normalized_type = filters.get("type")
            return self.results.get(normalized_type, [])
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


def test_resolve_local_runtime_log_level_defaults_to_warning(monkeypatch):
    monkeypatch.delenv(
        local_backend_module.ENV_AGENT_LOCAL_RUNTIME_LOG_LEVEL, raising=False
    )
    monkeypatch.delenv(local_backend_module.ENV_AGENT_SIDECAR_LOG_LEVEL, raising=False)
    monkeypatch.delenv(local_backend_module.ENV_WINDIE_SIDECAR_LOG_LEVEL, raising=False)

    assert (
        local_backend_module._resolve_local_runtime_log_level()
        == local_backend_module.logging.WARNING
    )


def test_resolve_local_runtime_log_level_accepts_valid_levels(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_SIDECAR_LOG_LEVEL, "info")

    assert (
        local_backend_module._resolve_local_runtime_log_level()
        == local_backend_module.logging.INFO
    )


def test_resolve_local_runtime_log_level_prefers_generic_local_runtime_env(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_SIDECAR_LOG_LEVEL, "debug")
    monkeypatch.setenv(local_backend_module.ENV_AGENT_SIDECAR_LOG_LEVEL, "error")
    monkeypatch.setenv(
        local_backend_module.ENV_AGENT_LOCAL_RUNTIME_LOG_LEVEL, "critical"
    )

    assert (
        local_backend_module._resolve_local_runtime_log_level()
        == local_backend_module.logging.CRITICAL
    )


def test_resolve_local_runtime_log_level_preserves_agent_sidecar_alias(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_SIDECAR_LOG_LEVEL, "debug")
    monkeypatch.setenv(local_backend_module.ENV_AGENT_SIDECAR_LOG_LEVEL, "error")

    assert (
        local_backend_module._resolve_local_runtime_log_level()
        == local_backend_module.logging.ERROR
    )


def test_resolve_local_runtime_log_level_falls_back_on_invalid_value(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_SIDECAR_LOG_LEVEL, "verbose-ish")

    assert (
        local_backend_module._resolve_local_runtime_log_level()
        == local_backend_module.logging.WARNING
    )


def test_local_runtime_log_level_helper_uses_runtime_boundary_name():
    source = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "local_backend.py"
    ).read_text(encoding="utf-8")

    retired_helper_name = "_resolve_" + "sidecar_log_level"
    assert retired_helper_name not in source


def test_local_runtime_feature_flags_prefer_agent_env(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_ENABLE_SEMANTIC_SUMMARIZER, "1")
    monkeypatch.setenv(
        local_backend_module.ENV_WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL,
        "1",
    )
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_PACKAGED_APP, "0")
    monkeypatch.setenv(
        local_backend_module.ENV_AGENT_ENABLE_SEMANTIC_SUMMARIZER,
        "0",
    )
    monkeypatch.setenv(
        local_backend_module.ENV_AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL,
        "0",
    )
    monkeypatch.setenv(local_backend_module.ENV_AGENT_PACKAGED_APP, "1")

    backend = LocalRuntimeService()

    assert backend._semantic_summarizer_enabled is False
    assert backend._browser_feature_pack_autoinstall_enabled is False
    assert backend._packaged_app is True


def test_local_runtime_feature_flags_support_windie_legacy_env(monkeypatch):
    monkeypatch.delenv(
        local_backend_module.ENV_AGENT_ENABLE_SEMANTIC_SUMMARIZER,
        raising=False,
    )
    monkeypatch.delenv(
        local_backend_module.ENV_AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL,
        raising=False,
    )
    monkeypatch.delenv(local_backend_module.ENV_AGENT_PACKAGED_APP, raising=False)
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_ENABLE_SEMANTIC_SUMMARIZER, "0")
    monkeypatch.setenv(
        local_backend_module.ENV_WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL,
        "0",
    )
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_PACKAGED_APP, "1")

    backend = LocalRuntimeService()

    assert backend._semantic_summarizer_enabled is False
    assert backend._browser_feature_pack_autoinstall_enabled is False
    assert backend._packaged_app is True


def test_collect_runtime_dependency_warnings_linux_missing_xdotool(monkeypatch):
    monkeypatch.setattr(local_backend_module.platform, "system", lambda: "Linux")
    monkeypatch.setattr(local_backend_module.shutil, "which", lambda _name: None)

    warnings = local_backend_module._collect_runtime_dependency_warnings()

    assert len(warnings) == 1
    assert "xdotool" in warnings[0]


@pytest.mark.asyncio
async def test_handle_execute_tool_success():
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({"ok": True}))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result == {"success": True, "data": {"ok": True, "output": ""}}


@pytest.mark.asyncio
async def test_handle_execute_tool_error():
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistry(ToolResult.error_result("bad"))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result == {"success": False, "data": {"output": "bad"}, "error": "bad"}


@pytest.mark.asyncio
async def test_handle_execute_tool_preserves_empty_data_payload():
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({}))

    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})

    assert result == {"success": True, "data": {"output": ""}}


@pytest.mark.asyncio
async def test_handle_execute_tool_preserves_contract_fields_for_backend_boundary():
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistry(
        ToolResult.success_result(
            {
                "output": "ok",
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
            "output": "ok",
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
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({"ok": True}))
    args = {
        "action": "click",
        "find_coordinates_by": "ocr",
        "ocr_text": "Submit",
    }

    result = await backend._handle_execute_tool("mouse_control", args)

    assert result == {"success": True, "data": {"ok": True, "output": ""}}
    assert backend.tool_registry.execute_calls == [("mouse_control", args)]


@pytest.mark.asyncio
async def test_handle_execute_tool_routes_direct_tool_with_real_registry():
    backend = LocalRuntimeService()
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

    assert result == {"success": True, "data": {"ok": True, "output": ""}}
    assert captured["args"] == {"action": "click", "x": 10, "y": 20}


@pytest.mark.asyncio
async def test_handle_execute_tool_prevents_argument_mutation_leak():
    backend = LocalRuntimeService()
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

    assert result == {"success": True, "data": {"ok": True, "output": ""}}
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
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistryRaises(RuntimeError("boom"))
    result = await backend._handle_execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result["success"] is False
    assert result["error"] == "Tool execution failed: boom"


@pytest.mark.asyncio
async def test_handle_execute_tool_browser_feature_pack_install_failure(monkeypatch):
    backend = LocalRuntimeService()
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
    backend = LocalRuntimeService()
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

    assert result == {"success": True, "data": {"ok": True, "output": ""}}
    assert backend.tool_registry.reload_calls == 1
    assert backend.tool_registry.execute_calls == [("browser", {"action": "snapshot"})]


@pytest.mark.asyncio
async def test_handle_execute_tool_browser_feature_pack_autoinstall_disabled(
    monkeypatch,
):
    backend = LocalRuntimeService()
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
async def test_handle_execute_tool_browser_packaged_runtime_uses_generic_install_copy(
    monkeypatch,
):
    backend = LocalRuntimeService()
    backend.tool_registry = BrowserToolRegistry(
        has_browser=False,
        result=ToolResult.success_result({"ok": True}),
    )
    backend._browser_feature_pack_autoinstall_enabled = False
    backend._packaged_app = True

    monkeypatch.setattr(
        local_backend_module, "is_feature_pack_available", lambda *_: False
    )

    result = await backend._handle_execute_tool("browser", {"action": "snapshot"})

    assert result["success"] is False
    assert "bundled app install" in result["error"]
    assert "Reinstall this app" in result["error"]
    assert "Windie" "OS" not in result["error"]


@pytest.mark.asyncio
async def test_handle_ping_reports_local_runtime_service():
    backend = LocalRuntimeService()

    result = await backend._handle_ping()

    assert result == {"status": "ok", "service": "local_runtime"}


@pytest.mark.asyncio
async def test_handle_get_status_reports_tools():
    backend = LocalRuntimeService()
    backend.tool_registry = DummyRegistry(ToolResult.success_result({}))
    backend.running = True
    backend.memory_store = DummyMemoryStore()
    backend._runtime_dependency_warnings = ["missing xdotool"]
    backend._find_available_browser_binary = lambda: "/tmp/chromium"  # type: ignore[assignment]

    status = await backend._handle_get_status()
    assert status["service"] == "local_runtime"
    assert status["running"] is True
    assert status["tool_count"] == 2
    assert "read_file" in status["registered_tools"]
    assert status["semantic_summarizer_enabled"] is True
    assert status["runtime_dependency_warnings"] == ["missing xdotool"]
    assert status["browser_binary_available"] is True
    assert status["browser_binary_path"] == "/tmp/chromium"


@pytest.mark.asyncio
async def test_handle_install_browser_chromium_skips_when_browser_already_available():
    backend = LocalRuntimeService()
    backend._find_available_browser_binary = lambda: "/usr/bin/chromium"  # type: ignore[assignment]

    result = await backend._handle_install_browser_chromium()

    assert result["success"] is True
    assert result["installed"] is False
    assert result["skipped"] is True
    assert result["browser_binary_path"] == "/usr/bin/chromium"


def test_find_available_browser_binary_prefers_system_browser_over_playwright_cache(
    monkeypatch, tmp_path
):
    backend = LocalRuntimeService()
    playwright_root = tmp_path / "ms-playwright"
    playwright_browser = playwright_root / "chromium-123" / "chrome-linux" / "chrome"
    playwright_browser.parent.mkdir(parents=True, exist_ok=True)
    playwright_browser.write_text("")

    def path_key(value):
        return str(value).replace("\\", "/")

    existing_paths = {
        "/usr/bin/google-chrome",
        path_key(playwright_browser),
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
        lambda self: path_key(self) in existing_paths,
    )
    monkeypatch.setattr(
        local_backend_module.Path,
        "is_file",
        lambda self: path_key(self) in existing_paths,
    )

    assert (
        path_key(backend._find_available_browser_binary()) == "/usr/bin/google-chrome"
    )


@pytest.mark.asyncio
async def test_handle_install_browser_chromium_installs_when_missing(
    monkeypatch, tmp_path
):
    backend = LocalRuntimeService()
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
    backend = LocalRuntimeService()

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
    backend = LocalRuntimeService()
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
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_ENABLE_SEMANTIC_SUMMARIZER, "1")

    fake_store = DummyMemoryStoreInit()
    created_summarizers = []

    class _DummySummarizer(DummySummarizerInit):
        def __init__(self, memory_store):
            super().__init__(memory_store)
            created_summarizers.append(self)

    monkeypatch.setattr(
        local_backend_module, "LocalMemoryStore", lambda **_kwargs: fake_store
    )
    monkeypatch.setattr(local_backend_module, "MemorySummarizer", _DummySummarizer)

    backend = LocalRuntimeService()
    await backend.initialize()
    await backend._wait_for_memory_runtime_initialization()
    await backend.shutdown()

    assert fake_store.initialized is True
    assert len(created_summarizers) == 1
    assert created_summarizers[0].started is True
    assert backend._summarizer is created_summarizers[0]


@pytest.mark.asyncio
async def test_initialize_skips_memory_summarizer_when_disabled(monkeypatch):
    monkeypatch.setenv(local_backend_module.ENV_WINDIE_ENABLE_SEMANTIC_SUMMARIZER, "0")

    fake_store = DummyMemoryStoreInit()
    created = {"count": 0}

    class _DummySummarizer:
        def __init__(self, *_args, **_kwargs):
            created["count"] += 1

    monkeypatch.setattr(
        local_backend_module, "LocalMemoryStore", lambda **_kwargs: fake_store
    )
    monkeypatch.setattr(local_backend_module, "MemorySummarizer", _DummySummarizer)

    backend = LocalRuntimeService()
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
        def __init__(self, **_kwargs):
            super().__init__()
            self.initialized = False

        async def initialize(self):
            started.set()
            await release.wait()
            self.initialized = True

    monkeypatch.setattr(local_backend_module, "LocalMemoryStore", _SlowMemoryStore)
    monkeypatch.setattr(local_backend_module, "MemorySummarizer", None)

    backend = LocalRuntimeService()
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
    backend = LocalRuntimeService()

    async def fake_state(fields=None):
        return {"active_window": "App"}

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", fake_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result == {"success": True, "data": {"active_window": "App"}}


@pytest.mark.asyncio
async def test_handle_get_system_state_error(monkeypatch):
    backend = LocalRuntimeService()

    async def raise_state(fields=None):
        raise RuntimeError("nope")

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", raise_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result["success"] is False
    assert result["error"] == "nope"


@pytest.mark.asyncio
async def test_handle_get_system_state_system_exit_error(monkeypatch):
    backend = LocalRuntimeService()

    async def raise_state(fields=None):
        raise SystemExit("tkinter missing")

    from core import system_state as system_state_module

    monkeypatch.setattr(system_state_module, "get_system_state", raise_state)

    result = await backend._handle_get_system_state(fields=["active_window"])
    assert result["success"] is False
    assert result["error"] == "tkinter missing"


def test_initialize_methods_keeps_memory_handlers_registered():
    backend = LocalRuntimeService()

    expected_methods = {
        "search_memory_by_embedding",
        "store_memory_by_embedding",
        "list_episodic_memories",
        "list_semantic_memories",
        "delete_episodic_memory",
        "delete_semantic_memory",
        "clear_local_memory",
        "clear_chat_history",
        "conversation.append_event",
        "conversation.list",
        "conversation.search",
        "conversation.load_events",
        "conversation.get_revision",
        "conversation.revisions.list",
        "conversation.delete",
        "conversation.display.replace",
        "conversation.display.load",
        "conversation.model_history.replace",
        "conversation.model_history.load",
        "update_conversation_title",
        "get_conversation_title_state",
    }
    assert expected_methods.issubset(set(backend.protocol.methods.keys()))
    assert RETIRED_DIRECT_CHAT_METHODS.isdisjoint(set(backend.protocol.methods.keys()))


@pytest.mark.asyncio
async def test_handle_conversation_list_returns_sanitized_diagnostics(tmp_path):
    backend = LocalRuntimeService()
    memory_store = DummyMemoryStore()
    canonical_db = tmp_path / "history" / "history.db"
    canonical_db.parent.mkdir(parents=True)
    canonical_db.write_text("")
    memory_store.history_db_path = str(canonical_db)
    backend.memory_store = memory_store

    result = await backend._handle_conversation_list(
        user_id="user-1",
        limit=5,
        diagnostics={"trace_id": "diag-1", "request_id": "req-1"},
    )

    assert result["success"] is True
    assert result["data"]["count"] == 1
    assert memory_store.list_chat_conversation_calls == [("user-1", 5)]
    events = result["data"]["diagnostics"]["events"]
    assert [event["stage"] for event in events] == [
        "history_db_checked",
        "store_list",
    ]
    assert [event["runtime"] for event in events] == [
        "local-runtime",
        "local-runtime",
    ]
    assert events[0]["data"] == {
        "canonicalHistoryDbExists": True,
    }
    assert events[1]["data"] == {
        "canonicalHistoryDbExists": True,
        "limit": 5,
        "resultCount": 1,
    }
    assert "history.db" not in str(events)


@pytest.mark.asyncio
async def test_handle_search_memory_by_embedding_applies_filters():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStoreCapturing(
        [{"type": "semantic", "text": "fact"}]
    )

    result = await backend._handle_search_memory_by_embedding(
        embedding=[0.1, 0.2, 0.3],
        user_id="user-1",
        limit=3,
        memory_type="semantic",
        embedding_space_version="v1",
    )

    assert result["success"] is True
    assert result["data"]["memories"]["semantic"] == ["fact"]
    trace = result["data"]["trace"]
    assert trace.pop("durationMs") >= 0
    assert trace == {
        "runtime": "local-runtime",
        "method": "search_memory_by_embedding",
        "searchedMemoryTypes": ["semantic"],
        "embeddingDimension": 3,
        "embeddingSpaceVersion": "v1",
        "combinedLimit": 3,
        "episodicLimit": None,
        "semanticLimit": None,
        "semanticMinScore": None,
        "excludeConversationId": None,
        "episodicResultCount": 0,
        "semanticResultCount": 1,
    }
    assert backend.memory_store.search_by_embedding_calls == [
        ([0.1, 0.2, 0.3], "user-1", {"type": "semantic"}, 3, "v1")
    ]


@pytest.mark.asyncio
async def test_handle_search_memory_by_embedding_rejects_missing_embedding():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStoreCapturing([])

    result = await backend._handle_search_memory_by_embedding(
        embedding=[],
        user_id="user-1",
    )

    assert result["success"] is False
    assert result["error"] == "embedding must be a non-empty list"
    assert backend.memory_store.search_by_embedding_calls == []


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_success_notifies_summarizer():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="episodic",
        user_id="user-1",
        conversation_id="session-1",
    )
    assert result["success"] is True
    _, _, _, conversation_id, kwargs = backend.memory_store.added[-1]
    assert conversation_id == "session-1"
    assert kwargs["record_kind"] == "interaction"
    assert kwargs["embedding"] == [0.1, 0.2]
    assert kwargs["embedding_space_version"] == "space-1"
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == ["user-1"]


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_semantic_does_not_notify():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizer()

    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="semantic",
        user_id="user-1",
        conversation_id="session-1",
    )
    assert result["success"] is True
    _, _, _, conversation_id, kwargs = backend.memory_store.added[-1]
    assert conversation_id == "session-1"
    assert kwargs["record_kind"] == "interaction"
    assert backend.memory_store.pending_count == 0
    assert backend._summarizer.notified == []


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_notify_failure_still_succeeds():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    backend._summarizer = DummySummarizerRaises()

    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="episodic",
        user_id="user-1",
    )
    assert result["success"] is True
    assert backend.memory_store.pending_count == 0


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_add_failure():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStoreRaises(RuntimeError("fail"))

    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="episodic",
    )
    assert result["success"] is False
    assert result["error"] == "fail"


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_fails_without_store():
    backend = LocalRuntimeService()
    backend.memory_store = None
    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
    )
    assert result["success"] is False
    assert result["error"] == "Memory store not initialized"


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_requires_content():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory_by_embedding(
        content="",
        embedding=[0.1, 0.2],
    )

    assert result["success"] is False
    assert result["error"] == "Missing content"
    assert backend.memory_store.added == []
    assert backend.memory_store.pending_count == 0


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_treats_none_content_as_missing():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory_by_embedding(
        content=None,  # type: ignore[arg-type]
        embedding=[0.1, 0.2],
    )

    assert result["success"] is False
    assert result["error"] == "Missing content"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_rejects_whitespace_only_content():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory_by_embedding(
        content="   ",
        embedding=[0.1, 0.2],
    )

    assert result["success"] is False
    assert result["error"] == "Missing content"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_rejects_invalid_memory_type():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        memory_type="archive",
    )

    assert result["success"] is False
    assert result["error"] == "Invalid memory_type: archive"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_rejects_non_string_content():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory_by_embedding(
        content=123,  # type: ignore[arg-type]
        embedding=[0.1, 0.2],
    )

    assert result["success"] is False
    assert result["error"] == "content must be a string"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_rejects_non_string_memory_type():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_store_memory_by_embedding(
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        memory_type=7,  # type: ignore[arg-type]
    )

    assert result["success"] is False
    assert result["error"] == "memory_type must be a string"
    assert backend.memory_store.added == []


@pytest.mark.asyncio
async def test_handle_delete_episodic_memory_routes_to_store():
    backend = LocalRuntimeService()
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
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_delete_episodic_memory(
        user_id="user-1",
        memory_id=None,
    )

    assert result["success"] is False
    assert result["error"] == "memory_id is required"


@pytest.mark.asyncio
async def test_handle_clear_local_memory_routes_to_store():
    backend = LocalRuntimeService()
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
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    backend.memory_store.clear_chat_history_return = {
        "deleted_count": 8,
        "deleted_revision_count": 2,
        "deleted_title_count": 3,
    }

    result = await backend._handle_clear_chat_history(user_id="user-1")

    assert result == {
        "success": True,
        "data": {
            "deleted_count": 8,
            "deleted_revision_count": 2,
            "deleted_title_count": 3,
        },
    }
    assert backend.memory_store.cleared_chat_history_calls == ["user-1"]


@pytest.mark.asyncio
async def test_handle_conversation_append_event_writes_dedicated_chat_storage():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_append_event(
        user_id="user-1",
        conversation_id="conv-chat",
        event_type="user_message",
        role="user",
        content="hello",
        timestamp="2026-05-17T12:00:00+00:00",
        revision_id="rev-1",
        event_payload={
            "eventId": "evt-1",
            "type": "user_message",
            "conversationRef": "conv-chat",
            "revisionId": "rev-1",
            "timestamp": "2026-05-17T12:00:00+00:00",
            "source": "ui",
            "payload": {"text": "hello"},
        },
        attachments=[
            {
                "kind": "image",
                "ref": "artifact-user-1",
                "contentType": "image/png",
            }
        ],
    )

    assert result == {
        "success": True,
        "data": {
            "event_id": "evt-1",
            "message_index": 1,
            "record_kind": "chat_event",
        },
    }
    assert backend.memory_store.chat_event_calls[-1]["conversation_id"] == "conv-chat"
    assert backend.memory_store.chat_event_calls[-1]["event_type"] == "user_message"
    assert backend.memory_store.chat_event_calls[-1]["attachments"] == [
        {
            "kind": "image",
            "ref": "artifact-user-1",
            "contentType": "image/png",
        }
    ]


@pytest.mark.asyncio
async def test_handle_conversation_get_revision_returns_store_revision():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_get_revision(
        user_id="user-1",
        conversation_id="conv-chat",
    )

    assert result == {
        "success": True,
        "data": {
            "conversation_id": "conv-chat",
            "revision_id": "rev-next",
            "updated_at": "2026-05-17T12:00:00+00:00",
            "record_kind": "chat_event",
        },
    }


@pytest.mark.asyncio
async def test_handle_conversation_revisions_list_returns_store_revisions():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_revisions_list(
        user_id="user-1",
        conversation_id="conv-chat",
        limit=25,
    )

    assert result == {
        "success": True,
        "data": {
            "conversation_id": "conv-chat",
            "revisions": [
                {
                    "conversation_id": "conv-chat",
                    "revision_id": "rev-next",
                    "updated_at": "2026-05-17T12:00:00+00:00",
                    "active": True,
                    "record_kind": "chat_event",
                }
            ],
        },
    }
    assert backend.memory_store.list_conversation_revisions_calls == [
        ("user-1", "conv-chat", 25)
    ]


@pytest.mark.asyncio
async def test_handle_conversation_display_replace_routes_to_store():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_display_replace(
        user_id="user-1",
        conversation_id="conv-chat",
        revision_id="rev-display",
        created_at="2026-06-22T12:00:00+00:00",
        reason="user_edit",
        base_revision_id="rev-base",
        rows=[
            {
                "id": "display-row-1",
                "role": "user",
                "type": "user_message",
                "content": "edited",
            }
        ],
    )

    assert result == {
        "success": True,
        "data": {
            "revision_id": "rev-display",
            "row_count": 1,
            "created_at": "2026-06-22T12:00:00+00:00",
        },
    }
    assert backend.memory_store.replaced_display_timeline_calls == [
        (
            "user-1",
            "conv-chat",
            "rev-display",
            [
                {
                    "id": "display-row-1",
                    "role": "user",
                    "type": "user_message",
                    "content": "edited",
                }
            ],
            "2026-06-22T12:00:00+00:00",
            "user_edit",
            "rev-base",
        )
    ]


@pytest.mark.asyncio
async def test_handle_conversation_display_load_returns_timeline():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_display_load(
        user_id="user-1",
        conversation_id="conv-chat",
        revision_id="rev-display",
    )

    assert result == {
        "success": True,
        "data": {
            "conversation_id": "conv-chat",
            "revision_id": "rev-display",
            "created_at": "2026-06-22T12:00:00+00:00",
            "rows": [
                {
                    "id": "display-row-1",
                    "role": "user",
                    "type": "user_message",
                    "content": "hello",
                }
            ],
        },
    }
    assert backend.memory_store.loaded_display_timeline_calls == [
        ("user-1", "conv-chat", "rev-display")
    ]


@pytest.mark.asyncio
async def test_handle_conversation_model_history_replace_routes_to_store():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_model_history_replace(
        user_id="user-1",
        conversation_id="conv-chat",
        revision_id="rev-1",
        checkpoint_id="mh-1",
        created_at="2026-06-22T12:00:00+00:00",
        rows=[
            {
                "id": "row-1",
                "role": "user",
                "message_type": "user_query",
                "content": "hello",
            }
        ],
    )

    assert result == {
        "success": True,
        "data": {
            "checkpoint_id": "mh-1",
            "revision_id": "rev-1",
            "row_count": 1,
            "created_at": "2026-06-22T12:00:00+00:00",
        },
    }
    assert backend.memory_store.replaced_model_history_calls == [
        (
            "user-1",
            "conv-chat",
            "rev-1",
            "mh-1",
            [
                {
                    "id": "row-1",
                    "role": "user",
                    "message_type": "user_query",
                    "content": "hello",
                }
            ],
            "2026-06-22T12:00:00+00:00",
        )
    ]


@pytest.mark.asyncio
async def test_handle_conversation_model_history_load_returns_checkpoint():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_model_history_load(
        user_id="user-1",
        conversation_id="conv-chat",
        revision_id="rev-1",
    )

    assert result == {
        "success": True,
        "data": {
            "checkpoint_id": "mh-1",
            "conversation_id": "conv-chat",
            "revision_id": "rev-1",
            "created_at": "2026-06-22T12:00:00+00:00",
            "rows": [
                {
                    "id": "row-1",
                    "role": "user",
                    "message_type": "user_query",
                    "content": "hello",
                }
            ],
        },
    }
    assert backend.memory_store.loaded_model_history_calls == [
        ("user-1", "conv-chat", "rev-1")
    ]


@pytest.mark.asyncio
async def test_handle_update_conversation_title_persists_and_emits(monkeypatch):
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    backend.memory_store.history_db_path = "/tmp/test-title-history.sqlite3"
    emitted = []
    calls = []

    async def fake_upsert_generated_conversation_title(**kwargs):
        calls.append(kwargs)

    async def fake_event_sink(payload):
        emitted.append(payload)

    monkeypatch.setattr(
        "local_backend_memory_handlers.upsert_generated_conversation_title",
        fake_upsert_generated_conversation_title,
    )
    backend.set_event_sink(fake_event_sink)

    result = await backend._handle_update_conversation_title(
        user_id="user-1",
        conversation_id="conv-title",
        title="  New Title  ",
    )

    assert result == {
        "success": True,
        "data": {
            "conversation_id": "conv-title",
            "title": "New Title",
        },
    }
    assert calls == [
        {
            "db_path": "/tmp/test-title-history.sqlite3",
            "user_id": "user-1",
            "conversation_id": "conv-title",
            "title": "New Title",
        }
    ]
    assert emitted == [
        {
            "type": "conversation-title-updated",
            "payload": {
                "user_id": "user-1",
                "conversation_id": "conv-title",
                "title": "New Title",
            },
        }
    ]


@pytest.mark.asyncio
async def test_handle_get_conversation_title_state_returns_store_state(monkeypatch):
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    backend.memory_store.history_db_path = "/tmp/test-title-history.sqlite3"
    calls = []

    async def fake_get_conversation_title_state(**kwargs):
        calls.append(kwargs)
        return {
            "title": "Existing Title",
            "source": "model",
            "is_locked": True,
        }

    monkeypatch.setattr(
        "local_backend_memory_handlers.get_conversation_title_state",
        fake_get_conversation_title_state,
    )

    result = await backend._handle_get_conversation_title_state(
        user_id="user-1",
        conversation_id="conv-title",
    )

    assert result == {
        "success": True,
        "data": {
            "conversation_id": "conv-title",
            "title": "Existing Title",
            "source": "model",
            "is_locked": True,
            "has_title": True,
        },
    }
    assert calls == [
        {
            "db_path": "/tmp/test-title-history.sqlite3",
            "user_id": "user-1",
            "conversation_id": "conv-title",
        }
    ]


@pytest.mark.asyncio
async def test_handle_conversation_load_events_reads_dedicated_chat_storage():
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()

    result = await backend._handle_conversation_load_events(
        user_id="user-1",
        conversation_id="conv-chat",
        limit=25,
        after_message_index=2,
    )

    assert result["success"] is True
    assert result["data"]["events"] == [{"id": "evt-1", "conversation_id": "conv-chat"}]


@pytest.mark.asyncio
async def test_handle_store_memory_by_embedding_logs_surrogate_field_paths(caplog):
    backend = LocalRuntimeService()
    backend.memory_store = DummyMemoryStore()
    caplog.set_level(logging.WARNING, logger="local_backend_memory_handlers")

    result = await backend._handle_store_memory_by_embedding(
        content="bad\udc9dquery",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="episodic",
        user_id="user-1",
        conversation_id="conv-1",
    )

    assert result["success"] is True
    assert "store_memory_by_embedding.content" in caplog.text
