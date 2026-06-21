"""Covers local-runtime daemon lifecycle behavior."""

import asyncio
import json
import sqlite3
import tempfile
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import sidecar_daemon  # noqa: E402
from sidecar_daemon import (  # noqa: E402
    LOCAL_RUNTIME_DIAGNOSTICS_RUNTIME,
    McpServerSpec,
    McpStdioClient,
    LocalRuntimeDaemon,
    build_mcp_execution_context,
    resolve_mcp_command_for_spawn,
    write_discovery_file,
)


def test_local_runtime_daemon_identity_copy_is_product_neutral():
    source = Path(sidecar_daemon.__file__).read_text(encoding="utf-8")
    retired_local_sidecar_prefix = "[Local" + "Sidecar]"
    retired_product_name = "Windie" "OS"

    assert "Desktop Runtime local runtime" in source
    assert "Desktop Runtime sidecar" not in source
    assert "Python local-runtime daemon HTTP/WebSocket runtime." in source
    assert "Run the Python local-runtime daemon." in source
    assert (
        'emit_local_runtime_layer_log("[LocalRuntime]", "status requested")'
        in source
    )
    assert '"[LocalRuntimeDaemon] listening' in source
    assert '"[LocalRuntimeDaemon] stopping' in source
    assert "resolve_app_user_data_root(" in source
    assert 'Path.home() / "Library" / "Application Support" / "windieos"' not in source
    assert f"{retired_product_name} sidecar" not in source
    assert "Run the Python sidecar daemon." not in source
    assert f"Run the {retired_product_name} sidecar daemon." not in source
    assert "WINDIE_SIDECAR_SOURCE_PATH" not in source
    assert "WINDIE_SIDECAR_SOURCE_STAMP" not in source
    assert "self.backend" not in source
    assert "daemon.backend" not in source
    assert (
        f'emit_sidecar_layer_log("{retired_local_sidecar_prefix}", "status requested")'
        not in source
    )
    assert "emit_sidecar_layer_log(" not in source
    assert (
        f'emit_sidecar_layer_log("[Local{"Backend"}]", "status requested")'
        not in source
    )
    assert '"[SidecarDaemon] listening' not in source
    assert '"[SidecarDaemon] stopping' not in source
    assert "class SidecarDaemon" not in source


def test_local_runtime_daemon_default_discovery_path_is_generic():
    assert sidecar_daemon.DEFAULT_DISCOVERY_FILE == (
        Path(tempfile.gettempdir()) / "desktop-runtime" / "local-runtime-daemon.json"
    )


def test_local_runtime_daemon_user_data_root_prefers_generic_env(tmp_path: Path, monkeypatch):
    generic_root = tmp_path / "generic"
    windie_root = tmp_path / "windie"
    monkeypatch.setenv(sidecar_daemon.ENV_AGENT_USER_DATA_DIR, str(generic_root))
    monkeypatch.setenv(sidecar_daemon.ENV_WINDIE_USER_DATA_DIR, str(windie_root))

    assert sidecar_daemon.app_user_data_root() == generic_root


def test_local_runtime_daemon_user_data_root_preserves_windie_env_alias(
    tmp_path: Path, monkeypatch
):
    windie_root = tmp_path / "windie"
    monkeypatch.delenv(sidecar_daemon.ENV_AGENT_USER_DATA_DIR, raising=False)
    monkeypatch.setenv(sidecar_daemon.ENV_WINDIE_USER_DATA_DIR, str(windie_root))

    assert sidecar_daemon.app_user_data_root() == windie_root


def test_local_runtime_daemon_test_platform_prefers_generic_env(monkeypatch, tmp_path):
    captured = {}

    def fake_user_data_root(**kwargs):
        captured.update(kwargs)
        return tmp_path / "root"

    monkeypatch.delenv(sidecar_daemon.ENV_AGENT_USER_DATA_DIR, raising=False)
    monkeypatch.delenv(sidecar_daemon.ENV_WINDIE_USER_DATA_DIR, raising=False)
    monkeypatch.setenv(sidecar_daemon.ENV_AGENT_TEST_PLATFORM, "linux")
    monkeypatch.setenv(sidecar_daemon.ENV_WINDIE_TEST_PLATFORM, "win32")
    monkeypatch.setattr(
        sidecar_daemon, "resolve_app_user_data_root", fake_user_data_root
    )

    assert sidecar_daemon.app_user_data_root() == tmp_path / "root"
    assert captured["platform_name"] == "linux"


