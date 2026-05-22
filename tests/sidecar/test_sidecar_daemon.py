import asyncio
import json
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from sidecar_daemon import SidecarDaemon  # noqa: E402


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
    async def call_tool(self, name, args):
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"{name}:{args['value']}",
                }
            ]
        }


class FakeBackendWithEventSink:
    def __init__(self):
        self.event_sink = None

    def set_event_sink(self, event_sink):
        self.event_sink = event_sink


@pytest.mark.asyncio
async def test_sidecar_daemon_rejects_missing_or_invalid_token():
    daemon = SidecarDaemon(token="test-token")
    missing = await daemon._auth_middleware(FakeRequest(), daemon.handle_health)
    invalid = await daemon._auth_middleware(
        FakeRequest(headers={"x-windie-sidecar-token": "bad"}),
        daemon.handle_health,
    )
    valid = await daemon._auth_middleware(
        FakeRequest(headers={"x-windie-sidecar-token": "test-token"}),
        daemon.handle_health,
    )

    assert missing.status == 401
    assert invalid.status == 401
    assert valid.status == 200


@pytest.mark.asyncio
async def test_sidecar_daemon_status_endpoint_reports_runtime_boundary():
    daemon = SidecarDaemon(token="test-token")
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
async def test_sidecar_daemon_tools_endpoint_lists_builtin_and_dynamic_tools():
    daemon = SidecarDaemon(token="test-token")

    async def save_note(args):
        return {"success": True, "data": {"llm_content": args["text"]}}

    daemon.backend.tool_registry.register_runtime_tool(
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
async def test_sidecar_daemon_execute_tool_endpoint_normalizes_missing_tool_errors():
    daemon = SidecarDaemon(token="test-token")
    ws = FakeEventSocket()
    daemon.events.add(ws)

    response = await daemon.handle_execute_tool(
        FakeRequest({"tool_name": "missing_tool", "args": {"value": "hello"}})
    )
    payload = json.loads(response.text)

    assert response.status == 200
    assert payload == {"success": False, "error": "Tool not found: missing_tool"}
    assert ws.sent == [
        {
            "type": "tool-executed",
            "payload": {"tool_name": "missing_tool", "success": False},
        }
    ]


@pytest.mark.asyncio
async def test_sidecar_daemon_binds_backend_event_sink_to_event_socket():
    backend = FakeBackendWithEventSink()
    daemon = SidecarDaemon(backend=backend, token="test-token")
    ws = FakeEventSocket()
    daemon.events.add(ws)

    await backend.event_sink(
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
async def test_sidecar_daemon_rpc_endpoint_uses_backend_protocol():
    daemon = SidecarDaemon(token="test-token")

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
        "result": {"status": "ok", "service": "local_backend"},
    }


@pytest.mark.asyncio
async def test_sidecar_daemon_registers_module_tool_without_restart(
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
                "    return ToolResult.success_result({'llm_content': 'saved:' + args['text']})",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    daemon = SidecarDaemon(token="test-token")
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
        "data": {"llm_content": "saved:hello"},
    }


@pytest.mark.asyncio
async def test_sidecar_daemon_registers_plugin_tools_without_restart(tmp_path: Path):
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
                "def save(text: str):",
                "    return {'success': True, 'data': {'llm_content': 'plugin:' + text}}",
            ]
        ),
        encoding="utf-8",
    )

    daemon = SidecarDaemon(token="test-token")
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
        "data": {"llm_content": "plugin:hello"},
    }


@pytest.mark.asyncio
async def test_sidecar_daemon_registers_mcp_tools_without_restart():
    daemon = SidecarDaemon(token="test-token")
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
    assert json.loads(execution.text) == {
        "success": True,
        "data": {
            "llm_content": "remember:hello",
            "return_display": "remember:hello",
            "mcp_result": {"content": [{"type": "text", "text": "remember:hello"}]},
        },
    }


@pytest.mark.asyncio
async def test_sidecar_daemon_events_channel_handles_control_messages():
    daemon = SidecarDaemon(token="test-token")
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
async def test_sidecar_daemon_shutdown_endpoint_signals_daemon_loop():
    daemon = SidecarDaemon(token="test-token")
    shutdown_event = asyncio.Event()
    daemon.bind_shutdown_event(shutdown_event)

    response = await daemon.handle_shutdown(FakeRequest())

    assert response.status == 200
    await asyncio.wait_for(shutdown_event.wait(), timeout=0.2)
