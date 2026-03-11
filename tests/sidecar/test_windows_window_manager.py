import ctypes
from types import SimpleNamespace

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.platform.windows import WindowsWindowManager  # noqa: E402


class _FakeUser32:
    def __init__(self, *, foreground_result: int):
        self._foreground_result = foreground_result

    def EnumWindows(self, _callback, _param):
        return True

    def IsWindowVisible(self, _hwnd):
        return True

    def GetWindowTextLengthW(self, _hwnd):
        return len("Terminal")

    def GetWindowTextW(self, _hwnd, buffer, _length):
        buffer.value = "Terminal"
        return len(buffer.value)

    def IsIconic(self, _hwnd):
        return False

    def ShowWindow(self, _hwnd, _cmd):
        return True

    def BringWindowToTop(self, _hwnd):
        return True

    def SetForegroundWindow(self, _hwnd):
        return self._foreground_result

    def GetForegroundWindow(self):
        return 1


def _install_fake_user32(monkeypatch, *, foreground_result: int):
    monkeypatch.setattr(
        ctypes,
        "windll",
        SimpleNamespace(user32=_FakeUser32(foreground_result=foreground_result)),
        raising=False,
    )


def test_windows_window_manager_switch_to_window_returns_true_when_foreground_call_succeeds(monkeypatch):
    _install_fake_user32(monkeypatch, foreground_result=1)
    manager = WindowsWindowManager()
    monkeypatch.setattr(manager, "get_windows", lambda: [{"title": "Terminal", "hwnd": 1}])

    assert manager.switch_to_window("Terminal") is True


def test_windows_window_manager_switch_to_window_returns_false_when_foreground_call_fails(monkeypatch):
    _install_fake_user32(monkeypatch, foreground_result=0)
    manager = WindowsWindowManager()
    monkeypatch.setattr(manager, "get_windows", lambda: [{"title": "Terminal", "hwnd": 1}])

    assert manager.switch_to_window("Terminal") is False
