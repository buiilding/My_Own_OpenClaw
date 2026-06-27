"""Covers local-runtime screenshot tool behavior."""

import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import screenshot_tool  # noqa: E402
from tools.result import ToolResult  # noqa: E402


def test_path_trace_helpers_use_local_runtime_names():
    source = Path("frontend/src/main/python/path_trace.py").read_text(encoding="utf-8")

    assert "build_sidecar_memory_search_trace" not in source
    assert "build_sidecar_screenshot_capture_trace" not in source
    assert '"runtime": "sidecar"' not in source
    assert "build_local_runtime_memory_search_trace" in source
    assert "build_local_runtime_screenshot_capture_trace" in source


async def capture_screenshot(args):
    result = await screenshot_tool.capture_screenshot(args)
    assert isinstance(result, ToolResult)
    return result.to_dict()


class _FakeImage:
    crop_calls = []
    resize_calls = []

    def __init__(self, mode="RGBA", size=(300, 200)):
        self.mode = mode
        self.size = size

    def convert(self, mode):
        converted = _FakeImage(mode=mode, size=self.size)
        converted.size = self.size
        return converted

    def crop(self, box):
        self.__class__.crop_calls.append({"from": self.size, "box": box})
        left, top, right, bottom = box
        return _FakeImage(mode=self.mode, size=(right - left, bottom - top))

    def resize(self, size, resample=None):
        self.__class__.resize_calls.append(
            {"from": self.size, "to": size, "resample": resample}
        )
        return _FakeImage(mode=self.mode, size=size)

    def save(self, buffer, format, quality, optimize, progressive):  # noqa: A002
        assert format == "JPEG"
        assert quality == 85
        assert optimize is False
        assert progressive is False
        buffer.write(b"fake-jpeg-bytes")


def _install_fake_modules(
    monkeypatch,
    *,
    screenshot_fn,
    stub_system_capture=True,
    desktop_size=(1920, 1080),
):
    _FakeImage.resize_calls = []
    _FakeImage.crop_calls = []
    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.screenshot = screenshot_fn
    pyautogui_module.size = lambda: SimpleNamespace(
        width=desktop_size[0],
        height=desktop_size[1],
    )
    pil_module = ModuleType("PIL")
    pil_module.Image = object()
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)
    monkeypatch.setitem(sys.modules, "PIL", pil_module)
    if stub_system_capture:
        monkeypatch.setattr(
            screenshot_tool, "_capture_with_system_cursor", lambda region=None: None
        )


@pytest.mark.asyncio
async def test_capture_screenshot_success_with_display_bounds(monkeypatch):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA")

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)

    result = await capture_screenshot(
        {"display_bounds": {"x": 10.1, "y": 20.9, "width": 300, "height": 200}}
    )

    assert result["success"] is True
    assert calls == [(10, 20, 300, 200)]
    payload = result["data"]
    assert payload["compression"] == "jpeg"
    assert payload["output"] == "Screenshot captured successfully."
    assert payload["screenshot_content_type"] == "image/jpeg"
    assert payload["screenshot"] == "ZmFrZS1qcGVnLWJ5dGVz"
    assert "screenshot_path" not in payload
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
        "capture_engine": "pyautogui_fallback",
    }
    assert isinstance(payload["capture_meta"]["timestamp"], int)
    assert payload["path_trace"] == {
        "captureEngine": "pyautogui_fallback",
        "sourceW": 300,
        "sourceH": 200,
        "cropX": 10,
        "cropY": 20,
        "cropW": 300,
        "cropH": 200,
        "virtualX": 10,
        "virtualY": 20,
        "virtualWidth": 300,
        "virtualHeight": 200,
        "byteCount": len(b"fake-jpeg-bytes"),
        "contentType": "image/jpeg",
        "durationMs": payload["path_trace"]["durationMs"],
        "hasCaptureMeta": True,
    }
    assert isinstance(payload["path_trace"]["durationMs"], int)


@pytest.mark.asyncio
async def test_capture_screenshot_crops_full_virtual_desktop_to_target_monitor(
    monkeypatch,
):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA", size=(4480, 1440))

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Linux")

    result = await capture_screenshot(
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
        "capture_engine": "pyautogui_fallback",
    }
    assert isinstance(payload["capture_meta"]["timestamp"], int)


@pytest.mark.asyncio
async def test_capture_screenshot_scales_full_virtual_desktop_crop_to_image_pixels(
    monkeypatch,
):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA", size=(8960, 2880))

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Linux")

    result = await capture_screenshot(
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
    assert _FakeImage.crop_calls == [
        {"from": (8960, 2880), "box": (3840, 0, 8960, 2880)}
    ]
    assert _FakeImage.resize_calls == [
        {"from": (5120, 2880), "to": (2560, 1440), "resample": 1}
    ]
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
        "capture_engine": "pyautogui_fallback",
    }


