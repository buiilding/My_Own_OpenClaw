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
    (plugin_dir / "extension.json").write_text(
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
