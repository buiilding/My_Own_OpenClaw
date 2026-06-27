"""Covers local-runtime open-app tool behavior."""

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system import open_app_tool  # noqa: E402
from tools.result import ToolResult  # noqa: E402


@pytest.mark.asyncio
async def test_open_app_verify_none_returns_detached_launch(monkeypatch):
    launch_calls = {}

    def _fake_launch(command, command_args, working_directory):
        launch_calls["command"] = command
        launch_calls["command_args"] = command_args
        launch_calls["working_directory"] = working_directory
        return {"pid": 4242, "argv": [command, *command_args], "started_at": 0.0}

    monkeypatch.setattr(open_app_tool, "_launch_detached_process", _fake_launch)

    result = await open_app_tool.open_app(
        {
            "command": "notepad",
            "verify": "none",
            "args": ["--example"],
        }
    )

    assert result["success"] is True
    data = result["data"]
    assert data["detached"] is True
    assert data["pid"] == 4242
    assert data["verify_status"] == "skipped"
    assert launch_calls == {
        "command": "notepad",
        "command_args": ["--example"],
        "working_directory": None,
    }


@pytest.mark.asyncio
async def test_open_app_verify_window_polls_until_match(monkeypatch):
    monkeypatch.setattr(
        open_app_tool,
        "_launch_detached_process",
        lambda *_args, **_kwargs: {"pid": 999, "argv": ["app"], "started_at": 0.0},
    )

    responses = iter(
        [
            {"success": True, "data": {"windows": []}},
            {"success": True, "data": {"windows": ["Calculator"]}},
        ]
    )

    async def _fake_get_open_windows(_args):
        payload = next(responses)
        if payload["success"]:
            return ToolResult.success_result(payload["data"])
        return ToolResult.error_result(payload["error"])

    async def _fake_sleep(_seconds):
        return None

    monkeypatch.setattr(open_app_tool, "get_open_windows", _fake_get_open_windows)
    monkeypatch.setattr(open_app_tool.asyncio, "sleep", _fake_sleep)

    result = await open_app_tool.open_app(
        {
            "command": "calc",
            "verify": "window",
            "verify_window_title": "Calculator",
            "verify_timeout_seconds": 1.0,
        }
    )

    assert result["success"] is True
    data = result["data"]
    assert data["verify_status"] == "verified"
    assert data["verified"] is True
    assert data["matched_window_title"] == "Calculator"


@pytest.mark.asyncio
async def test_open_app_verify_screenshot_includes_screenshot_payload(monkeypatch):
    monkeypatch.setattr(
        open_app_tool,
        "_launch_detached_process",
        lambda *_args, **_kwargs: {"pid": 11, "argv": ["app"], "started_at": 0.0},
    )

    async def _fake_get_open_windows(_args):
        return ToolResult.success_result({"windows": []})

    async def _fake_screenshot(_args):
        return {
            "success": True,
            "data": {
                "screenshot_path": "/tmp/agent-shot-test.jpg",
                "screenshot_content_type": "image/jpeg",
                "compression": "jpeg",
                "size": 123,
                "capture_meta": {"source_w": 100, "source_h": 100},
            },
        }

    async def _fake_sleep(_seconds):
        return None

    monkeypatch.setattr(open_app_tool, "get_open_windows", _fake_get_open_windows)
    monkeypatch.setattr(open_app_tool, "capture_screenshot", _fake_screenshot)
    monkeypatch.setattr(open_app_tool.asyncio, "sleep", _fake_sleep)

    result = await open_app_tool.open_app(
        {
            "command": "example-app",
            "verify": "screenshot",
            "verify_timeout_seconds": 0.2,
        }
    )

    assert result["success"] is True
    data = result["data"]
    assert data["verify_status"] == "screenshot_captured"
    assert data["screenshot_path"] == "/tmp/agent-shot-test.jpg"
    assert data["screenshot_content_type"] == "image/jpeg"


@pytest.mark.asyncio
async def test_open_app_rejects_invalid_inputs():
    missing_command = await open_app_tool.open_app({"verify": "none"})
    assert missing_command == {"success": False, "error": "command is required"}

    invalid_verify = await open_app_tool.open_app({"command": "notepad", "verify": "later"})
    assert invalid_verify == {
        "success": False,
        "error": "verify must be one of: none, window, screenshot",
    }

    invalid_timeout = await open_app_tool.open_app(
        {"command": "notepad", "verify_timeout_seconds": -1}
    )
    assert invalid_timeout == {
        "success": False,
        "error": "verify_timeout_seconds must be a non-negative number",
    }