@pytest.mark.asyncio
async def test_capture_screenshot_on_macos_uses_direct_region_for_monitor_bounds(
    monkeypatch,
):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        if region is None:
            return _FakeImage(mode="RGBA", size=(5120, 2880))
        return _FakeImage(mode="RGBA", size=(2560, 1440))

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    result = await capture_screenshot(
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
        "capture_engine": "pyautogui_fallback",
    }
    assert isinstance(payload["capture_meta"]["timestamp"], int)


@pytest.mark.asyncio
async def test_capture_screenshot_resizes_full_desktop_to_logical_coordinates(
    monkeypatch,
):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA", size=(3420, 2224))

    _install_fake_modules(
        monkeypatch,
        screenshot_fn=_screenshot,
        desktop_size=(1710, 1112),
    )
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    result = await capture_screenshot({})

    assert result["success"] is True
    assert calls == [None]
    assert _FakeImage.resize_calls == [
        {"from": (3420, 2224), "to": (1710, 1112), "resample": 1}
    ]
    payload = result["data"]
    assert payload["capture_meta"] == {
        "source_w": 1710,
        "source_h": 1112,
        "crop_x": 0,
        "crop_y": 0,
        "crop_w": 1710,
        "crop_h": 1112,
        "desktop_virtual_bounds": {
            "x": 0,
            "y": 0,
            "width": 1710,
            "height": 1112,
        },
        "monitor_id": None,
        "timestamp": payload["capture_meta"]["timestamp"],
        "capture_engine": "pyautogui_fallback",
    }


@pytest.mark.asyncio
async def test_capture_screenshot_resizes_region_to_display_bounds(monkeypatch):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA", size=(2940, 1912))

    _install_fake_modules(monkeypatch, screenshot_fn=_screenshot)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    result = await capture_screenshot(
        {
            "display_bounds": {
                "x": 0,
                "y": 0,
                "width": 1470,
                "height": 956,
                "desktop_virtual_bounds": {
                    "x": 0,
                    "y": 0,
                    "width": 1470,
                    "height": 956,
                },
            }
        }
    )

    assert result["success"] is True
    assert calls == [(0, 0, 1470, 956)]
    assert _FakeImage.resize_calls == [
        {"from": (2940, 1912), "to": (1470, 956), "resample": 1}
    ]
    payload = result["data"]
    assert payload["capture_meta"] == {
        "source_w": 1470,
        "source_h": 956,
        "crop_x": 0,
        "crop_y": 0,
        "crop_w": 1470,
        "crop_h": 956,
        "desktop_virtual_bounds": {
            "x": 0,
            "y": 0,
            "width": 1470,
            "height": 956,
        },
        "monitor_id": None,
        "timestamp": payload["capture_meta"]["timestamp"],
        "capture_engine": "pyautogui_fallback",
    }


@pytest.mark.asyncio
async def test_capture_screenshot_keeps_identity_sized_capture(monkeypatch):
    calls = []

    def _screenshot(region=None):
        calls.append(region)
        return _FakeImage(mode="RGBA", size=(1710, 1112))

    _install_fake_modules(
        monkeypatch,
        screenshot_fn=_screenshot,
        desktop_size=(1710, 1112),
    )

    result = await capture_screenshot({})

    assert result["success"] is True
    assert calls == [None]
    assert _FakeImage.resize_calls == []
    payload = result["data"]
    assert payload["capture_meta"]["source_w"] == 1710
    assert payload["capture_meta"]["source_h"] == 1112
    assert payload["capture_meta"]["crop_w"] == 1710
    assert payload["capture_meta"]["crop_h"] == 1112


