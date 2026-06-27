"""Covers local-runtime macOS window manager behavior."""

import builtins
import logging
import sys
from types import SimpleNamespace

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.platform.macos import MacOSWindowManager  # noqa: E402


class _FakeApp:
    def __init__(self, name, *, activation_policy=0, hidden=False, pid=0):
        self._name = name
        self._activation_policy = activation_policy
        self._hidden = hidden
        self._pid = pid
        self.activated = False

    def localizedName(self):
        return self._name

    def activationPolicy(self):
        return self._activation_policy

    def isHidden(self):
        return self._hidden

    def processIdentifier(self):
        return self._pid

    def activateWithOptions_(self, _options):
        self.activated = True


class _FakeQuartzNSDictionary:
    def __init__(self, data):
        self._data = data

    def get(self, key, default=None):
        return self._data.get(key, default)

    def __iter__(self):
        return iter(self._data.items())

    def __repr__(self):
        return repr(self._data)


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
            NSApplicationActivationPolicyRegular=0,
            NSApplicationActivateIgnoringOtherApps=1,
        ),
    )


def _install_fake_application_services(
    monkeypatch,
    *,
    trusted=True,
    app_windows_by_pid=None,
    focused_window_by_pid=None,
):
    app_windows_by_pid = app_windows_by_pid or {}
    focused_window_by_pid = focused_window_by_pid or {}

    class _FakeApplicationServices:
        kAXWindowsAttribute = "AXWindows"
        kAXTitleAttribute = "AXTitle"
        kAXMinimizedAttribute = "AXMinimized"
        kAXMainAttribute = "AXMain"
        kAXFocusedWindowAttribute = "AXFocusedWindow"
        kAXErrorSuccess = 0
        kAXErrorAPIDisabled = -25211

        @staticmethod
        def AXIsProcessTrusted():
            return trusted

        @staticmethod
        def AXUIElementCreateApplication(pid):
            return ("app", pid)

        @staticmethod
        def AXUIElementCopyAttributeValue(element, attribute, _unused):
            kind, value = element
            if kind == "app":
                if attribute == _FakeApplicationServices.kAXWindowsAttribute:
                    if value not in app_windows_by_pid:
                        return (_FakeApplicationServices.kAXErrorAPIDisabled, None)
                    return (
                        _FakeApplicationServices.kAXErrorSuccess,
                        app_windows_by_pid.get(value) or [],
                    )
                if attribute == _FakeApplicationServices.kAXFocusedWindowAttribute:
                    focused_window = focused_window_by_pid.get(value)
                    if focused_window is None:
                        return (_FakeApplicationServices.kAXErrorAPIDisabled, None)
                    return (_FakeApplicationServices.kAXErrorSuccess, focused_window)

            if kind == "window":
                return (
                    _FakeApplicationServices.kAXErrorSuccess,
                    value.get(attribute),
                )

            return (_FakeApplicationServices.kAXErrorAPIDisabled, None)

    monkeypatch.setitem(
        sys.modules,
        "ApplicationServices",
        _FakeApplicationServices,
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
        if name in {"AppKit", "ApplicationServices", "Quartz"}:
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
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Terminal", "name": "Terminal - repo", "layer": 0, "alpha": 1, "id": 1},
            {"owner": "Dock", "name": "", "layer": 20, "alpha": 1, "id": 2},
            {"owner": "Safari", "name": "Start Page", "layer": 0, "alpha": 1, "id": 3},
        ],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "Terminal - repo", "hwnd": 1, "app_name": "Terminal"},
        {"title": "Start Page", "hwnd": 3, "app_name": "Safari"},
    ]


def test_macos_window_manager_get_windows_falls_back_to_running_apps_when_quartz_is_empty(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp("Safari")],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "Terminal", "hwnd": None, "app_name": "Terminal"},
        {"title": "Safari", "hwnd": None, "app_name": "Safari"},
    ]


def test_macos_window_manager_get_windows_drops_unnamed_quartz_surfaces(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Messages"), _FakeApp("Google Chrome")],
        active_app={"NSApplicationName": "Google Chrome"},
    )
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Messages", "name": "", "layer": 0, "alpha": 1, "id": 1},
            {"owner": "Messages", "name": "", "layer": 0, "alpha": 1, "id": 2},
            {"owner": "Google Chrome", "name": "New Tab", "layer": 0, "alpha": 1, "id": 3},
        ],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "New Tab", "hwnd": 3, "app_name": "Google Chrome"},
    ]


