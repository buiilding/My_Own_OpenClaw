import sys
from types import SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import keyboard_tool  # noqa: E402


def _fake_pyautogui():
    calls = []

    def write(text, interval):
        calls.append(("write", text, interval))

    def press(key):
        calls.append(("press", key))

    def hotkey(*keys):
        calls.append(("hotkey", *keys))

    module = SimpleNamespace(
        FAILSAFE=True,
        write=write,
        press=press,
        hotkey=hotkey,
    )
    return module, calls


@pytest.mark.asyncio
async def test_execute_keyboard_control_requires_action():
    result = await keyboard_tool.execute_keyboard_control({})
    assert result == {"success": False, "error": "action is required"}


@pytest.mark.asyncio
async def test_execute_keyboard_control_type_writes_text(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await keyboard_tool.execute_keyboard_control(
        {"action": "type", "text": "hello world"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "type"
    assert result["data"]["metadata"]["input_length"] == 11
    assert calls == [("write", "hello world", 0.01)]


@pytest.mark.asyncio
async def test_execute_keyboard_control_press_maps_escape_key(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await keyboard_tool.execute_keyboard_control(
        {"action": "press", "key": "escape"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "press"
    assert calls == [("press", "esc")]


@pytest.mark.asyncio
async def test_execute_keyboard_control_hotkey_blocks_dangerous_combinations(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await keyboard_tool.execute_keyboard_control(
        {"action": "hotkey", "keys": ["Ctrl", "Alt", "Del"]}
    )

    assert result["success"] is False
    assert "Dangerous key combination blocked" in result["error"]
    assert calls == []


@pytest.mark.asyncio
async def test_execute_keyboard_control_hotkey_maps_keys(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await keyboard_tool.execute_keyboard_control(
        {"action": "hotkey", "keys": ["Ctrl", "Shift", "A"]}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "hotkey"
    assert calls == [("hotkey", "ctrl", "shift", "a")]


@pytest.mark.asyncio
async def test_execute_keyboard_control_rejects_unknown_action(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await keyboard_tool.execute_keyboard_control({"action": "paste"})

    assert result["success"] is False
    assert "Unknown keyboard action" in result["error"]
