"""Covers local-runtime Windows window manager behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.platform.windows import WindowsWindowManager  # noqa: E402


class _FakeUser32:
    def __init__(self):
        self.foreground_hwnd = 101
        self.iconic_windows = set()
        self.titles = {
            101: "Project Alpha Dashboard",
            202: "Target Chrome Window",
        }
        self.attach_calls = []
        self.set_foreground_calls = []
        self.show_calls = []
        self.bring_to_top_calls = []
        self.active_calls = []
        self.focus_calls = []
        self.window_thread_ids = {
            101: 201,
            202: 202,
        }

    def GetWindowTextLengthW(self, hwnd):
        return len(self.titles.get(int(hwnd), ""))

    def GetWindowTextW(self, hwnd, buffer, _length):
        title = self.titles.get(int(hwnd), "")
        buffer.value = title
        return len(title)

    def GetForegroundWindow(self):
        return self.foreground_hwnd

    def GetWindowThreadProcessId(self, hwnd, _pid):
        return self.window_thread_ids.get(int(hwnd), 0)

    def AttachThreadInput(self, source_thread_id, destination_thread_id, attach):
        self.attach_calls.append((source_thread_id, destination_thread_id, attach))
        return 1

    def IsIconic(self, hwnd):
        return int(hwnd) in self.iconic_windows

    def ShowWindow(self, hwnd, command):
        self.show_calls.append((int(hwnd), command))
        return 1

    def BringWindowToTop(self, hwnd):
        self.bring_to_top_calls.append(int(hwnd))
        return 1

    def SetActiveWindow(self, hwnd):
        self.active_calls.append(int(hwnd))
        return 1

    def SetFocus(self, hwnd):
        self.focus_calls.append(int(hwnd))
        return 1

    def SetForegroundWindow(self, hwnd):
        self.set_foreground_calls.append(int(hwnd))
        self.foreground_hwnd = int(hwnd)
        return 1


class _FakeKernel32:
    @staticmethod
    def GetCurrentThreadId():
        return 303


def _make_manager(user32=None):
    manager = object.__new__(WindowsWindowManager)
    manager.user32 = user32 or _FakeUser32()
    manager.kernel32 = _FakeKernel32()
    manager.SW_RESTORE = 9
    manager.SW_SHOW = 5
    manager._available = True
    return manager


def test_windows_window_manager_switch_to_window_verifies_foreground(monkeypatch):
    user32 = _FakeUser32()
    user32.iconic_windows.add(202)
    manager = _make_manager(user32)
    monkeypatch.setattr(
        manager,
        "get_windows",
        lambda: [{"title": "Target Chrome Window", "hwnd": 202}],
    )
    monkeypatch.setattr(
        manager,
        "_wait_for_foreground_window",
        lambda hwnd, target_title: hwnd == 202 and target_title == "Target Chrome Window",
    )

    result = manager.switch_to_window("Target Chrome Window")

    assert result is True
    assert user32.show_calls[0] == (202, manager.SW_RESTORE)
    assert user32.set_foreground_calls == [202]
    assert user32.bring_to_top_calls == [202]
    assert user32.active_calls == [202]
    assert user32.focus_calls == [202]


def test_windows_window_manager_returns_false_when_foreground_verification_fails(monkeypatch):
    user32 = _FakeUser32()
    manager = _make_manager(user32)
    monkeypatch.setattr(
        manager,
        "get_windows",
        lambda: [{"title": "Target Chrome Window", "hwnd": 202}],
    )
    monkeypatch.setattr(
        manager,
        "_wait_for_foreground_window",
        lambda _hwnd, _target_title: False,
    )

    result = manager.switch_to_window("Target Chrome Window")

    assert result is False
    assert user32.set_foreground_calls == [202]
