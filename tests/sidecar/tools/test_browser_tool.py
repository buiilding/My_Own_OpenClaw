"""Tests for the Windie browser tool entrypoint."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_tool import execute_browser

EXPLANATION = "Advance the active user task."


def _connected_controller() -> SimpleNamespace:
    page = mock.AsyncMock()
    page.url = "https://example.com"
    page.title = mock.AsyncMock(return_value="Example")
    controller = SimpleNamespace(
        is_connected=True,
        _page=page,
        _context=SimpleNamespace(pages=[page]),
        auto_connect_to_chrome=mock.AsyncMock(),
        close=mock.AsyncMock(),
        get_status=mock.AsyncMock(
            return_value={
                "connected": True,
                "mode": "user_chrome",
                "url": "https://example.com",
                "title": "Example",
                "tab_count": 1,
                "target_id": "tab-1",
            }
        ),
        navigate=mock.AsyncMock(
            return_value={
                "success": True,
                "url": "https://example.com",
                "title": "Example",
            }
        ),
        open_tab=mock.AsyncMock(
            return_value={
                "success": True,
                "target_id": "tab-2",
                "url": "https://example.com",
                "title": "Example",
            }
        ),
        wait_for_load=mock.AsyncMock(return_value={"success": True, "state": "load"}),
        get_page_snapshot=mock.AsyncMock(
            return_value={
                "snapshot": "hello world",
                "url": "https://example.com",
                "title": "Example",
                "ref_count": 0,
                "refs": {},
            }
        ),
        click=mock.AsyncMock(return_value={"success": True}),
        click_coordinates=mock.AsyncMock(return_value={"success": True}),
        type_text=mock.AsyncMock(return_value={"success": True}),
        press_key=mock.AsyncMock(return_value={"success": True}),
        scroll=mock.AsyncMock(return_value={"success": True}),
        screenshot=mock.AsyncMock(return_value=b"png-bytes"),
        get_tabs=mock.AsyncMock(return_value=[]),
        evaluate=mock.AsyncMock(return_value={"success": True, "result": {"ok": True}}),
        get_dropdown_options=mock.AsyncMock(return_value={"success": True, "options": []}),
        select_dropdown=mock.AsyncMock(return_value={"success": True}),
        set_input_files=mock.AsyncMock(return_value={"success": True}),
        _ensure_page_observers=lambda page: None,
        _get_ref_registry=lambda page: None,
        _reset_ref_registry=lambda page: None,
    )
    return controller


@pytest.mark.asyncio
async def test_connect_executes_through_runtime() -> None:
    controller = _connected_controller()
    controller.is_connected = False
    controller.auto_connect_to_chrome.return_value = {
        "status": "connected",
        "mode": "user_chrome",
        "url": "https://example.com",
        "title": "Example",
        "auto_launched": True,
    }

    with mock.patch(
        "tools.browser.browser_tool.get_browser_controller", return_value=controller
    ):
        result = await execute_browser({"action": "connect", "explanation": EXPLANATION})

    assert result.success is True
    assert result.data["mode"] == "user_chrome"
    controller.auto_connect_to_chrome.assert_awaited_once_with(
        cdp_url="http://127.0.0.1:9333",
        auto_launch=True,
        headless=False,
    )


@pytest.mark.asyncio
async def test_strict_validation_blocks_runtime_execution() -> None:
    with mock.patch("tools.browser.browser_tool.get_browser_controller") as get_controller:
        result = await execute_browser({"action": "snapshot", "format": "aria", "explanation": EXPLANATION})

    assert result.success is False
    assert "format" in (result.error or "")
    get_controller.assert_not_called()


@pytest.mark.asyncio
async def test_search_dispatches_to_navigation() -> None:
    controller = _connected_controller()

    with mock.patch(
        "tools.browser.browser_tool.get_browser_controller", return_value=controller
    ):
        result = await execute_browser({"action": "search", "query": "pricing tiers", "explanation": EXPLANATION})

    assert result.success is True
    controller.navigate.assert_awaited_once()
    called_url = controller.navigate.await_args.args[0]
    assert "google.com/search" in called_url
    assert "pricing+tiers" in called_url


@pytest.mark.asyncio
async def test_not_connected_runtime_error_preserves_code() -> None:
    controller = _connected_controller()
    controller.is_connected = False
    controller._page = None
    controller._context = None

    with mock.patch(
        "tools.browser.browser_tool.get_browser_controller", return_value=controller
    ):
        result = await execute_browser({"action": "status", "explanation": EXPLANATION})

    assert result.success is True

    with mock.patch(
        "tools.browser.browser_tool.get_browser_controller", return_value=controller
    ):
        failed = await execute_browser({"action": "find_text", "text": "hello", "explanation": EXPLANATION})

    assert failed.success is False
    assert failed.data == {"error_code": "BROWSER_NOT_CONNECTED", "action": "find_text"}


@pytest.mark.asyncio
async def test_find_text_accepts_css_scope_and_max_results() -> None:
    controller = _connected_controller()

    with (
        mock.patch(
            "tools.browser.browser_tool.get_browser_controller", return_value=controller
        ),
        mock.patch(
            "tools.browser.windie_runtime.capture_scoped_html",
            new=mock.AsyncMock(return_value=("<main>Hello, sign in. Hello, sign in.</main>", "#search")),
        ) as capture_scoped_html,
        mock.patch(
            "tools.browser.windie_runtime.html_to_markdown",
            return_value="Hello, sign in. Hello, sign in.",
        ) as html_to_markdown,
    ):
        result = await execute_browser(
            {
                "action": "find_text",
                "text": "Hello, sign in",
                "css_scope": "#search",
                "max_results": 1,
                "explanation": EXPLANATION,
            }
        )

    assert result.success is True
    assert result.data["match_count"] == 1
    assert result.data["matches"][0]["match"] == "Hello, sign in"
    capture_scoped_html.assert_awaited_once_with(controller._page, selector="#search")
    html_to_markdown.assert_called_once()


@pytest.mark.asyncio
async def test_removed_alias_returns_invalid_argument_error() -> None:
    with mock.patch("tools.browser.browser_tool.get_browser_controller"):
        result = await execute_browser({"action": "open", "url": "https://example.com", "explanation": EXPLANATION})

    assert result.success is False
    assert "open" in (result.error or "")


@pytest.mark.asyncio
async def test_switch_with_activate_false_keeps_browser_tab_in_background() -> None:
    controller = _connected_controller()
    background_page = mock.AsyncMock()
    background_page.url = "https://example.org"
    background_page.title = mock.AsyncMock(return_value="Example Org")
    controller._context = SimpleNamespace(pages=[controller._page, background_page])

    with mock.patch(
        "tools.browser.browser_tool.get_browser_controller", return_value=controller
    ):
        result = await execute_browser(
            {
                "action": "switch",
                "tab_id": str(id(background_page)),
                "activate": False,
                "explanation": EXPLANATION,
            }
        )

    assert result.success is True
    assert result.data["target_id"] == str(id(background_page))
    assert result.data["activated"] is False
    assert controller._page is background_page
    background_page.bring_to_front.assert_not_awaited()