def test_local_runtime_daemon_test_platform_preserves_windie_env_alias(monkeypatch, tmp_path):
    captured = {}

    def fake_user_data_root(**kwargs):
        captured.update(kwargs)
        return tmp_path / "root"

    monkeypatch.delenv(sidecar_daemon.ENV_AGENT_USER_DATA_DIR, raising=False)
    monkeypatch.delenv(sidecar_daemon.ENV_WINDIE_USER_DATA_DIR, raising=False)
    monkeypatch.delenv(sidecar_daemon.ENV_AGENT_TEST_PLATFORM, raising=False)
    monkeypatch.setenv(sidecar_daemon.ENV_WINDIE_TEST_PLATFORM, "win32")
    monkeypatch.setattr(
        sidecar_daemon, "resolve_app_user_data_root", fake_user_data_root
    )

    assert sidecar_daemon.app_user_data_root() == tmp_path / "root"
    assert captured["platform_name"] == "win32"


def test_local_runtime_daemon_diagnostics_path_prefers_generic_env(
    tmp_path: Path, monkeypatch
):
    generic_db = tmp_path / "generic.db"
    windie_db = tmp_path / "windie.db"
    monkeypatch.setenv(sidecar_daemon.ENV_AGENT_APP_DIAGNOSTICS_DB, str(generic_db))
    monkeypatch.setenv(sidecar_daemon.ENV_WINDIE_APP_DIAGNOSTICS_DB, str(windie_db))

    assert sidecar_daemon.diagnostics_database_path() == generic_db


def test_local_runtime_daemon_diagnostics_path_preserves_windie_env_alias(
    tmp_path: Path, monkeypatch
):
    windie_db = tmp_path / "windie.db"
    monkeypatch.setenv(sidecar_daemon.ENV_WINDIE_APP_DIAGNOSTICS_DB, str(windie_db))

    assert sidecar_daemon.diagnostics_database_path() == windie_db


class FakeRequest:
    def __init__(self, payload=None, headers=None):
        self._payload = payload or {}
        self.headers = headers or {}

    async def json(self):
        return self._payload


class FakeEventSocket:
    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)


class FakeMcpClient:
    def __init__(self):
        self.stderr_tail = []

    async def list_tools(self):
        return [
            {
                "name": "remember",
                "description": "Remember a value.",
                "inputSchema": {
                    "type": "object",
                    "properties": {"value": {"type": "string"}},
                    "required": ["value"],
                    "additionalProperties": False,
                },
            }
        ]

    async def call_tool(self, name, args):
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"{name}:{args['value']}",
                }
            ]
        }

    async def close(self):
        return None


class FakeImageMcpClient(FakeMcpClient):
    async def call_tool(self, name, args):
        return {
            "content": [
                {
                    "type": "image",
                    "data": "png-base64",
                    "mimeType": "image/png",
                }
            ]
        }


class FakeStructuredMcpClient(FakeMcpClient):
    async def call_tool(self, name, args):
        return {
            "content": [{"type": "text", "text": "Found 1 window(s)."}],
            "structuredContent": {
                "windows": [{"window_id": 1045, "title": "Project Alpha Notes"}]
            },
        }


class FakeLocalRuntimeWithEventSink:
    def __init__(self):
        self.event_sink = None

    def set_event_sink(self, event_sink):
        self.event_sink = event_sink

    async def shutdown(self):
        return None


class FakeLocalRuntimeWithShutdown:
    def __init__(self):
        self.shutdown_calls = 0

    async def shutdown(self):
        self.shutdown_calls += 1


class FakeLocalRuntimeWithExecuteTool:
    def __init__(self, result=None):
        self.calls = []
        self.result = result or {"success": True, "data": {"output": "ok"}}

    async def _handle_execute_tool(self, tool_name, args):
        self.calls.append((tool_name, args))
        return self.result


class FakeBrokenStdout:
    async def readline(self):
        raise ValueError("Separator is not found, and chunk exceed the limit")


class FakeMcpProcessWithBrokenStdout:
    stdout = FakeBrokenStdout()


def test_resolve_mcp_command_uses_cua_driver_app_fallback(tmp_path: Path, monkeypatch):
    binary = tmp_path / "cua-driver"
    binary.write_text("#!/bin/sh\n", encoding="utf-8")
    binary.chmod(0o755)
    monkeypatch.setattr(sidecar_daemon.shutil, "which", lambda _command: None)
    monkeypatch.setattr(
        sidecar_daemon,
        "CUA_DRIVER_MACOS_COMMAND_CANDIDATES",
        (binary,),
    )

    assert resolve_mcp_command_for_spawn("cua-driver") == str(binary)


