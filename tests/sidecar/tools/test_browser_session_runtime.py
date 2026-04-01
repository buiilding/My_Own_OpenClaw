from pathlib import Path

from tools.browser.session_runtime import BrowserSessionRuntime


def test_browser_session_runtime_reports_connection_and_current_page_metadata():
    runtime = BrowserSessionRuntime()

    class Page:
        url = "https://example.com"
        title = "Example"

    runtime.context = object()
    runtime.page = Page()

    assert runtime.is_connected is True
    assert runtime.current_url == "https://example.com"
    assert runtime.current_title == "Example"


def test_browser_session_runtime_reset_clears_live_state():
    runtime = BrowserSessionRuntime(
        context=object(),
        page=object(),
        cdp_url="http://127.0.0.1:9222",
        mode="managed",
        user_data_dir=Path("/tmp/windieos"),
        browser_process=object(),
        headless=True,
        trace_active=True,
    )

    runtime.reset()

    assert runtime.is_connected is False
    assert runtime.current_url == ""
    assert runtime.current_title == ""
    assert runtime.cdp_url is None
    assert runtime.mode is None
    assert runtime.user_data_dir is None
    assert runtime.browser_process is None
    assert runtime.headless is False
    assert runtime.trace_active is False
