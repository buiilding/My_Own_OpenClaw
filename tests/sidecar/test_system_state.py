"""Covers local-runtime system-state collection behavior."""

from pathlib import Path
import sys

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import system_state as system_state_module  # noqa: E402


LOCAL_RUNTIME_PLATFORM_TEST_LABEL_PATHS = [
    "test_linux_window_manager.py",
    "test_macos_window_manager.py",
    "test_windows_window_manager.py",
    "test_macos_automation_permission.py",
    "test_platform_module_selection.py",
    "test_system_state.py",
    "test_wakeword_service.py",
]


def test_local_runtime_platform_tests_use_boundary_docstrings():
    test_dir = Path(__file__).parent
    retired_suite_label = "behavior in the " + "sidecar test suite"
    expected_headers = {
        "test_linux_window_manager.py": '"""Covers local-runtime Linux window manager behavior."""',
        "test_macos_window_manager.py": '"""Covers local-runtime macOS window manager behavior."""',
        "test_windows_window_manager.py": '"""Covers local-runtime Windows window manager behavior."""',
        "test_macos_automation_permission.py": '"""Covers local-runtime macOS automation permission behavior."""',
        "test_platform_module_selection.py": '"""Covers local-runtime platform module selection behavior."""',
        "test_system_state.py": '"""Covers local-runtime system-state collection behavior."""',
        "test_wakeword_service.py": '"""Covers local-runtime wakeword service behavior."""',
    }

    for name in LOCAL_RUNTIME_PLATFORM_TEST_LABEL_PATHS:
        source = (test_dir / name).read_text(encoding="utf-8")
        assert source.splitlines()[0] == expected_headers[name]
        assert retired_suite_label not in source


class _FixedNow:
    def __init__(self, value: str):
        self._value = value

    def isoformat(self) -> str:
        return self._value


class _FixedDatetime:
    @staticmethod
    def now():
        return _FixedNow("2026-02-16T10:11:12")


def _patch_system_state_collectors(
    monkeypatch,
    *,
    active_window,
    mouse_position,
    clipboard_preview,
    screen_resolution,
    windows,
    stats,
):
    monkeypatch.setattr(system_state_module, "_get_active_window", active_window)
    monkeypatch.setattr(system_state_module, "_get_mouse_position", mouse_position)
    monkeypatch.setattr(system_state_module, "_get_clipboard_preview", clipboard_preview)
    monkeypatch.setattr(system_state_module, "get_screen_resolution", screen_resolution)
    monkeypatch.setattr(system_state_module, "_get_all_open_windows", windows)
    monkeypatch.setattr(system_state_module, "_get_system_stats", stats)
    monkeypatch.setattr(system_state_module, "datetime", _FixedDatetime)


@pytest.mark.asyncio
async def test_get_system_state_none_fields_collects_all(monkeypatch):
    calls = []

    async def active_window():
        calls.append("active_window")
        return "Terminal"

    async def mouse_position():
        calls.append("mouse_position")
        return "(10, 20)"

    async def clipboard_preview():
        calls.append("clipboard")
        return "clip"

    async def screen_resolution():
        calls.append("screen_resolution")
        return "1920x1080"

    async def windows():
        calls.append("windows")
        return ["Terminal", "Browser"]

    async def stats():
        calls.append("stats")
        return {"cpu_percent": 23.5}

    _patch_system_state_collectors(
        monkeypatch,
        active_window=active_window,
        mouse_position=mouse_position,
        clipboard_preview=clipboard_preview,
        screen_resolution=screen_resolution,
        windows=windows,
        stats=stats,
    )

    result = await system_state_module.get_system_state()

    assert sorted(calls) == [
        "active_window",
        "clipboard",
        "mouse_position",
        "screen_resolution",
        "stats",
        "windows",
    ]
    assert result == {
        "active_window": "Terminal",
        "mouse_position": "(10, 20)",
        "clipboard": "clip",
        "screen_resolution": "1920x1080",
        "windows": ["Terminal", "Browser"],
        "stats": {"cpu_percent": 23.5},
        "time": "2026-02-16T10:11:12",
    }