def test_mcp_server_spec_uses_canonical_snake_case_fields():
    spec = McpServerSpec.from_payload(
        {
            "id": "notes",
            "name": "Notes",
            "command": "fake-mcp-server",
            "timeout_ms": 9000,
            "tool_prefix": "local_notes",
            "mcp_id": "mcp-notes",
            "extension_id": "extension-notes",
        }
    )

    assert spec.id == "notes"
    assert spec.name == "Notes"
    assert spec.timeout_ms == 9000
    assert spec.tool_prefix == "local_notes"
    assert spec.mcp_id == "mcp-notes"
    assert spec.extension_id == "extension-notes"


def test_mcp_server_spec_rejects_name_only_identifier_and_camel_aliases():
    with pytest.raises(ValueError, match="MCP server id is required"):
        McpServerSpec.from_payload({"name": "notes", "command": "fake-mcp-server"})

    with pytest.raises(
        ValueError,
        match="MCP server spec does not support removed field\\(s\\): extensionId, mcpId, timeoutMs, toolPrefix",
    ):
        McpServerSpec.from_payload(
            {
                "id": "notes",
                "command": "fake-mcp-server",
                "timeoutMs": 9000,
                "toolPrefix": "local_notes",
                "mcpId": "mcp-notes",
                "extensionId": "extension-notes",
            }
        )


def test_mcp_execution_context_uses_canonical_snake_case_metadata():
    context = build_mcp_execution_context(
        {
            "request_id": "req-1",
            "tool_call_id": "call-1",
            "correlation_id": "corr-1",
            "bundle_id": "bundle-1",
            "turn_ref": "turn-1",
            "conversation_ref": "conv-1",
        }
    )

    assert context["trace_id"].startswith("mcp-execution-")
    assert context["request_id"] == "req-1"
    assert context["conversation_ref"] == "conv-1"
    assert context["data"] == {
        "toolCallId": "call-1",
        "correlationId": "corr-1",
        "bundleId": "bundle-1",
        "turnRef": "turn-1",
    }


def test_mcp_execution_context_rejects_camel_case_metadata_aliases():
    with pytest.raises(
        ValueError,
        match="MCP execution metadata does not support removed field\\(s\\): bundleId, conversationRef, correlationId, requestId, toolCallId, turnRef",
    ):
        build_mcp_execution_context(
            {
                "requestId": "req-1",
                "toolCallId": "call-1",
                "correlationId": "corr-1",
                "bundleId": "bundle-1",
                "turnRef": "turn-1",
                "conversationRef": "conv-1",
            }
        )


@pytest.mark.asyncio
async def test_mcp_stdout_reader_failure_fails_pending_request(
    tmp_path: Path, monkeypatch
):
    diagnostics_db = tmp_path / "diagnostics.db"
    monkeypatch.setenv("WINDIE_APP_DIAGNOSTICS_DB", str(diagnostics_db))
    client = McpStdioClient(McpServerSpec(id="large", command="fake-mcp-server"))
    client.proc = FakeMcpProcessWithBrokenStdout()
    future = asyncio.get_running_loop().create_future()
    client.pending[1] = future

    await client._read_stdout()

    assert client.pending == {}
    with pytest.raises(RuntimeError, match="MCP stdout reader failed for large"):
        await future
    with sqlite3.connect(diagnostics_db) as conn:
        rows = conn.execute(
            """
            SELECT path, stage, status, data, error
            FROM diagnostic_events
            WHERE stage = 'stdout_reader_failed'
            """
        ).fetchall()
    assert len(rows) == 1
    path, stage, status, data, error = rows[0]
    assert path == "mcp.discovery"
    assert stage == "stdout_reader_failed"
    assert status == "failed"
    assert json.loads(data)["phase"] == "stdio_read"
    assert json.loads(error)["code"] == "runtime_error"


@pytest.mark.asyncio
async def test_local_runtime_daemon_rejects_missing_or_invalid_token():
    daemon = LocalRuntimeDaemon(token="test-token")
    missing = await daemon._auth_middleware(FakeRequest(), daemon.handle_health)
    invalid = await daemon._auth_middleware(
        FakeRequest(headers={"x-agent-local-runtime-token": "bad"}),
        daemon.handle_health,
    )
    valid = await daemon._auth_middleware(
        FakeRequest(headers={"x-agent-local-runtime-token": "test-token"}),
        daemon.handle_health,
    )
    bearer_valid = await daemon._auth_middleware(
        FakeRequest(headers={"authorization": "Bearer test-token"}),
        daemon.handle_health,
    )
    retired_header_name = "x-" + "windie-sidecar-token"
    retired_header = await daemon._auth_middleware(
        FakeRequest(headers={retired_header_name: "test-token"}),
        daemon.handle_health,
    )

    assert missing.status == 401
    assert invalid.status == 401
    assert valid.status == 200
    assert bearer_valid.status == 200
    assert retired_header.status == 401


