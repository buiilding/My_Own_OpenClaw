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
