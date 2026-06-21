"""Covers local-runtime scroll tool behavior."""

import sys
from types import SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import scroll_tool  # noqa: E402
from tools.result import ToolResult  # noqa: E402


async def _execute_scroll(args):
    result = await scroll_tool.execute_scroll_control(args)
    assert isinstance(result, ToolResult)
    return result.to_dict()


def _fake_pyautogui(*, with_hscroll: bool):
    calls = []

    def move_to(x, y):
        calls.append(("moveTo", x, y))

    def vscroll(clicks):
        calls.append(("vscroll", clicks))

    module = SimpleNamespace(
        FAILSAFE=True,
        moveTo=move_to,
        vscroll=vscroll,
        size=lambda: SimpleNamespace(width=1280, height=900),
    )
    if with_hscroll:
        module.hscroll = lambda clicks: calls.append(("hscroll", clicks))
    return module, calls


@pytest.fixture(autouse=True)
def stub_sleep(monkeypatch):
    monkeypatch.setattr(scroll_tool.time, "sleep", lambda _seconds: None)


@pytest.mark.asyncio
async def test_execute_scroll_control_requires_action():
    result = await _execute_scroll({})
    assert result["success"] is False
    assert result["error"] == "action is required"


@pytest.mark.asyncio
async def test_execute_scroll_control_requires_coordinates(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll({"action": "scroll_up"})

    assert result["success"] is False
    assert "x and y are required" in result["error"]


@pytest.mark.asyncio
async def test_execute_scroll_control_scroll_up_uses_positive_vscroll(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll_up", "x": 100, "y": 200, "clicks": 3}
    )

    assert result["success"] is True
    assert result["data"]["os_clicks"] == 3
    assert result["data"]["requested_clicks"] == 3
    assert result["data"]["scroll_mode"] == "manual_clicks"
    assert calls == [("moveTo", 100, 200), ("vscroll", 3)]


@pytest.mark.asyncio
async def test_execute_scroll_control_scroll_down_uses_negative_vscroll(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll_down", "x": 10, "y": 20, "clicks": 2}
    )

    assert result["success"] is True
    assert result["data"]["os_clicks"] == 2
    assert result["data"]["requested_clicks"] == 2
    assert calls == [("moveTo", 10, 20), ("vscroll", -2)]


@pytest.mark.asyncio
async def test_execute_scroll_control_vertical_uses_coarse_auto_when_clicks_omitted(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setattr(scroll_tool, "get_default_scroll_clicks", lambda: 5)

    result = await _execute_scroll(
        {"action": "scroll_down", "x": 10, "y": 20}
    )

    assert result["success"] is True
    assert result["data"]["scroll_mode"] == "default_clicks"
    assert result["data"]["requested_clicks"] is None
    assert result["data"]["os_clicks"] == 5
    assert calls == [("moveTo", 10, 20), ("vscroll", -5)]


@pytest.mark.asyncio
async def test_execute_scroll_control_scroll_left_falls_back_without_hscroll(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=False)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll", "direction": "left", "x": 5, "y": 6, "clicks": 1}
    )

    assert result["success"] is True
    assert result["data"]["os_clicks"] == 1
    assert result["data"]["scroll_mode"] == "manual_clicks"
    assert calls == [("moveTo", 5, 6), ("vscroll", -1)]


@pytest.mark.asyncio
async def test_execute_scroll_control_scroll_right_uses_hscroll_when_available(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll", "direction": "right", "x": 9, "y": 11, "clicks": 2}
    )

    assert result["success"] is True
    assert result["data"]["os_clicks"] == 2
    assert result["data"]["scroll_mode"] == "manual_clicks"
    assert calls == [("moveTo", 9, 11), ("hscroll", 2)]


@pytest.mark.asyncio
async def test_execute_scroll_control_rejects_invalid_direction(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll", "direction": "diagonal", "x": 1, "y": 2}
    )

    assert result["success"] is False
    assert "Invalid scroll direction" in result["error"]


@pytest.mark.asyncio
async def test_execute_scroll_control_rejects_unknown_action(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll_around", "x": 1, "y": 2}
    )

    assert result["success"] is False
    assert "Unknown scroll action" in result["error"]


@pytest.mark.asyncio
async def test_execute_scroll_control_requires_direction_for_scroll_action(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_scroll(
        {"action": "scroll", "x": 1, "y": 2}
    )

    assert result["success"] is False
    assert "direction required for scroll action" in result["error"]
    assert calls == [("moveTo", 1, 2)]


@pytest.mark.asyncio
async def test_execute_scroll_control_import_error_returns_failure(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyautogui", None)

    result = await _execute_scroll(
        {"action": "scroll_up", "x": 1, "y": 2}
    )

    assert result["success"] is False
    assert result["error"] == "pyautogui library not available"