@pytest.mark.asyncio
async def test_local_runtime_daemon_health_endpoint_reports_generic_service():
    daemon = LocalRuntimeDaemon(token="test-token")

    response = await daemon.handle_health(FakeRequest())
    payload = json.loads(response.text)

    assert response.status == 200
    assert payload["status"] == "ok"
    assert payload["service"] == "local_runtime_daemon"
    retired_service_name = "sidecar" "_daemon"
    legacy_service_name = "windie" "_sidecar_daemon"
    assert payload["service"] != retired_service_name
    assert payload["service"] != legacy_service_name
    assert payload["pid"] > 0


@pytest.mark.asyncio
async def test_local_runtime_daemon_status_endpoint_reports_runtime_boundary():
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["notes"] = FakeMcpClient()

    response = await daemon.handle_status(FakeRequest())
    payload = json.loads(response.text)

    assert response.status == 200
    assert payload["daemon"]["status"] == "ok"
    assert payload["daemon"]["pid"] > 0
    assert payload["daemon"]["mcp_servers"] == ["notes"]
    assert "read_file" in payload["registered_tools"]
    assert payload["tool_manifest"]["version"] == 1
    assert any(
        tool["name"] == "read_file" for tool in payload["tool_manifest"]["tools"]
    )


@pytest.mark.asyncio
async def test_local_runtime_daemon_discovery_file_records_launch_context(
    tmp_path: Path,
    monkeypatch,
):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://backend.example")
    monkeypatch.setenv("WINDIE_BACKEND_AUTH_STATE_PATH", "/tmp/auth.json")
    monkeypatch.setenv("WINDIE_ENABLE_SEMANTIC_SUMMARIZER", "0")

    discovery_path = tmp_path / "local-runtime-daemon.json"
    await write_discovery_file(
        discovery_path,
        host="127.0.0.1",
        port=4567,
        token="test-token",
    )
    payload = json.loads(discovery_path.read_text(encoding="utf-8"))

    assert payload["launch"] == {
        "AGENT_BACKEND_HTTP_URL": "",
        "AGENT_BACKEND_AUTH_STATE_PATH": "",
        "AGENT_ENABLE_SEMANTIC_SUMMARIZER": "",
        "AGENT_PACKAGED_APP": "",
        "AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL": "",
        "AGENT_LOCAL_RUNTIME_SOURCE_PATH": "",
        "AGENT_LOCAL_RUNTIME_SOURCE_STAMP": "",
        "AGENT_USER_DATA_DIR": "",
        "WINDIE_BACKEND_HTTP_URL": "https://backend.example",
        "WINDIE_BACKEND_AUTH_STATE_PATH": "/tmp/auth.json",
        "WINDIE_ENABLE_SEMANTIC_SUMMARIZER": "0",
        "WINDIE_PACKAGED_APP": "",
        "WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL": "",
        "WINDIE_LOCAL_RUNTIME_SOURCE_PATH": "",
        "WINDIE_LOCAL_RUNTIME_SOURCE_STAMP": "",
        "WINDIE_USER_DATA_DIR": "",
    }


@pytest.mark.asyncio
async def test_local_runtime_daemon_tools_endpoint_lists_builtin_and_dynamic_tools():
    daemon = LocalRuntimeDaemon(token="test-token")

    async def save_note(args):
        return {"success": True, "data": {"output": args["text"]}}

    daemon.local_runtime.tool_registry.register_runtime_tool(
        name="sdk_note",
        handler=save_note,
        schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
            "additionalProperties": False,
        },
        description="Save an SDK note.",
        source={"kind": "sdk-test"},
    )

    response = await daemon.handle_tools(FakeRequest())
    payload = json.loads(response.text)
    tools_by_name = {tool["name"]: tool for tool in payload["tools"]}

    assert response.status == 200
    assert payload["version"] == 1
    assert "read_file" in tools_by_name
    assert tools_by_name["sdk_note"]["description"] == "Save an SDK note."
    assert tools_by_name["sdk_note"]["source"] == {"kind": "sdk-test"}


