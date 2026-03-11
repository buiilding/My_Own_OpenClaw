import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import screenshot_tool  # noqa: E402


class _FakeImage:
    def __init__(self, mode="RGBA", size=(300, 200)):
        self.mode = mode
        self.size = size

    def convert(self, mode):
        converted = _FakeImage(mode=mode, size=self.size)
        converted.size = self.size
        return converted

    def crop(self, box):
        left, top, right, bottom = box
        return _FakeImage(mode=self.mode, size=(right - left, bottom - top))

    def save(self, buffer, format, quality, optimize, progressive):  # noqa: A002
        assert format == "JPEG"
        assert quality == 85
        assert optimize is False
        assert progressive is False
        buffer.write(b"fake-jpeg-bytes")


def _install_fake_modules(monkeypatch, *, screenshot_fn, stub_system_capture=True):
    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.screenshot = screenshot_fn
    pyautogui_module.size = lambda: SimpleNamespace(width=1920, height=1080)
    pil_module = ModuleType("PIL")
    pil_module.Image = object()
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)
    monkeypatch.setitem(sys.modules, "PIL", pil_module)
    if stub_system_capture:
        monkeypatch.setattr(screenshot_tool, "_capture_with_system_cursor", lambda region=None: None)


@pytest.mark.asyncio
async def test_capture_screenshot_success_with_display_bounds(monkeypatch):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA")

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)

    result = await screenshot_tool.capture_screenshot(
        {"display_bounds": {"x": 10.1, "y": 20.9, "width": 300, "height": 200}}
    )

    assert result["success"] is True
    assert calls == [(10, 20, 300, 200)]
    payload = result["data"]
    assert payload["compression"] == "jpeg"
    assert payload["return_display"] == "Screenshot captured"
    assert payload["screenshot_content_type"] == "image/jpeg"
    screenshot_path = payload["screenshot_path"]
    screenshot_file = Path(screenshot_path)
    try:
        assert screenshot_file.read_bytes() == b"fake-jpeg-bytes"
    finally:
        screenshot_file.unlink(missing_ok=True)
    assert payload["size"] == len(b"fake-jpeg-bytes")
    assert payload["capture_meta"] == {
      "source_w": 300,
      "source_h": 200,
      "crop_x": 10,
      "crop_y": 20,
      "crop_w": 300,
      "crop_h": 200,
      "desktop_virtual_bounds": {
        "x": 10,
        "y": 20,
        "width": 300,
        "height": 200,
      },
      "monitor_id": None,
      "timestamp": payload["capture_meta"]["timestamp"],
      "capture_backend": "pyautogui_fallback",
    }
    assert isinstance(payload["capture_meta"]["timestamp"], int)


@pytest.mark.asyncio
async def test_capture_screenshot_crops_full_virtual_desktop_to_target_monitor(monkeypatch):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA", size=(4480, 1440))

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Linux")

    result = await screenshot_tool.capture_screenshot(
        {
            "display_bounds": {
                "x": 1920,
                "y": 0,
                "width": 2560,
                "height": 1440,
                "monitor_id": "2",
                "desktop_virtual_bounds": {
                    "x": 0,
                    "y": 0,
                    "width": 4480,
                    "height": 1440,
                },
            }
        }
    )

    assert result["success"] is True
    assert calls == [None]
    payload = result["data"]
    assert payload["capture_meta"] == {
        "source_w": 2560,
        "source_h": 1440,
        "crop_x": 1920,
        "crop_y": 0,
        "crop_w": 2560,
        "crop_h": 1440,
        "desktop_virtual_bounds": {
            "x": 0,
            "y": 0,
            "width": 4480,
            "height": 1440,
        },
        "monitor_id": "2",
        "timestamp": payload["capture_meta"]["timestamp"],
        "capture_backend": "pyautogui_fallback",
    }
    assert isinstance(payload["capture_meta"]["timestamp"], int)


@pytest.mark.asyncio
async def test_capture_screenshot_on_macos_uses_direct_region_for_monitor_bounds(monkeypatch):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        if region is None:
            return _FakeImage(mode="RGBA", size=(5120, 2880))
        return _FakeImage(mode="RGBA", size=(2560, 1440))

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    result = await screenshot_tool.capture_screenshot(
        {
            "display_bounds": {
                "x": 1920,
                "y": 0,
                "width": 2560,
                "height": 1440,
                "monitor_id": "2",
                "desktop_virtual_bounds": {
                    "x": 0,
                    "y": 0,
                    "width": 4480,
                    "height": 1440,
                },
            }
        }
    )

    assert result["success"] is True
    assert calls == [(1920, 0, 2560, 1440)]
    payload = result["data"]
    assert payload["capture_meta"] == {
        "source_w": 2560,
        "source_h": 1440,
        "crop_x": 1920,
        "crop_y": 0,
        "crop_w": 2560,
        "crop_h": 1440,
        "desktop_virtual_bounds": {
            "x": 0,
            "y": 0,
            "width": 4480,
            "height": 1440,
        },
        "monitor_id": "2",
        "timestamp": payload["capture_meta"]["timestamp"],
        "capture_backend": "pyautogui_fallback",
    }
    assert isinstance(payload["capture_meta"]["timestamp"], int)


