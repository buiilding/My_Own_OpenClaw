"""Covers local-runtime keyboard tool behavior."""

import sys
from types import SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import keyboard_tool  # noqa: E402
from tools.result import ToolResult  # noqa: E402


async def _execute_keyboard(args):
    result = await keyboard_tool.execute_keyboard_control(args)
    assert isinstance(result, ToolResult)
    return result.to_dict()


def _fake_pyautogui():
    calls = []

    def write(text, interval):
        calls.append(("write", text, interval))

    def press(key, presses=1, interval=0.0):
        calls.append(("press", key, presses, interval))

    def hotkey(*keys):
        calls.append(("hotkey", *keys))

    module = SimpleNamespace(
        FAILSAFE=True,
        write=write,
        press=press,
        hotkey=hotkey,
    )
    return module, calls


def _fake_pyperclip(initial_text="existing clipboard"):
    calls = []
    clipboard = {"value": initial_text}

    def paste():
        calls.append(("paste",))
        return clipboard["value"]

    def copy(text):
        calls.append(("copy", text))
        clipboard["value"] = text

    module = SimpleNamespace(
        paste=paste,
        copy=copy,
    )
    return module, calls


@pytest.mark.asyncio
async def test_execute_keyboard_control_requires_action():
    result = await _execute_keyboard({})
    assert result["success"] is False
    assert result["error"] == "action is required"


