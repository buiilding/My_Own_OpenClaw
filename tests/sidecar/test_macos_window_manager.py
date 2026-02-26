import sys
from types import SimpleNamespace

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.platform.macos import MacOSWindowManager  # noqa: E402


class _FakeApp:
    def __init__(self, name):
        self._name = name
        self.activated = False

    def localizedName(self):
        return self._name

    def activateWithOptions_(self, _options):
        self.activated = True


def _install_fake_appkit(monkeypatch, *, apps, active_app):
    class _FakeWorkspace:
        def runningApplications(self):
            return apps

        def activeApplication(self):
            return active_app

    class _FakeNSWorkspace:
        @staticmethod
        def sharedWorkspace():
            return _FakeWorkspace()

    monkeypatch.setitem(sys.modules, "AppKit", SimpleNamespace(NSWorkspace=_FakeNSWorkspace))


def test_macos_window_manager_unavailable_without_appkit(monkeypatch):
    monkeypatch.delitem(sys.modules, "AppKit", raising=False)

    manager = MacOSWindowManager()

    assert manager.get_windows() == []
    assert manager.get_active_window() is None
    assert manager.switch_to_window("anything") is False


def test_macos_window_manager_get_windows_filters_empty_names(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp(None), _FakeApp("Safari")],
        active_app={"NSApplicationName": "Terminal"},
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "Terminal", "hwnd": None},
        {"title": "Safari", "hwnd": None},
    ]


def test_macos_window_manager_get_active_window(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Notes")],
        active_app={"NSApplicationName": "Notes"},
    )
    manager = MacOSWindowManager()

    assert manager.get_active_window() == {"title": "Notes", "hwnd": None}


def test_macos_window_manager_switch_to_window_is_case_insensitive(monkeypatch):
    target = _FakeApp("Google Chrome")
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), target],
        active_app={"NSApplicationName": "Terminal"},
    )
    manager = MacOSWindowManager()

    assert manager.switch_to_window("chrome") is True
    assert target.activated is True


def test_macos_window_manager_switch_to_window_returns_false_when_missing(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp("Safari")],
        active_app={"NSApplicationName": "Terminal"},
    )
    manager = MacOSWindowManager()

    assert manager.switch_to_window("mail") is False