def test_macos_window_manager_get_windows_prefers_accessibility_windows(monkeypatch):
    apps = [
        _FakeApp("Codex", pid=101),
        _FakeApp("Google Chrome", pid=202),
    ]
    _install_fake_appkit(
        monkeypatch,
        apps=apps,
        active_app={"NSApplicationName": "Codex"},
    )
    _install_fake_application_services(
        monkeypatch,
        trusted=True,
        app_windows_by_pid={
            101: [
                ("window", {"AXTitle": "Codex", "AXMinimized": False, "AXMain": True}),
            ],
            202: [
                ("window", {"AXTitle": "Mail - Outlook", "AXMinimized": False, "AXMain": True}),
                ("window", {"AXTitle": "Hidden", "AXMinimized": True, "AXMain": False}),
            ],
        },
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Dock", "name": "", "layer": 20, "alpha": 1, "id": 2},
        ],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "Codex", "hwnd": None, "app_name": "Codex"},
        {"title": "Mail - Outlook", "hwnd": None, "app_name": "Google Chrome"},
    ]


def test_macos_window_manager_get_windows_merges_quartz_for_apps_without_accessibility_windows(monkeypatch):
    apps = [
        _FakeApp("Ghostty", pid=101),
        _FakeApp("Google Chrome", pid=202),
    ]
    _install_fake_appkit(
        monkeypatch,
        apps=apps,
        active_app={"NSApplicationName": "Google Chrome"},
    )
    _install_fake_application_services(
        monkeypatch,
        trusted=True,
        app_windows_by_pid={
            101: [],
            202: [
                ("window", {"AXTitle": "Mail - Outlook", "AXMinimized": False, "AXMain": True}),
            ],
        },
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Ghostty", "name": "Ghostty", "layer": 0, "alpha": 1, "id": 51},
            {"owner": "Google Chrome", "name": "Old Quartz Title", "layer": 0, "alpha": 1, "id": 52},
        ],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [
        {"title": "Mail - Outlook", "hwnd": None, "app_name": "Google Chrome"},
        {"title": "Ghostty", "hwnd": 51, "app_name": "Ghostty"},
    ]


def test_macos_window_manager_accepts_mapping_like_quartz_records(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp("Google Chrome")],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            _FakeQuartzNSDictionary(
                {"owner": "Google Chrome", "name": "Inbox", "layer": 0, "alpha": 1, "id": 12}
            ),
            _FakeQuartzNSDictionary(
                {"owner": "Dock", "name": "", "layer": 20, "alpha": 1, "id": 13}
            ),
        ],
    )
    manager = MacOSWindowManager()

    assert manager.get_windows() == [{"title": "Inbox", "hwnd": 12, "app_name": "Google Chrome"}]


def test_macos_window_manager_logs_quartz_filter_debug_summary(monkeypatch, caplog):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal")],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Dock", "name": "", "layer": 20, "alpha": 1, "id": 1},
            {"owner": "Ghost", "name": "Hidden", "layer": 0, "alpha": 0, "id": 2},
            {"owner": "", "name": "", "layer": 0, "alpha": 1, "id": 3},
            "invalid-window-record",
        ],
    )
    manager = MacOSWindowManager()

    with caplog.at_level(logging.DEBUG, logger="core.platform.macos"):
        assert manager.get_windows() == [{"title": "Terminal", "hwnd": None, "app_name": "Terminal"}]

    assert (
        "Quartz window enumeration debug (on_screen_only=False): raw=4 usable=0 "
        "dropped_non_dict=1 dropped_non_regular_app=3 dropped_layer=0 dropped_alpha=0 dropped_title=0"
    ) in caplog.text
    assert "Quartz window enumeration samples:" in caplog.text
    assert "drop_non_regular_app" in caplog.text
    assert "drop_non_dict" in caplog.text


def test_macos_window_manager_get_active_window(monkeypatch):
    notes = _FakeApp("Notes", pid=404)
    _install_fake_appkit(monkeypatch, apps=[notes], active_app={"NSApplicationName": "Notes"})
    _install_fake_application_services(
        monkeypatch,
        trusted=True,
        focused_window_by_pid={
            404: ("window", {"AXTitle": "Shopping List"}),
        },
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[{"owner": "Notes", "name": "Notes", "layer": 0, "alpha": 1, "id": 5}],
        on_screen_windows=[{"owner": "Notes", "name": "Shopping List", "layer": 0, "alpha": 1, "id": 6}],
    )
    manager = MacOSWindowManager()

    assert manager.get_active_window() == {
        "title": "Shopping List",
        "hwnd": None,
        "app_name": "Notes",
    }