@pytest.mark.asyncio
async def test_capture_screenshot_import_error_returns_failure(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyautogui", None)
    monkeypatch.setitem(sys.modules, "PIL", None)

    result = await screenshot_tool.capture_screenshot({})

    assert result["success"] is False
    assert "Required library not available" in result["error"]


@pytest.mark.asyncio
async def test_capture_screenshot_runtime_error_returns_failure(monkeypatch):
    def _broken_screenshot(region=None):  # noqa: ARG001
        raise RuntimeError("device busy")

    _install_fake_modules(monkeypatch, screenshot_fn=_broken_screenshot)

    result = await screenshot_tool.capture_screenshot({})

    assert result["success"] is False
    assert "Screenshot failed: device busy" == result["error"]


@pytest.mark.asyncio
async def test_capture_screenshot_windows_uses_native_cursor_capture_path(monkeypatch):
    image = _FakeImage(mode="RGB")
    called = {"windows_capture": False}

    def _screenshot(region=None):  # noqa: ARG001
        raise AssertionError("pyautogui.screenshot should not be used on Windows path")

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot, stub_system_capture=False)
    monkeypatch.setattr(screenshot_tool, "_is_windows_platform", lambda: True)

    def _fake_windows_capture(region=None):
        called["windows_capture"] = True
        return image

    monkeypatch.setattr(screenshot_tool, "_capture_with_windows_cursor", _fake_windows_capture)

    result = await screenshot_tool.capture_screenshot({})

    assert result["success"] is True
    assert called["windows_capture"] is True


def test_capture_with_system_cursor_routes_to_macos(monkeypatch):
    monkeypatch.setattr(screenshot_tool, "_is_windows_platform", lambda: False)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    result = screenshot_tool._capture_with_system_cursor(None)

    assert result is None


def test_capture_with_system_cursor_routes_to_linux(monkeypatch):
    sentinel = object()
    monkeypatch.setattr(screenshot_tool, "_is_windows_platform", lambda: False)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Linux")
    monkeypatch.setattr(screenshot_tool, "_is_linux_x11_session", lambda: False)
    monkeypatch.setattr(screenshot_tool, "_capture_with_linux_cursor", lambda region=None: sentinel)

    result = screenshot_tool._capture_with_system_cursor(None)

    assert result is sentinel


def test_capture_with_system_cursor_uses_silent_fallback_on_linux_x11(monkeypatch):
    monkeypatch.setattr(screenshot_tool, "_is_windows_platform", lambda: False)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Linux")
    monkeypatch.setattr(screenshot_tool, "_is_linux_x11_session", lambda: True)
    monkeypatch.setattr(
        screenshot_tool,
        "_capture_with_linux_cursor",
        lambda region=None: (_ for _ in ()).throw(AssertionError("linux native capture should be skipped on x11")),
    )

    result = screenshot_tool._capture_with_system_cursor(None)

    assert result is None


def test_overlay_macos_builtin_cursor_uses_repo_owned_cursor(monkeypatch):
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    overlay_calls = []

    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.position = lambda: SimpleNamespace(x=100, y=150)
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)

    cursor_image = object()
    monkeypatch.setattr(screenshot_tool, "_get_macos_builtin_cursor", lambda: (cursor_image, (4, 6)))

    monkeypatch.setattr(
        screenshot_tool,
        "_paste_cursor_overlay",
        lambda screenshot, *, cursor_image, draw_x, draw_y: overlay_calls.append(
            {"screenshot": screenshot, "cursor_image": cursor_image, "draw_x": draw_x, "draw_y": draw_y}
        ),
    )

    screenshot = _FakeImage(mode="RGBA", size=(300, 200))
    result = screenshot_tool._overlay_macos_builtin_cursor(
        screenshot,
        region=(10, 20, 300, 200),
    )

    assert result is True
    assert overlay_calls == [
        {
            "screenshot": screenshot,
            "cursor_image": cursor_image,
            "draw_x": 86,
            "draw_y": 124,
        }
    ]


def test_overlay_macos_builtin_cursor_returns_false_when_cursor_generation_fails(monkeypatch):
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.position = lambda: SimpleNamespace(x=100, y=150)
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)

    monkeypatch.setattr(
        screenshot_tool,
        "_get_macos_builtin_cursor",
        lambda: (_ for _ in ()).throw(RuntimeError("cursor build failed")),
    )

    monkeypatch.setattr(
        screenshot_tool,
        "_paste_cursor_overlay",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("_paste_cursor_overlay should not run without a cursor")
        ),
    )

    screenshot = _FakeImage(mode="RGBA", size=(300, 200))

    assert screenshot_tool._overlay_macos_builtin_cursor(screenshot, region=(10, 20, 300, 200)) is False