@pytest.mark.asyncio
async def test_local_runtime_daemon_execute_tool_endpoint_normalizes_missing_tool_errors():
    daemon = LocalRuntimeDaemon(token="test-token")
    ws = FakeEventSocket()
    daemon.events.add(ws)

    response = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "missing_tool", "args": {"value": "hello"}})
    )
    payload = json.loads(response.text)

    assert response.status == 200
    assert payload == {
        "success": False,
        "data": {"output": "Tool not found: missing_tool"},
        "error": "Tool not found: missing_tool",
    }
    assert ws.sent == [
        {
            "type": "tool-executed",
            "payload": {"tool_name": "missing_tool", "success": False},
        }
    ]


@pytest.mark.asyncio
async def test_local_runtime_daemon_execute_tool_requires_canonical_tool_name():
    local_runtime = FakeLocalRuntimeWithExecuteTool()
    daemon = LocalRuntimeDaemon(local_runtime=local_runtime, token="test-token")

    response = await daemon.handle_execute_tool(
        FakeRequest({"toolName": "read_file", "args": {"file_path": "/tmp/a"}})
    )
    payload = json.loads(response.text)

    assert response.status == 400
    assert payload == {"success": False, "error": "tool_name is required"}
    assert local_runtime.calls == []


@pytest.mark.asyncio
async def test_local_runtime_daemon_execute_tool_rejects_mcp_metadata_aliases():
    local_runtime = FakeLocalRuntimeWithExecuteTool()
    daemon = LocalRuntimeDaemon(local_runtime=local_runtime, token="test-token")

    response = await daemon.handle_execute_tool(
        FakeRequest(
            {
                "tool_name": "read_file",
                "args": {"file_path": "/tmp/a"},
                "requestId": "req-1",
            }
        )
    )
    payload = json.loads(response.text)

    assert response.status == 400
    assert payload == {
        "success": False,
        "error": "MCP execution metadata does not support removed field(s): requestId",
    }
    assert local_runtime.calls == []


@pytest.mark.asyncio
async def test_local_runtime_daemon_execute_tool_log_labels_passive_browser_session_sync(
    capsys,
):
    local_runtime = FakeLocalRuntimeWithExecuteTool()
    daemon = LocalRuntimeDaemon(local_runtime=local_runtime, token="test-token")

    response = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "browser", "args": {"action": "status"}})
    )
    payload = json.loads(response.text)
    captured = capsys.readouterr()

    assert response.status == 200
    assert payload == {"success": True, "data": {"output": "ok"}}
    assert local_runtime.calls == [("browser", {"action": "status"})]
    assert "[BrowserSession] sync action=status success=True" in captured.err
    assert "[Tool] executed name=browser" not in captured.err


@pytest.mark.asyncio
async def test_local_runtime_daemon_execute_tool_log_includes_active_browser_action(capsys):
    local_runtime = FakeLocalRuntimeWithExecuteTool()
    daemon = LocalRuntimeDaemon(local_runtime=local_runtime, token="test-token")

    response = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "browser", "args": {"action": "click", "index": 4}})
    )
    payload = json.loads(response.text)
    captured = capsys.readouterr()

    assert response.status == 200
    assert payload == {"success": True, "data": {"output": "ok"}}
    assert local_runtime.calls == [("browser", {"action": "click", "index": 4})]
    assert "[Tool] executed name=browser action=click success=True" in captured.err


@pytest.mark.asyncio
async def test_local_runtime_daemon_binds_local_runtime_event_sink_to_event_socket():
    local_runtime = FakeLocalRuntimeWithEventSink()
    daemon = LocalRuntimeDaemon(local_runtime=local_runtime, token="test-token")
    ws = FakeEventSocket()
    daemon.events.add(ws)

    await local_runtime.event_sink(
        {
            "type": "conversation-title-updated",
            "payload": {"conversation_id": "conv-1", "title": "Generated Title"},
        }
    )

    assert ws.sent == [
        {
            "type": "conversation-title-updated",
            "payload": {"conversation_id": "conv-1", "title": "Generated Title"},
        }
    ]


@pytest.mark.asyncio
async def test_local_runtime_daemon_rpc_endpoint_uses_local_runtime_protocol():
    daemon = LocalRuntimeDaemon(token="test-token")

    response = await daemon.handle_rpc(
        FakeRequest(
            {
                "jsonrpc": "2.0",
                "id": "rpc-1",
                "method": "ping",
                "params": {},
            }
        )
    )
    payload = json.loads(response.text)

    assert response.status == 200
    assert payload == {
        "jsonrpc": "2.0",
        "id": "rpc-1",
        "result": {"status": "ok", "service": "local_runtime"},
    }