def test_macos_window_manager_switch_to_window_raises_specific_window(monkeypatch):
    target = _FakeApp("Google Chrome", pid=777)
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), target],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(
        monkeypatch,
        trusted=True,
        app_windows_by_pid={
            777: [
                ("window", {"AXTitle": "Inbox", "AXMinimized": False, "AXMain": True}),
            ],
        },
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


def test_macos_window_manager_switch_to_window_matches_app_name(monkeypatch):
    target = _FakeApp("Google Chrome", pid=888)
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), target],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(
        monkeypatch,
        trusted=True,
        app_windows_by_pid={
            888: [
                ("window", {"AXTitle": "my prompts - Google Docs", "AXMinimized": False, "AXMain": True}),
            ],
        },
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Google Chrome", "name": "my prompts - Google Docs", "layer": 0, "alpha": 1, "id": 10},
        ],
        on_screen_windows=[
            {"owner": "Google Chrome", "name": "my prompts - Google Docs", "layer": 0, "alpha": 1, "id": 10},
        ],
    )
    run_calls = []

    def fake_run(cmd, **_kwargs):
        run_calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="true\n")

    monkeypatch.setattr("core.platform.macos.subprocess.run", fake_run)
    monkeypatch.setattr("core.platform.macos.time.sleep", lambda *_args, **_kwargs: None)
    manager = MacOSWindowManager()

    assert manager.switch_to_window("google chrome") is True
    assert target.activated is True
    assert len(run_calls) == 1


def test_macos_window_manager_switch_to_window_accepts_app_level_match_when_active_window_title_differs(monkeypatch):
    target = _FakeApp("Finder", pid=999)
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), target],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(
        monkeypatch,
        trusted=True,
        app_windows_by_pid={
            999: [
                ("window", {"AXTitle": "", "AXMinimized": False, "AXMain": True}),
            ],
        },
    )
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {"owner": "Finder", "name": "Downloads", "layer": 0, "alpha": 1, "id": 10},
        ],
        on_screen_windows=[
            {"owner": "Finder", "name": "Downloads", "layer": 0, "alpha": 1, "id": 10},
        ],
    )

    def fake_raise(self, _app_name, _window_name, *, match_index=1):
        return True

    monkeypatch.setattr(MacOSWindowManager, "_raise_window_via_applescript", fake_raise)
    monkeypatch.setattr(
        MacOSWindowManager,
        "get_active_window",
        lambda self: {"title": "Downloads", "hwnd": None, "app_name": "Finder"},
    )
    monkeypatch.setattr("core.platform.macos.time.sleep", lambda *_args, **_kwargs: None)
    manager = MacOSWindowManager()

    assert manager.switch_to_window("finder") is True
    assert target.activated is True


def test_macos_window_manager_switch_to_window_uses_duplicate_index_for_resolved_window(monkeypatch):
    target = _FakeApp("Google Chrome", pid=111)
    _install_fake_appkit(
        monkeypatch,
        apps=[target],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[
            {
                "owner": "Google Chrome",
                "name": "New Tab - Google Chrome",
                "layer": 0,
                "alpha": 1,
                "id": 10,
            },
            {
                "owner": "Google Chrome",
                "name": "New Tab - Google Chrome",
                "layer": 0,
                "alpha": 1,
                "id": 11,
            },
        ],
        on_screen_windows=[
            {
                "owner": "Google Chrome",
                "name": "New Tab - Google Chrome",
                "layer": 0,
                "alpha": 1,
                "id": 11,
            },
        ],
    )
    run_calls = []

    def fake_run(cmd, **_kwargs):
        run_calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="true\n")

    monkeypatch.setattr("core.platform.macos.subprocess.run", fake_run)
    monkeypatch.setattr("core.platform.macos.time.sleep", lambda *_args, **_kwargs: None)
    manager = MacOSWindowManager()

    assert (
        manager.switch_to_window(
            {
                "title": "New Tab - Google Chrome",
                "app_name": "Google Chrome",
                "_switch_duplicate_index": 2,
            }
        )
        is True
    )
    assert target.activated is True
    assert len(run_calls) == 1
    assert "item 2 of matchingWindows" in run_calls[0][2]


def test_macos_window_manager_switch_to_window_returns_false_when_missing(monkeypatch):
    _install_fake_appkit(
        monkeypatch,
        apps=[_FakeApp("Terminal"), _FakeApp("Safari")],
        active_app={"NSApplicationName": "Terminal"},
    )
    _install_fake_application_services(monkeypatch, trusted=False)
    _install_fake_quartz(
        monkeypatch,
        all_windows=[{"owner": "Safari", "name": "Docs", "layer": 0, "alpha": 1, "id": 4}],
    )
    manager = MacOSWindowManager()

    assert manager.switch_to_window("mail") is False
