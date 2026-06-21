"""Covers local-runtime Linux window manager behavior."""

from types import SimpleNamespace

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.platform.linux import LinuxWindowManager  # noqa: E402


def _make_manager(monkeypatch) -> LinuxWindowManager:
    monkeypatch.setattr(LinuxWindowManager, "_check_xdotool", lambda self: True)
    manager = LinuxWindowManager()
    manager._available = True
    return manager


def test_select_best_match_normalizes_curly_apostrophe(monkeypatch):
    manager = _make_manager(monkeypatch)
    windows = [
        {
            "title": "High Heel Shoe Keychain Crystal Purse Car Key Chain Bag Decorative Alloy Keyring at Amazon Women\u2019s Clothing store - Google Chrome",
            "hwnd": "1001",
        }
    ]
    requested = "High Heel Shoe Keychain Crystal Purse Car Key Chain Bag Decorative Alloy Keyring at Amazon Women's Clothing store - Google Chrome"

    target = manager._select_best_match(windows, requested)

    assert target is not None
    assert target["hwnd"] == "1001"


def test_select_best_match_rejects_ambiguous_fuzzy_candidates(monkeypatch):
    manager = _make_manager(monkeypatch)
    windows = [
        {"title": "Chrome - Example Product Page A", "hwnd": "2001"},
        {"title": "Chrome - Example Product Page B", "hwnd": "2002"},
    ]

    target = manager._select_best_match(windows, "Chrome - Example Product Page")

    assert target is None


def test_switch_to_window_activates_best_match_window(monkeypatch):
    manager = _make_manager(monkeypatch)
    monkeypatch.setattr(
        manager,
        "get_windows",
        lambda: [
            {
                "title": "High Heel Shoe Keychain Crystal Purse Car Key Chain Bag Decorative Alloy Keyring at Amazon Women\u2019s Clothing store - Google Chrome",
                "hwnd": "3001",
            },
            {"title": "Project Alpha Notes", "hwnd": "3002"},
        ],
    )

    called = {}

    def fake_run(cmd, **_kwargs):
        called["cmd"] = cmd
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("core.platform.linux.subprocess.run", fake_run)

    result = manager.switch_to_window(
        "High Heel Shoe Keychain Crystal Purse Car Key Chain Bag Decorative Alloy Keyring at Amazon Women's Clothing store - Google Chrome"
    )

    assert result is True
    assert called["cmd"] == ["xdotool", "windowactivate", "3001"]


def test_switch_to_window_returns_false_when_no_match(monkeypatch):
    manager = _make_manager(monkeypatch)
    monkeypatch.setattr(
        manager,
        "get_windows",
        lambda: [{"title": "Project Alpha Notes", "hwnd": "4001"}],
    )

    result = manager.switch_to_window("Unmatched Title")

    assert result is False