@pytest.mark.asyncio
async def test_local_runtime_daemon_registers_module_tool_without_restart(
    tmp_path: Path,
    monkeypatch,
):
    package_dir = tmp_path / "my_project"
    package_dir.mkdir()
    (package_dir / "__init__.py").write_text("", encoding="utf-8")
    (package_dir / "tools.py").write_text(
        "\n".join(
            [
                "from tools.result import ToolResult",
                "",
                "def save_note(args):",
                "    return ToolResult.success_result({'output': 'saved:' + args['text']})",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    daemon = LocalRuntimeDaemon(token="test-token")
    registration = await daemon.handle_register_module(
        FakeRequest(
            {
                "name": "save_note",
                "module": "my_project.tools:save_note",
                "schema": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                    "additionalProperties": False,
                },
            }
        )
    )
    execution = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "save_note", "args": {"text": "hello"}})
    )

    assert registration.status == 200
    assert json.loads(execution.text) == {
        "success": True,
        "data": {"output": "saved:hello"},
    }


@pytest.mark.asyncio
async def test_local_runtime_daemon_registers_plugin_tools_without_restart(tmp_path: Path):
    plugin_dir = tmp_path / "note_plugin"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "id": "note-plugin",
                "tools": [
                    {
                        "name": "plugin_note",
                        "description": "Save a plugin note.",
                        "entrypoint": "tool.py:save",
                        "schema": {
                            "type": "object",
                            "properties": {"text": {"type": "string"}},
                            "required": ["text"],
                            "additionalProperties": False,
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    (plugin_dir / "tool.py").write_text(
        "\n".join(
            [
                "from tools.result import ToolResult",
                "",
                "def save(text: str):",
                "    return ToolResult.success_result({'output': 'plugin:' + text})",
            ]
        ),
        encoding="utf-8",
    )

    daemon = LocalRuntimeDaemon(token="test-token")
    registration = await daemon.handle_register_plugin(
        FakeRequest({"path": str(plugin_dir)})
    )
    execution = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "plugin_note", "args": {"text": "hello"}})
    )

    assert registration.status == 200
    registration_payload = json.loads(registration.text)
    assert registration_payload["success"] is True
    assert registration_payload["registered_tools"][0]["name"] == "plugin_note"
    assert json.loads(execution.text) == {
        "success": True,
        "data": {"output": "plugin:hello"},
    }


@pytest.mark.asyncio
async def test_local_runtime_daemon_registers_mcp_tools_without_restart():
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["notes"] = FakeMcpClient()

    registration = await daemon.handle_register_mcp(
        FakeRequest(
            {
                "id": "notes",
                "command": "fake-mcp-server",
                "tools": [
                    {
                        "name": "remember",
                        "description": "Remember a value.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"value": {"type": "string"}},
                            "required": ["value"],
                            "additionalProperties": False,
                        },
                    }
                ],
            }
        )
    )
    execution = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "mcp_notes__remember", "args": {"value": "hello"}})
    )

    assert registration.status == 200
    registration_payload = json.loads(registration.text)
    assert registration_payload["success"] is True
    assert registration_payload["registered_tools"][0]["name"] == "mcp_notes__remember"
    manifest = daemon.local_runtime.tool_registry.get_tool_manifest()
    mcp_tool = next(
        tool for tool in manifest["tools"] if tool["name"] == "mcp_notes__remember"
    )
    assert mcp_tool["execution_target"] == "local_runtime"
    assert mcp_tool["argument_resolution"] == "passthrough"
    assert mcp_tool["mcp_server_id"] == "notes"
    assert mcp_tool["mcp_tool_name"] == "remember"
    assert json.loads(execution.text) == {
        "success": True,
        "data": {
            "output": '{"content":[{"type":"text","text":"remember:hello"}]}',
            "mcp_result": {"content": [{"type": "text", "text": "remember:hello"}]},
        },
    }


@pytest.mark.asyncio
async def test_local_runtime_daemon_preserves_mcp_structured_content():
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["cua-driver"] = FakeStructuredMcpClient()

    registration = await daemon.handle_register_mcp(
        FakeRequest(
            {
                "id": "cua-driver",
                "command": "fake-mcp-server",
                "tools": [
                    {
                        "name": "list_windows",
                        "description": "List windows.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {},
                            "additionalProperties": False,
                        },
                    }
                ],
            }
        )
    )
    execution = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "mcp_cua-driver__list_windows", "args": {}})
    )

    assert registration.status == 200
    mcp_result = {
        "content": [{"type": "text", "text": "Found 1 window(s)."}],
        "structuredContent": {
            "windows": [{"window_id": 1045, "title": "Project Alpha Notes"}]
        },
    }
    assert json.loads(execution.text) == {
        "success": True,
        "data": {
            "output": json.dumps(mcp_result, separators=(",", ":")),
            "mcp_result": mcp_result,
        },
    }


