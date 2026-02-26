import base64
import sys
from types import ModuleType, SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import screenshot_tool  # noqa: E402


class _FakeImage:
    def __init__(self, mode="RGBA"):
        self.mode = mode

    def convert(self, mode):
        return _FakeImage(mode=mode)

    def save(self, buffer, format, quality, optimize, progressive):  # noqa: A002
        assert format == "JPEG"
        assert quality == 85
        assert optimize is False
        assert progressive is False
        buffer.write(b"fake-jpeg-bytes")


def _install_fake_modules(monkeypatch, *, screenshot_fn):
    pyautogui_module = ModuleType("pyautogui")
    pyautogui_module.screenshot = screenshot_fn
    pil_module = ModuleType("PIL")
    pil_module.Image = object()
    monkeypatch.setitem(sys.modules, "pyautogui", pyautogui_module)
    monkeypatch.setitem(sys.modules, "PIL", pil_module)


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
    assert base64.b64decode(payload["screenshot"]) == b"fake-jpeg-bytes"
    assert payload["size"] == int(len(payload["screenshot"]) * 0.75)


@pytest.mark.asyncio
async def test_capture_screenshot_import_error_returns_failure(monkeypatch):
    monkeypatch.delitem(sys.modules, "pyautogui", raising=False)
    monkeypatch.delitem(sys.modules, "PIL", raising=False)

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