@pytest.mark.asyncio
async def test_capture_screenshot_import_error_returns_failure(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyautogui", None)
    monkeypatch.setitem(sys.modules, "PIL", None)

    result = await capture_screenshot({})

    assert result["success"] is False
    assert "Required library not available" in result["error"]


@pytest.mark.asyncio
async def test_capture_screenshot_runtime_error_returns_failure(monkeypatch):
    def _broken_screenshot(region=None):  # noqa: ARG001
        raise RuntimeError("device busy")

    _install_fake_modules(monkeypatch, screenshot_fn=_broken_screenshot)

    result = await capture_screenshot({})

    assert result["success"] is False
    assert "Screenshot failed: device busy" == result["error"]


@pytest.mark.asyncio
async def test_capture_screenshot_windows_uses_native_cursor_capture_path(monkeypatch):
    image = _FakeImage(mode="RGB")
    called = {"windows_capture": False}

    def _screenshot(region=None):  # noqa: ARG001
        raise AssertionError("pyautogui.screenshot should not be used on Windows path")

    _install_fake_modules(
        monkeypatch, screenshot_fn=_screenshot, stub_system_capture=False
    )
    monkeypatch.setattr(screenshot_tool, "_is_windows_platform", lambda: True)

    def _fake_windows_capture(region=None):
        called["windows_capture"] = True
        return image

    monkeypatch.setattr(
        screenshot_tool, "_capture_with_windows_cursor", _fake_windows_capture
    )

    result = await capture_screenshot({})

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
    monkeypatch.setattr(
        screenshot_tool, "_capture_with_linux_cursor", lambda region=None: sentinel
    )

    result = screenshot_tool._capture_with_system_cursor(None)

    assert result is sentinel


def test_capture_with_system_cursor_uses_silent_fallback_on_linux_x11(monkeypatch):
    monkeypatch.setattr(screenshot_tool, "_is_windows_platform", lambda: False)
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Linux")
    monkeypatch.setattr(screenshot_tool, "_is_linux_x11_session", lambda: True)
    monkeypatch.setattr(
        screenshot_tool,
        "_capture_with_linux_cursor",
        lambda region=None: (_ for _ in ()).throw(
            AssertionError("linux native capture should be skipped on x11")
        ),
    )

    result = screenshot_tool._capture_with_system_cursor(None)

    assert result is None


def test_overlay_macos_builtin_cursor_uses_repo_owned_cursor(monkeypatch):
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    overlay_calls = []

    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.position = lambda: SimpleNamespace(x=100, y=150)
    pyautogui_module.size = lambda: SimpleNamespace(width=300, height=200)
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)

    cursor_image = object()
    monkeypatch.setattr(
        screenshot_tool, "_get_macos_builtin_cursor", lambda: (cursor_image, (4, 6))
    )

    monkeypatch.setattr(
        screenshot_tool,
        "_paste_cursor_overlay",
        lambda screenshot, *, cursor_image, draw_x, draw_y: overlay_calls.append(
            {
                "screenshot": screenshot,
                "cursor_image": cursor_image,
                "draw_x": draw_x,
                "draw_y": draw_y,
            }
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


def test_overlay_macos_builtin_cursor_scales_desktop_position_to_screenshot_pixels(
    monkeypatch,
):
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    overlay_calls = []

    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.position = lambda: SimpleNamespace(x=100, y=150)
    pyautogui_module.size = lambda: SimpleNamespace(width=300, height=200)
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)

    cursor_image = object()
    monkeypatch.setattr(
        screenshot_tool, "_get_macos_builtin_cursor", lambda: (cursor_image, (0, 0))
    )

    monkeypatch.setattr(
        screenshot_tool,
        "_paste_cursor_overlay",
        lambda screenshot, *, cursor_image, draw_x, draw_y: overlay_calls.append(
            {
                "screenshot": screenshot,
                "cursor_image": cursor_image,
                "draw_x": draw_x,
                "draw_y": draw_y,
            }
        ),
    )

    screenshot = _FakeImage(mode="RGBA", size=(600, 400))
    result = screenshot_tool._overlay_macos_builtin_cursor(
        screenshot,
        region=(10, 20, 300, 200),
    )

    assert result is True
    assert overlay_calls == [
        {
            "screenshot": screenshot,
            "cursor_image": cursor_image,
            "draw_x": 180,
            "draw_y": 260,
        }
    ]


def test_overlay_macos_builtin_cursor_scales_full_desktop_position(monkeypatch):
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    overlay_calls = []

    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.position = lambda: SimpleNamespace(x=1047, y=940)
    pyautogui_module.size = lambda: SimpleNamespace(width=1710, height=1112)
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)

    cursor_image = object()
    monkeypatch.setattr(
        screenshot_tool, "_get_macos_builtin_cursor", lambda: (cursor_image, (0, 0))
    )

    monkeypatch.setattr(
        screenshot_tool,
        "_paste_cursor_overlay",
        lambda screenshot, *, cursor_image, draw_x, draw_y: overlay_calls.append(
            {
                "screenshot": screenshot,
                "cursor_image": cursor_image,
                "draw_x": draw_x,
                "draw_y": draw_y,
            }
        ),
    )

    screenshot = _FakeImage(mode="RGBA", size=(3420, 2224))
    result = screenshot_tool._overlay_macos_builtin_cursor(screenshot, region=None)

    assert result is True
    assert overlay_calls == [
        {
            "screenshot": screenshot,
            "cursor_image": cursor_image,
            "draw_x": 2094,
            "draw_y": 1880,
        }
    ]


def test_overlay_macos_builtin_cursor_returns_false_when_cursor_generation_fails(
    monkeypatch,
):
    monkeypatch.setattr(screenshot_tool.platform, "system", lambda: "Darwin")

    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.position = lambda: SimpleNamespace(x=100, y=150)
    pyautogui_module.size = lambda: SimpleNamespace(width=300, height=200)
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

    assert (
        screenshot_tool._overlay_macos_builtin_cursor(
            screenshot, region=(10, 20, 300, 200)
        )
        is False
    )
