import sys
from types import SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import mouse_tool  # noqa: E402


def _fake_pyautogui(*, with_hscroll: bool):
    calls = []

    def click(x, y):
        calls.append(("click", x, y))

    def double_click(x, y):
        calls.append(("doubleClick", x, y))

    def right_click(x, y):
        calls.append(("rightClick", x, y))

    def move_to(x, y):
        calls.append(("moveTo", x, y))

    def position():
        calls.append(("position",))
        return (11, 22)

    def drag_to(x, y, duration):
        calls.append(("dragTo", x, y, duration))

    def scroll(amount, x=None, y=None):
        calls.append(("scroll", amount, x, y))

    module = SimpleNamespace(
        FAILSAFE=True,
        click=click,
        doubleClick=double_click,
        rightClick=right_click,
        moveTo=move_to,
        position=position,
        dragTo=drag_to,
        scroll=scroll,
    )
    if with_hscroll:
        module.hscroll = lambda amount, x=None, y=None: calls.append(("hscroll", amount, x, y))
    return module, calls


@pytest.mark.asyncio
async def test_execute_mouse_control_click_success(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "click", "x": 100, "y": 200})

    assert result.success is True
    assert result.data["action"] == "click"
    assert result.data["coordinates"] == [100, 200]
    assert calls == [("click", 100, 200)]


@pytest.mark.asyncio
async def test_execute_mouse_control_drag_calls_position_and_drag_to(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "drag", "x": 300, "y": 400})

    assert result.success is True
    assert result.data["action"] == "drag"
    assert ("position",) in calls
    assert ("dragTo", 300, 400, 0.1) in calls


@pytest.mark.asyncio
async def test_execute_mouse_control_scroll_vertical_uses_negative_amount(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control(
        {"action": "scroll", "scroll_amount": 5, "scroll_direction": "vertical", "x": 1, "y": 2}
    )

    assert result.success is True
    assert ("moveTo", 1, 2) in calls
    assert ("scroll", -5, 1, 2) in calls


@pytest.mark.asyncio
async def test_execute_mouse_control_scroll_horizontal_falls_back_without_hscroll(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=False)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control(
        {"action": "scroll", "scroll_amount": 4, "scroll_direction": "horizontal"}
    )

    assert result.success is True
    assert ("scroll", -4, None, None) in calls


@pytest.mark.asyncio
async def test_execute_mouse_control_requires_coordinates_for_move(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "move", "x": 100})

    assert result.success is False
    assert "X and Y coordinates are required" in (result.error or "")
    assert calls == []


@pytest.mark.asyncio
async def test_execute_mouse_control_rejects_unknown_action(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui(with_hscroll=True)
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await mouse_tool.execute_mouse_control({"action": "hover"})

    assert result.success is False
    assert "Unknown mouse action" in (result.error or "")