@pytest.mark.asyncio
async def test_local_runtime_daemon_omits_promoted_mcp_image_bytes_from_output():
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["vision"] = FakeImageMcpClient()

    registration = await daemon.handle_register_mcp(
        FakeRequest(
            {
                "id": "vision",
                "command": "fake-mcp-server",
                "tools": [
                    {
                        "name": "capture",
                        "description": "Capture a window.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"value": {"type": "string"}},
                            "required": ["value"],
                            "additionalProperties": False,
                        },
                    }
                ],
            }
        )
    )
    execution = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "mcp_vision__capture", "args": {"value": "window"}})
    )

    assert registration.status == 200
    payload = json.loads(execution.text)
    assert payload == {
        "success": True,
        "data": {
            "output": '{"content":[{"type":"image","data":"[image data omitted; promoted to native screenshot field]","mimeType":"image/png"}]}',
            "screenshot": "png-base64",
            "screenshot_content_type": "image/png",
            "mcp_result": {
                "content": [
                    {"type": "image", "data": "png-base64", "mimeType": "image/png"}
                ]
            },
        },
    }
    assert "png-base64" not in payload["data"]["output"]


@pytest.mark.asyncio
async def test_local_runtime_daemon_records_mcp_execution_diagnostics(
    tmp_path: Path, monkeypatch
):
    diagnostics_db = tmp_path / "diagnostics.db"
    monkeypatch.setenv("WINDIE_APP_DIAGNOSTICS_DB", str(diagnostics_db))
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["notes"] = FakeMcpClient()

    registration = await daemon.handle_register_mcp(
        FakeRequest(
            {
                "id": "notes",
                "command": "fake-mcp-server",
                "tools": [
                    {
                        "name": "remember",
                        "description": "Remember a value.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"value": {"type": "string"}},
                            "required": ["value"],
                            "additionalProperties": False,
                        },
                    }
                ],
            }
        )
    )
    execution = await daemon.handle_execute_tool(
        FakeRequest(
            {
                "tool_name": "mcp_notes__remember",
                "args": {"value": "hello"},
                "request_id": "req-1",
                "tool_call_id": "call-1",
                "correlation_id": "corr-1",
                "bundle_id": "bundle-1",
                "conversation_ref": "conv-1",
                "turn_ref": "turn-1",
            }
        )
    )

    assert registration.status == 200
    assert json.loads(execution.text)["success"] is True
    with sqlite3.connect(diagnostics_db) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT path, stage, status, runtime, request_id, conversation_ref, data, error
            FROM diagnostic_events
            WHERE path = 'mcp.execution'
            ORDER BY rowid ASC
            """
        ).fetchall()

    assert [row["stage"] for row in rows] == [
        "tool_call_start",
        "tool_call_succeeded",
    ]
    assert {row["request_id"] for row in rows} == {"req-1"}
    assert {row["conversation_ref"] for row in rows} == {"conv-1"}
    assert {row["runtime"] for row in rows} == {LOCAL_RUNTIME_DIAGNOSTICS_RUNTIME}
    assert rows[-1]["status"] == "succeeded"
    assert rows[-1]["error"] is None
    data = json.loads(rows[-1]["data"])
    assert data["serverId"] == "notes"
    assert data["phase"] == "tools_call"
    assert data["exposedToolName"] == "mcp_notes__remember"
    assert data["mcpToolName"] == "remember"
    assert data["toolCallId"] == "call-1"
    assert data["correlationId"] == "corr-1"
    assert data["bundleId"] == "bundle-1"
    assert data["turnRef"] == "turn-1"
    serialized_data = json.dumps(data)
    assert "hello" not in serialized_data
    assert "remember:hello" not in serialized_data
    assert "args" not in data


@pytest.mark.asyncio
async def test_local_runtime_daemon_records_mcp_registration_diagnostics(
    tmp_path: Path, monkeypatch
):
    diagnostics_db = tmp_path / "diagnostics.db"
    monkeypatch.setenv("WINDIE_APP_DIAGNOSTICS_DB", str(diagnostics_db))
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["notes"] = FakeMcpClient()

    registration = await daemon.handle_register_mcp(
        FakeRequest(
            {
                "replace": True,
                "servers": [{"id": "notes", "command": "fake-mcp-server"}],
            }
        )
    )

    assert registration.status == 200
    assert json.loads(registration.text)["success"] is True
    with sqlite3.connect(diagnostics_db) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT path, stage, status, runtime, data, error
            FROM diagnostic_events
            WHERE path = 'mcp.registration'
            ORDER BY rowid ASC
            """
        ).fetchall()

    assert [row["stage"] for row in rows] == [
        "registration_requested",
        "reconcile_start",
        "reconcile_succeeded",
        "registration_completed",
    ]
    assert {row["runtime"] for row in rows} == {LOCAL_RUNTIME_DIAGNOSTICS_RUNTIME}
    assert rows[-1]["status"] == "succeeded"
    assert rows[-1]["error"] is None
    data = json.loads(rows[-1]["data"])
    assert data["phase"] == "registration"
    assert data["replace"] is True
    assert data["requestedServerCount"] == 1
    assert data["registeredServerCount"] == 1
    assert data["registeredToolCount"] == 1
    assert data["statusCount"] == 1
    assert data["errorCount"] == 0
    assert data["mcpServerCount"] == 1
    assert data["mcpToolCount"] == 1
    serialized_data = json.dumps(data)
    assert "fake-mcp-server" not in serialized_data


