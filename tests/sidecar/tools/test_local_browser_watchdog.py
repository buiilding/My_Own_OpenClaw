from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog


def test_missing_browser_error_message_linux_includes_install_hint():
    message = LocalBrowserWatchdog._build_missing_browser_error_message("Linux")
    assert "No local Chrome/Chromium browser installation detected" in message
    assert "Install Chrome or Chromium" in message
    assert "apt install" in message


def test_missing_browser_error_message_windows_includes_browser_names():
    message = LocalBrowserWatchdog._build_missing_browser_error_message("Windows")
    assert "No local Chrome/Chromium browser installation detected" in message
    assert "Google Chrome" in message
    assert "Microsoft Edge" in message