@pytest.mark.asyncio
async def test_execute_keyboard_control_type_writes_text(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_keyboard(
        {"action": "type", "text": "hello world"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "type"
    assert result["data"]["metadata"]["input_length"] == 11
    assert result["data"]["metadata"]["input_mode"] == "type"
    assert calls == [("write", "hello world", 0.01)]


@pytest.mark.asyncio
async def test_execute_keyboard_control_type_multiline_uses_clipboard_paste(monkeypatch):
    fake_pyautogui, pyautogui_calls = _fake_pyautogui()
    fake_pyperclip, clipboard_calls = _fake_pyperclip()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setitem(sys.modules, "pyperclip", fake_pyperclip)
    monkeypatch.setattr(keyboard_tool.platform, "system", lambda: "Linux")

    result = await _execute_keyboard(
        {"action": "type", "text": "first line\nsecond line"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "type"
    assert result["data"]["metadata"]["input_mode"] == "paste"
    assert result["data"]["metadata"]["paste_hotkey"] == "ctrl+v"
    assert result["data"]["metadata"]["clipboard_restored"] is True
    assert pyautogui_calls == [("hotkey", "ctrl", "v")]
    assert clipboard_calls == [
        ("paste",),
        ("copy", "first line\nsecond line"),
        ("copy", "existing clipboard"),
    ]


@pytest.mark.asyncio
async def test_execute_keyboard_control_paste_uses_platform_hotkey(monkeypatch):
    fake_pyautogui, pyautogui_calls = _fake_pyautogui()
    fake_pyperclip, _clipboard_calls = _fake_pyperclip()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setitem(sys.modules, "pyperclip", fake_pyperclip)
    monkeypatch.setattr(keyboard_tool.platform, "system", lambda: "Darwin")

    result = await _execute_keyboard(
        {"action": "paste", "text": "hello world"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "paste"
    assert result["data"]["metadata"]["input_mode"] == "paste"
    assert result["data"]["metadata"]["paste_hotkey"] == "command+v"
    assert pyautogui_calls == [("hotkey", "command", "v")]


@pytest.mark.asyncio
async def test_execute_keyboard_control_press_maps_escape_key(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_keyboard(
        {"action": "press", "key": "escape"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "press"
    assert calls == [("press", "esc", 1, 0.0)]


@pytest.mark.asyncio
async def test_execute_keyboard_control_press_maps_super_by_platform(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setattr(keyboard_tool.platform, "system", lambda: "Darwin")

    result = await _execute_keyboard(
        {"action": "press", "key": "SUPER"}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "press"
    assert calls == [("press", "command", 1, 0.0)]


@pytest.mark.asyncio
async def test_execute_keyboard_control_press_supports_repeat_and_interval(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_keyboard(
        {"action": "press", "key": "enter", "repeat": 3, "interval_ms": 25}
    )

    assert result["success"] is True
    assert result["data"]["metadata"]["repeat"] == 3
    assert result["data"]["metadata"]["interval_ms"] == 25
    assert calls == [("press", "enter", 3, 0.025)]


@pytest.mark.asyncio
async def test_execute_keyboard_control_hotkey_blocks_dangerous_combinations(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_keyboard(
        {"action": "hotkey", "keys": ["Ctrl", "Alt", "Del"]}
    )

    assert result["success"] is False
    assert "Dangerous key combination blocked" in result["error"]
    assert calls == []


@pytest.mark.asyncio
async def test_execute_keyboard_control_hotkey_maps_keys(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_keyboard(
        {"action": "hotkey", "keys": ["Ctrl", "Shift", "A"]}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "hotkey"
    assert calls == [("hotkey", "ctrl", "shift", "a")]


@pytest.mark.asyncio
async def test_execute_keyboard_control_hotkey_maps_super_to_win(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setattr(keyboard_tool.platform, "system", lambda: "Linux")

    result = await _execute_keyboard(
        {"action": "hotkey", "keys": ["SUPER", "Shift", "S"]}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "hotkey"
    assert calls == [("hotkey", "win", "shift", "s")]


@pytest.mark.asyncio
async def test_execute_keyboard_control_hotkey_maps_super_to_command_on_macos(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setattr(keyboard_tool.platform, "system", lambda: "Darwin")

    result = await _execute_keyboard(
        {"action": "hotkey", "keys": ["SUPER", "Shift", "S"]}
    )

    assert result["success"] is True
    assert result["data"]["action"] == "hotkey"
    assert calls == [("hotkey", "command", "shift", "s")]


@pytest.mark.asyncio
async def test_execute_keyboard_control_rejects_unknown_action(monkeypatch):
    fake_pyautogui, _calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    result = await _execute_keyboard({"action": "unknown"})

    assert result["success"] is False
    assert "Unknown keyboard action" in result["error"]


@pytest.mark.asyncio
async def test_execute_keyboard_control_rejects_missing_or_too_long_text(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)

    missing = await _execute_keyboard({"action": "type"})
    missing_paste = await _execute_keyboard({"action": "paste"})
    too_long = await _execute_keyboard(
        {"action": "type", "text": "x" * 10001}
    )
    too_long_paste = await _execute_keyboard(
        {"action": "paste", "text": "x" * 10001}
    )

    assert missing["success"] is False
    assert "text parameter required" in missing["error"]
    assert missing_paste["success"] is False
    assert "text parameter required" in missing_paste["error"]
    assert too_long["success"] is False
    assert "Text too long" in too_long["error"]
    assert too_long_paste["success"] is False
    assert "Text too long" in too_long_paste["error"]
    assert calls == []


@pytest.mark.asyncio
async def test_execute_keyboard_control_import_error_returns_failure(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyautogui", None)

    result = await _execute_keyboard(
        {"action": "press", "key": "enter"}
    )

    assert result["success"] is False
    assert result["error"] == "pyautogui library not available"


@pytest.mark.asyncio
async def test_execute_keyboard_control_paste_requires_pyperclip(monkeypatch):
    fake_pyautogui, calls = _fake_pyautogui()
    monkeypatch.setitem(sys.modules, "pyautogui", fake_pyautogui)
    monkeypatch.setitem(sys.modules, "pyperclip", None)

    result = await _execute_keyboard(
        {"action": "paste", "text": "hello"}
    )

    assert result["success"] is False
    assert result["error"] == "pyperclip library not available"
    assert calls == []
