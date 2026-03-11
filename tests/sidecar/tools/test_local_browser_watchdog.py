from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog


def test_missing_browser_error_message_linux_includes_install_hint():
    message = LocalBrowserWatchdog._build_missing_browser_error_message("Linux")
    assert "No supported Chrome or Chromium browser binary was found" in message
    assert "Install Chrome, Chromium, Edge, or Brave" in message
    assert "apt install" in message


def test_missing_browser_error_message_windows_includes_browser_names():
    message = LocalBrowserWatchdog._build_missing_browser_error_message("Windows")
    assert "No supported Chrome or Chromium browser binary was found" in message
    assert "Google Chrome" in message
    assert "Microsoft Edge" in message
