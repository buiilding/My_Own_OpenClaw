import builtins
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

    monkeypatch.setitem(
        sys.modules,
        "AppKit",
        SimpleNamespace(
            NSWorkspace=_FakeNSWorkspace,
            NSApplicationActivateIgnoringOtherApps=1,
        ),
    )


def _install_fake_quartz(monkeypatch, *, all_windows, on_screen_windows=None):
    if on_screen_windows is None:
        on_screen_windows = all_windows

    class _FakeQuartz:
        kCGWindowListExcludeDesktopElements = 0x01
        kCGWindowListOptionOnScreenOnly = 0x02
        kCGWindowListOptionAll = 0x04
        kCGNullWindowID = 0
        kCGWindowOwnerName = "owner"
        kCGWindowName = "name"
        kCGWindowLayer = "layer"
        kCGWindowAlpha = "alpha"
        kCGWindowNumber = "id"

        @staticmethod
        def CGWindowListCopyWindowInfo(options, _window_id):
            if options & _FakeQuartz.kCGWindowListOptionOnScreenOnly:
                return on_screen_windows
            return all_windows

    monkeypatch.setitem(sys.modules, "Quartz", _FakeQuartz)


def test_macos_window_manager_unavailable_without_appkit(monkeypatch):
    real_import = builtins.__import__

    def _fake_import(name, *args, **kwargs):
        if name in {"AppKit", "Quartz"}:
            raise ImportError("missing test dependency")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _fake_import)

    manager = MacOSWindowManager()

    assert manager.get_windows() == []
    assert manager.get_active_window() is None
    assert manager.switch_to_window("anything") is False


def test_macos_window_manager_get_windows_prefers_window_titles(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp(None), _FakeApp("Safari")],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Terminal", "name": "Terminal - repo", "layer": 0, "alpha": 1, "id": 1},
            {"owner": "Dock", "name": "", "layer": 20, "alpha": 1, "id": 2},
            {"owner": "Safari", "name": "", "layer": 0, "alpha": 1, "id": 3},
        ],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "Terminal - repo", "hwnd": 1},
        {"title": "Safari", "hwnd": 3},
    ]


def test_macos_window_manager_get_active_window(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Notes")],
        active_app={"NSApplicationName": "Notes"},
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[{"owner": "Notes", "name": "Notes", "layer": 0, "alpha": 1, "id": 5}],
        on_screen_windows=[{"owner": "Notes", "name": "Shopping List", "layer": 0, "alpha": 1, "id": 6}],
    )
    manager = MacOSWindowManager()

    assert manager.get_active_window() == {
        "title": "Shopping List",
        "hwnd": 6,
        "app_name": "Notes",
    }


def test_macos_window_manager_switch_to_window_raises_specific_window(monkeypatch):
    target = _FakeApp("Google Chrome")
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), target],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Google Chrome", "name": "Inbox", "layer": 0, "alpha": 1, "id": 10},
            {"owner": "Terminal", "name": "repo", "layer": 0, "alpha": 1, "id": 11},
        ],
        on_screen_windows=[
            {"owner": "Google Chrome", "name": "Inbox", "layer": 0, "alpha": 1, "id": 10},
        ],
    )
    run_calls = []

    def fake_run(cmd, **_kwargs):
        run_calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="true\n")

    monkeypatch.setattr("core.platform.macos.subprocess.run", fake_run)
    monkeypatch.setattr("core.platform.macos.time.sleep", lambda *_args, **_kwargs: None)
    manager = MacOSWindowManager()

    assert manager.switch_to_window("inbox") is True
    assert target.activated is True
    assert len(run_calls) == 1
    assert run_calls[0][:2] == ["osascript", "-e"]
    assert 'process "Google Chrome"' in run_calls[0][2]
    assert 'window whose name is "Inbox"' in run_calls[0][2]


def test_macos_window_manager_switch_to_window_returns_false_when_missing(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp("Safari")],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[{"owner": "Safari", "name": "Docs", "layer": 0, "alpha": 1, "id": 4}],
    )
    manager = MacOSWindowManager()

    assert manager.switch_to_window("mail") is False