@pytest.mark.asyncio
async def test_get_system_state_applies_field_fallback_defaults(monkeypatch):
    async def active_window():
        return None

    async def mouse_position():
        raise RuntimeError("mouse boom")

    async def clipboard_preview():
        return ""

    async def screen_resolution():
        return None

    async def windows():
        return "not-a-list"

    async def stats():
        return "not-a-dict"

    _patch_system_state_collectors(
        monkeypatch,
        active_window=active_window,
        mouse_position=mouse_position,
        clipboard_preview=clipboard_preview,
        screen_resolution=screen_resolution,
        windows=windows,
        stats=stats,
    )

    result = await system_state_module.get_system_state(
        [
            "active_window",
            "mouse_position",
            "clipboard",
            "screen_resolution",
            "windows",
            "stats",
            "time",
        ]
    )

    assert result == {
        "active_window": "Unknown",
        "mouse_position": "Unknown",
        "clipboard": "<empty>",
        "screen_resolution": "Unknown",
        "windows": [],
        "stats": {},
        "time": "2026-02-16T10:11:12",
    }


@pytest.mark.asyncio
async def test_get_system_state_uses_minimal_fallback_after_unexpected_error(monkeypatch):
    def clipboard_preview(*_args, **_kwargs):
        raise RuntimeError("explode during coroutine setup")

    monkeypatch.setattr(system_state_module, "_get_clipboard_preview", clipboard_preview)
    monkeypatch.setattr(system_state_module, "datetime", _FixedDatetime)

    result = await system_state_module.get_system_state(["clipboard", "time"])

    assert result == {
        "clipboard": "<error>",
        "time": "2026-02-16T10:11:12",
    }


@pytest.mark.asyncio
async def test_get_system_state_ignores_unknown_fields(monkeypatch):
    async def should_not_run(*_args, **_kwargs):
        raise AssertionError("known field collector should not be called")

    monkeypatch.setattr(system_state_module, "_get_active_window", should_not_run)
    monkeypatch.setattr(system_state_module, "_get_mouse_position", should_not_run)
    monkeypatch.setattr(system_state_module, "_get_clipboard_preview", should_not_run)
    monkeypatch.setattr(system_state_module, "get_screen_resolution", should_not_run)
    monkeypatch.setattr(system_state_module, "_get_all_open_windows", should_not_run)
    monkeypatch.setattr(system_state_module, "_get_system_stats", should_not_run)
    monkeypatch.setattr(system_state_module, "datetime", _FixedDatetime)

    result = await system_state_module.get_system_state(["unknown", "time"])

    assert result == {"time": "2026-02-16T10:11:12"}


@pytest.mark.asyncio
async def test_clipboard_preview_replaces_newlines_and_truncates(monkeypatch):
    class _Pyperclip:
        @staticmethod
        def paste():
            return "line1\nline2\r\nline3"

    monkeypatch.setitem(sys.modules, "pyperclip", _Pyperclip)

    result = await system_state_module._get_clipboard_preview(max_length=8)

    assert result == "line1\\nl..."


@pytest.mark.asyncio
async def test_active_window_linux_uses_xlib_fallback_when_xdotool_unavailable(monkeypatch):
    monkeypatch.setattr(system_state_module, "_get_active_window_linux_xdotool", lambda: None)
    monkeypatch.setattr(
        system_state_module,
        "_get_active_window_linux_xlib",
        lambda: "Project Alpha Notes",
    )

    result = await system_state_module._get_active_window_linux()

    assert result == "Project Alpha Notes"


@pytest.mark.asyncio
async def test_mouse_position_falls_back_to_xlib_when_pyautogui_fails(monkeypatch):
    def _raise_pyautogui_error():
        raise RuntimeError("pyautogui unavailable")

    monkeypatch.setattr(system_state_module, "_get_mouse_position_pyautogui", _raise_pyautogui_error)
    monkeypatch.setattr(system_state_module, "_get_mouse_position_linux_xlib", lambda: (42, 64))

    result = await system_state_module._get_mouse_position()

    assert result == "(42, 64)"


def test_mouse_position_pyautogui_wraps_system_exit(monkeypatch):
    class _PyAutoGUI:
        @staticmethod
        def position():
            raise SystemExit("tkinter missing")

    monkeypatch.setitem(sys.modules, "pyautogui", _PyAutoGUI)

    with pytest.raises(RuntimeError, match="mouse position"):
        system_state_module._get_mouse_position_pyautogui()


def test_screen_resolution_pyautogui_wraps_system_exit(monkeypatch):
    class _PyAutoGUI:
        @staticmethod
        def size():
            raise SystemExit("tkinter missing")

    monkeypatch.setitem(sys.modules, "pyautogui", _PyAutoGUI)

    with pytest.raises(RuntimeError, match="screen resolution"):
        system_state_module._get_screen_resolution_pyautogui()