@pytest.mark.asyncio
async def test_local_runtime_daemon_reconciles_removed_mcp_tools():
    daemon = LocalRuntimeDaemon(token="test-token")
    daemon.mcp_clients["notes"] = FakeMcpClient()

    first = await daemon.handle_register_mcp(
        FakeRequest(
            {
                "replace": True,
                "servers": [{"id": "notes", "command": "fake-mcp-server"}],
            }
        )
    )
    assert first.status == 200
    assert daemon.local_runtime.tool_registry.has_tool("mcp_notes__remember")

    second = await daemon.handle_register_mcp(
        FakeRequest({"replace": True, "servers": []})
    )
    payload = json.loads(second.text)

    assert second.status == 200
    assert payload["success"] is True
    assert payload["registered_tools"] == []
    assert not daemon.local_runtime.tool_registry.has_tool("mcp_notes__remember")
    assert "notes" not in daemon.mcp_clients


@pytest.mark.asyncio
async def test_local_runtime_daemon_events_channel_handles_control_messages():
    daemon = LocalRuntimeDaemon(token="test-token")
    ws = FakeEventSocket()

    await daemon.handle_event_control_message(ws, '{"id":"1","type":"ping"}')
    await daemon.handle_event_control_message(ws, '{"id":"2","type":"status"}')
    await daemon.handle_event_control_message(ws, '{"id":"3","type":"tools/list"}')
    await daemon.handle_event_control_message(ws, '{"id":"4","type":"unknown"}')
    await daemon.handle_event_control_message(ws, "{bad-json")

    assert ws.sent[0]["type"] == "pong"
    assert ws.sent[0]["id"] == "1"
    assert isinstance(ws.sent[0]["payload"]["pid"], int)
    assert ws.sent[1]["type"] == "status"
    assert ws.sent[1]["id"] == "2"
    assert ws.sent[1]["payload"]["daemon"]["status"] == "ok"
    assert ws.sent[2]["type"] == "tools"
    assert ws.sent[2]["id"] == "3"
    assert ws.sent[3] == {
        "type": "error",
        "error": "unknown_command",
        "command": "unknown",
        "id": "4",
    }
    assert ws.sent[4] == {"type": "error", "error": "invalid_json"}


@pytest.mark.asyncio
async def test_local_runtime_daemon_shutdown_endpoint_signals_daemon_loop():
    daemon = LocalRuntimeDaemon(token="test-token")
    shutdown_event = asyncio.Event()
    daemon.bind_shutdown_event(shutdown_event)

    response = await daemon.handle_shutdown(FakeRequest())

    assert response.status == 200
    await asyncio.wait_for(shutdown_event.wait(), timeout=0.2)


@pytest.mark.asyncio
async def test_local_runtime_daemon_close_shuts_down_browser_runtime(monkeypatch):
    local_runtime = FakeLocalRuntimeWithShutdown()
    shutdown_calls = []

    async def fake_shutdown_browser_runtime():
        shutdown_calls.append(True)
        return {
            "browser_use_closed": True,
            "terminated_chrome_processes": 1,
            "errors": [],
        }

    import tools.browser.browser_use_engine as browser_use_engine

    monkeypatch.setattr(
        browser_use_engine,
        "shutdown_browser_runtime",
        fake_shutdown_browser_runtime,
    )
    daemon = LocalRuntimeDaemon(local_runtime=local_runtime, token="test-token")

    await daemon.close()

    assert shutdown_calls == [True]
    assert local_runtime.shutdown_calls == 1
