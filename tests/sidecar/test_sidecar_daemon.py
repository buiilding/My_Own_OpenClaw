import json
from pathlib import Path

import pytest
from aiohttp import ClientSession, web
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from sidecar_daemon import SidecarDaemon  # noqa: E402


async def _start_daemon(daemon: SidecarDaemon):
    app = daemon.create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    sockets = list(site._server.sockets or []) if site._server else []
    port = sockets[0].getsockname()[1]
    return runner, f"http://127.0.0.1:{port}"


@pytest.mark.asyncio
async def test_sidecar_daemon_rejects_missing_or_invalid_token():
    daemon = SidecarDaemon(token="test-token")
    runner, base_url = await _start_daemon(daemon)
    try:
        async with ClientSession() as session:
            missing = await session.get(f"{base_url}/status")
            invalid = await session.get(
                f"{base_url}/status",
                headers={"x-windie-sidecar-token": "bad"},
            )
            valid = await session.get(
                f"{base_url}/status",
                headers={"x-windie-sidecar-token": "test-token"},
            )

            assert missing.status == 401
            assert invalid.status == 401
            assert valid.status == 200
    finally:
        await runner.cleanup()


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
    runner, base_url = await _start_daemon(daemon)
    headers = {
        "x-windie-sidecar-token": "test-token",
        "content-type": "application/json",
    }
    try:
        async with ClientSession() as session:
            registration = await session.post(
                f"{base_url}/tools/register-module",
                headers=headers,
                data=json.dumps(
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
                ),
            )
            execution = await session.post(
                f"{base_url}/execute-tool",
                headers=headers,
                data=json.dumps({"tool_name": "save_note", "args": {"text": "hello"}}),
            )

            assert registration.status == 200
            assert await execution.json() == {
                "success": True,
                "data": {"llm_content": "saved:hello"},
            }
    finally:
        await runner.cleanup()
