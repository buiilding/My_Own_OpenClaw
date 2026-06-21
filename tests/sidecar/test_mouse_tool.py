"""Covers local-runtime mouse tool behavior."""

import sys
from types import SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import mouse_tool  # noqa: E402


def _fake_pyautogui():
    calls = []

    def click(x, y, button="left"):
        calls.append(("click", x, y, button))

    def double_click(x, y, button="left"):
        calls.append(("doubleClick", x, y, button))

    def right_click(x, y):
        calls.append(("rightClick", x, y))

    def move_to(x, y):
        calls.append(("moveTo", x, y))

    def drag_to(x, y, duration, button="left"):
        calls.append(("dragTo", x, y, duration, button))

    module = SimpleNamespace(
        FAILSAFE=True,
        click=click,
        doubleClick=double_click,
        rightClick=right_click,
        moveTo=move_to,
        dragTo=drag_to,
    )
    return module, calls


@pytest.mark.asyncio
async def test_execute_mouse_control_click_success(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "click", "x": 100, "y": 200})

    assert result.success is True
    assert result.data["action"] == "click"
    assert result.data["coordinates"] == [100, 200]
    assert result.data["button"] == "left"
    assert calls == [("click", 100, 200, "left")]


@pytest.mark.asyncio
async def test_execute_mouse_control_click_passes_explicit_button(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control(
        {"action": "click", "x": 100, "y": 200, "button": "middle"}
    )

    assert result.success is True
    assert result.data["button"] == "middle"
    assert calls == [("click", 100, 200, "middle")]


@pytest.mark.asyncio
async def test_execute_mouse_control_drag_moves_to_source_and_drags_to_destination(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control(
        {
            "action": "drag",
            "x": 300,
            "y": 400,
            "drag_to_x": 500,
            "drag_to_y": 600,
            "duration": 0.5,
        }
    )

    assert result.success is True
    assert result.data["action"] == "drag"
    assert result.data["coordinates"] == [500, 600]
    assert result.data["source_coordinates"] == [300, 400]
    assert result.data["destination_coordinates"] == [500, 600]
    assert result.data["button"] == "left"
    assert result.data["duration"] == 0.5
    assert result.data["message"] == "Dragged from (300, 400) to (500, 600)"
    assert calls == [("moveTo", 300, 400), ("dragTo", 500, 600, 0.5, "left")]


@pytest.mark.asyncio
async def test_execute_mouse_control_drag_passes_explicit_button(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control(
        {
            "action": "drag",
            "x": 300,
            "y": 400,
            "drag_to_x": 500,
            "drag_to_y": 600,
            "duration": 0.5,
            "button": "middle",
        }
    )

    assert result.success is True
    assert result.data["button"] == "middle"
    assert calls == [("moveTo", 300, 400), ("dragTo", 500, 600, 0.5, "middle")]


@pytest.mark.asyncio
async def test_execute_mouse_control_drag_requires_destination_coordinates(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "drag", "x": 300, "y": 400})

    assert result.success is False
    assert "drag_to_x and drag_to_y are required" in (result.error or "")
    assert calls == []


@pytest.mark.asyncio
async def test_execute_mouse_control_requires_coordinates_for_move(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "move", "x": 100})

    assert result.success is False
    assert "X and Y coordinates are required" in (result.error or "")
    assert calls == []


@pytest.mark.asyncio
async def test_execute_mouse_control_rejects_unknown_action(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "hover"})

    assert result.success is False
    assert "Unknown mouse action" in (result.error or "")


@pytest.mark.asyncio
async def test_execute_mouse_control_import_error_returns_failure(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyautogui", None)

    result = await mouse_tool.execute_mouse_control({"action": "click", "x": 1, "y": 2})

    assert result.success is False
    assert result.error == "pyautogui library not available"
