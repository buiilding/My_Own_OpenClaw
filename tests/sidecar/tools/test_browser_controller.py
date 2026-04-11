"""
Tests for browser controller module.
"""

import pytest

# Skip all tests if playwright is not installed
pytest.importorskip("playwright")

from unittest import mock
from pathlib import Path

from tools.browser.controller import (
    BrowserController,
    PageSnapshot,
    BrowserTab,
    get_browser_controller,
    reset_browser_controller,
)
from tools.browser.enhanced_cdp_pipeline import EnhancedAiSnapshotResult
from tools.browser.role_snapshot import RoleRef


class TestPageSnapshot:
    """Test PageSnapshot dataclass."""
    
    def test_creation(self):
        """Test creating PageSnapshot."""
        snapshot = PageSnapshot(
            text="Test snapshot",
            url="https://example.com",
            title="Example",
            ref_count=1,
        )
        assert snapshot.text == "Test snapshot"
        assert snapshot.url == "https://example.com"
    
    def test_to_dict(self):
        """Test to_dict method."""
        snapshot = PageSnapshot(
            text="Test",
            url="https://example.com",
            title="Example",
            ref_count=1,
        )
        d = snapshot.to_dict()
        assert d["snapshot"] == "Test"
        assert d["url"] == "https://example.com"
        assert d["ref_count"] == 1


class TestBrowserTab:
    """Test BrowserTab dataclass."""
    
    def test_creation(self):
        """Test creating BrowserTab."""
        tab = BrowserTab(
            target_id="abc123",
            title="Test Page",
            url="https://example.com",
        )
        assert tab.target_id == "abc123"
        assert tab.title == "Test Page"


class TestBrowserControllerBasics:
    """Test BrowserController basic functionality."""
    
    def setup_method(self):
        """Reset controller before each test."""
        reset_browser_controller()
    
    def test_initial_state(self):
        """Test controller initial state."""
        controller = BrowserController()
        assert not controller.is_connected
        assert controller.current_url == ""
        assert controller.current_title == ""
    
    @mock.patch("tools.browser.controller.async_playwright")
    async def test_connect_to_user_chrome(self, mock_playwright):
        """Test connecting to user Chrome."""
        # Mock Playwright
        mock_pw = mock.MagicMock()
        mock_browser = mock.AsyncMock()
        mock_context = mock.AsyncMock()
        mock_page = mock.AsyncMock()
        
        mock_page.url = "https://example.com"
        mock_page.title.return_value = "Example"
        mock_context.pages = [mock_page]
        mock_browser.contexts = [mock_context]
        mock_pw.chromium.connect_over_cdp = mock.AsyncMock(return_value=mock_browser)
        mock_playwright.return_value.start = mock.AsyncMock(return_value=mock_pw)
        
        controller = BrowserController()
        result = await controller.connect_to_user_chrome("http://127.0.0.1:9222")
        
        assert result["status"] == "connected"
        assert result["mode"] == "user_chrome"
        assert controller.is_connected
    
    @mock.patch("tools.browser.controller.async_playwright")
    async def test_connect_to_user_chrome_invalid_url(self, mock_playwright):
        """Test connecting with invalid URL."""
        controller = BrowserController()
        
        with pytest.raises(ValueError, match="localhost"):
            await controller.connect_to_user_chrome("http://example.com:9222")
    
    @mock.patch("tools.browser.controller.async_playwright")
    @mock.patch("tools.browser.controller.find_chrome_executable")
    @mock.patch("tempfile.mkdtemp")
    async def test_launch_managed_browser(
        self, mock_mkdtemp, mock_find_exe, mock_playwright
    ):
        """Test launching managed browser."""
        mock_mkdtemp.return_value = "/tmp/windieos_browser_test"
        mock_find_exe.return_value = mock.Mock(path="/usr/bin/chrome")
        
        mock_pw = mock.MagicMock()
        mock_browser = mock.AsyncMock()
        mock_context = mock.AsyncMock()
        mock_page = mock.AsyncMock()
        
        mock_page.url = "about:blank"
        mock_context.pages = [mock_page]
        mock_context.browser = mock_browser
        mock_pw.chromium.launch_persistent_context = mock.AsyncMock(
            return_value=mock_context
        )
        mock_playwright.return_value.start = mock.AsyncMock(return_value=mock_pw)
        
        controller = BrowserController()
        result = await controller.launch_managed_browser()
        
        assert result["status"] == "launched"
        assert result["mode"] == "managed"
        mock_pw.chromium.launch_persistent_context.assert_awaited_once()
        _, kwargs = mock_pw.chromium.launch_persistent_context.await_args
        assert kwargs["user_data_dir"] == "/tmp/windieos_browser_test"
        assert "--user-data-dir=/tmp/windieos_browser_test" not in kwargs["args"]
    
    @mock.patch("tools.browser.controller.find_chrome_executable")
    async def test_launch_managed_browser_no_chrome(self, mock_find_exe):
        """Test launching when no Chrome found."""
        mock_find_exe.return_value = None
        
        controller = BrowserController()
        
        with pytest.raises(RuntimeError, match="No Chrome"):
            await controller.launch_managed_browser()


class TestBrowserControllerActions:
    """Test browser controller actions."""
    
    def setup_method(self):
        """Setup mock page for each test."""
        self.controller = BrowserController()
        self.controller._page = mock.MagicMock()
        self.controller._page.goto = mock.AsyncMock()
        self.controller._page.title = mock.AsyncMock(return_value="Example")
        self.controller._page.locator = mock.MagicMock()
        self.controller._page.screenshot = mock.AsyncMock()
        self.controller._page.wait_for_load_state = mock.AsyncMock()
        self.controller._page.evaluate = mock.AsyncMock()
        self.controller._page.keyboard = mock.MagicMock()
        self.controller._page.keyboard.press = mock.AsyncMock()
        self.controller._page.mouse = mock.MagicMock()
        self.controller._page.mouse.wheel = mock.AsyncMock()
        self.controller._browser = mock.AsyncMock()
        self.controller._context = mock.AsyncMock()

    def _register_role_ref(self, ref: str, role: str, name: str) -> None:
        target_id = str(id(self.controller._page))
        self.controller._role_refs_by_tab[target_id] = {ref: RoleRef(role=role, name=name)}
        self.controller._role_refs_frame_by_tab[target_id] = None

    def _setup_select_locator(
        self,
        *,
        click_side_effect,
        evaluate_payload,
        select_option_return_value=None,
        select_option_side_effect=None,
    ):
        mock_locator = mock.MagicMock()
        mock_locator.click = mock.AsyncMock(side_effect=click_side_effect)
        mock_locator.dblclick = mock.AsyncMock()
        mock_locator.evaluate = mock.AsyncMock(return_value=evaluate_payload)
        if select_option_side_effect is not None:
            mock_locator.select_option = mock.AsyncMock(side_effect=select_option_side_effect)
        else:
            mock_locator.select_option = mock.AsyncMock(return_value=select_option_return_value)
        self.controller._page.locator.return_value = mock_locator
        return mock_locator

    def _setup_typing_locator(self):
        mock_locator = mock.MagicMock()
        mock_locator.fill = mock.AsyncMock()
        mock_locator.type = mock.AsyncMock()
        mock_locator.press = mock.AsyncMock()
        self.controller._page.locator.return_value = mock_locator
        return mock_locator
    
    @pytest.mark.asyncio
    async def test_navigate(self):
        """Test navigation."""
        self.controller._page.goto.return_value = mock.Mock(status=200)
        self.controller._page.url = "https://example.com"
        self.controller._page.title.return_value = "Example"
        
        result = await self.controller.navigate("https://example.com")
        
        assert result["success"] is True
        assert result["url"] == "https://example.com"
    
    @pytest.mark.asyncio
    async def test_navigate_failure(self):
        """Test navigation failure."""
        self.controller._page.goto.side_effect = Exception("Connection refused")
        
        result = await self.controller.navigate("https://example.com")
        
        assert result["success"] is False
        assert "Connection refused" in result["error"]
    
    @pytest.mark.asyncio
    async def test_click(self):
        """Test clicking element."""
        mock_locator = mock.MagicMock()
        mock_locator.click = mock.AsyncMock()
        mock_locator.dblclick = mock.AsyncMock()
        mock_locator.evaluate = mock.AsyncMock()
        self.controller._page.locator.return_value = mock_locator
        
        result = await self.controller.click("1")
        
        assert result["success"] is True
        mock_locator.click.assert_awaited_once_with(button="left", timeout=2500)
    
    @pytest.mark.asyncio
    async def test_click_failure(self):
        """Test click failure."""
        mock_locator = mock.MagicMock()
        mock_locator.click = mock.AsyncMock(side_effect=Exception("Element not found"))
        mock_locator.evaluate = mock.AsyncMock(side_effect=Exception("Element not found"))
        self.controller._page.locator.return_value = mock_locator
        
        result = await self.controller.click("1")
        
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_click_option_prefers_select_option_fallback(self):
        """Use select_option fallback for option refs when click is intercepted."""
        mock_locator = mock.MagicMock()
        mock_locator.click = mock.AsyncMock(side_effect=Exception("intercepts pointer events"))
        mock_locator.dblclick = mock.AsyncMock()
        mock_locator.evaluate = mock.AsyncMock(
            return_value={
                "source_tag": "option",
                "use_ancestor_select": True,
                "value": "price-asc-rank",
                "label": "Price: Low to High",
                "current_value": "featured-rank",
                "current_label": "Featured",
            }
        )
        parent_select = mock.MagicMock()
        parent_select.select_option = mock.AsyncMock(return_value=["price-asc-rank"])
        mock_locator.locator.return_value = parent_select
        self.controller._page.locator.return_value = mock_locator

        result = await self.controller.click("1")

        assert result["success"] is True
        assert result["strategy"] == "select_option"
        assert result["forced"] is True
        assert result["source_tag"] == "option"
        assert result["selected"] == ["price-asc-rank"]
        parent_select.select_option.assert_awaited_once_with(value="price-asc-rank")
        assert mock_locator.click.await_count == 1

    @pytest.mark.asyncio
    async def test_click_select_prefers_select_option_fallback(self):
        """Use select_option fallback for select refs when click is intercepted."""
        mock_locator = self._setup_select_locator(
            click_side_effect=Exception("intercepts pointer events"),
            evaluate_payload={
                "source_tag": "select",
                "use_ancestor_select": False,
                "value": "price-desc-rank",
                "label": "Price: High to Low",
                "current_value": "price-desc-rank",
                "current_label": "Price: High to Low",
            },
            select_option_return_value=["price-desc-rank"],
        )

        result = await self.controller.click("1")

        assert result["success"] is True
        assert result["strategy"] == "select_option"
        assert result["forced"] is True
        assert result["source_tag"] == "select"
        assert result["selected"] == ["price-desc-rank"]
        mock_locator.select_option.assert_awaited_once_with(value="price-desc-rank")
        assert mock_locator.click.await_count == 1

    @pytest.mark.asyncio
    async def test_click_falls_back_to_force_when_select_option_fails(self):
        """If select_option fallback fails, force-click should still run."""
        mock_locator = self._setup_select_locator(
            click_side_effect=[Exception("intercepts pointer events"), None],
            evaluate_payload={
                "source_tag": "select",
                "use_ancestor_select": False,
                "value": "price-desc-rank",
                "label": "Price: High to Low",
                "current_value": "price-desc-rank",
                "current_label": "Price: High to Low",
            },
            select_option_side_effect=Exception("selection failed"),
        )

        result = await self.controller.click("1")

        assert result["success"] is True
        assert result["strategy"] == "force"
        assert result["forced"] is True
        assert mock_locator.click.await_count == 2
        assert mock_locator.click.await_args_list[1].kwargs["force"] is True

    @pytest.mark.asyncio
    async def test_click_role_ref(self):
        """Test clicking using role-based ref (eN)."""
        role_locator = mock.MagicMock()
        role_locator.click = mock.AsyncMock()
        role_locator.dblclick = mock.AsyncMock()
        role_locator.evaluate = mock.AsyncMock()
        self.controller._page.get_by_role.return_value = role_locator

        self._register_role_ref("e1", "button", "Submit")

        result = await self.controller.click("e1")

        assert result["success"] is True
        self.controller._page.get_by_role.assert_called_once_with("button", name="Submit")

    @pytest.mark.asyncio
    async def test_click_role_ref_prefers_visible_in_viewport_candidate(self):
        """Test role-ref click picks visible in-viewport match when duplicates exist."""
        base_locator = mock.MagicMock()
        base_locator.count = mock.AsyncMock(return_value=3)
        base_locator.evaluate = mock.AsyncMock()

        offscreen = mock.MagicMock()
        offscreen.is_visible = mock.AsyncMock(return_value=True)
        offscreen.bounding_box = mock.AsyncMock(return_value={"x": 0, "y": 1800, "width": 120, "height": 24})
        offscreen.click = mock.AsyncMock()
        offscreen.dblclick = mock.AsyncMock()

        onscreen = mock.MagicMock()
        onscreen.is_visible = mock.AsyncMock(return_value=True)
        onscreen.bounding_box = mock.AsyncMock(return_value={"x": 10, "y": 120, "width": 120, "height": 24})
        onscreen.click = mock.AsyncMock()
        onscreen.dblclick = mock.AsyncMock()
        onscreen.evaluate = mock.AsyncMock()

        hidden = mock.MagicMock()
        hidden.is_visible = mock.AsyncMock(return_value=False)
        hidden.bounding_box = mock.AsyncMock(return_value=None)
        hidden.click = mock.AsyncMock()
        hidden.dblclick = mock.AsyncMock()

        base_locator.nth.side_effect = [hidden, offscreen, onscreen]
        self.controller._page.viewport_size = {"width": 1280, "height": 720}
        self.controller._page.get_by_role.return_value = base_locator

        self._register_role_ref("e9", "combobox", "Sort by:")

        result = await self.controller.click("e9")

        assert result["success"] is True
        assert result["candidate_count"] == 3
        assert result["candidate_index"] == 2
        assert result["strategy"] == "playwright"
        onscreen.click.assert_awaited_once_with(button="left", timeout=2500)
        offscreen.click.assert_not_called()

    @pytest.mark.asyncio
    async def test_click_role_ref_returns_ambiguity_error_when_multiple_in_viewport(self):
        """Test role-ref click fails clearly when multiple visible candidates remain."""
        base_locator = mock.MagicMock()
        base_locator.count = mock.AsyncMock(return_value=2)
        base_locator.evaluate = mock.AsyncMock()

        first = mock.MagicMock()
        first.is_visible = mock.AsyncMock(return_value=True)
        first.bounding_box = mock.AsyncMock(return_value={"x": 10, "y": 120, "width": 120, "height": 24})
        first.click = mock.AsyncMock()
        first.dblclick = mock.AsyncMock()

        second = mock.MagicMock()
        second.is_visible = mock.AsyncMock(return_value=True)
        second.bounding_box = mock.AsyncMock(return_value={"x": 20, "y": 180, "width": 120, "height": 24})
        second.click = mock.AsyncMock()
        second.dblclick = mock.AsyncMock()

        base_locator.nth.side_effect = [first, second]
        self.controller._page.viewport_size = {"width": 1280, "height": 720}
        self.controller._page.get_by_role.return_value = base_locator

        self._register_role_ref("e3", "button", "Save")

        result = await self.controller.click("e3")

        assert result["success"] is False
        assert "Ambiguous role ref 'e3'" in result["error"]
        first.click.assert_not_called()
        second.click.assert_not_called()

    @pytest.mark.asyncio
    async def test_click_right_button_skips_dom_fallback(self):
        """DOM fallback should not run for non-left clicks."""
        mock_locator = mock.MagicMock()
        mock_locator.click = mock.AsyncMock(
            side_effect=[
                Exception("Element is outside of the viewport"),
                Exception("Element is outside of the viewport"),
            ]
        )
        mock_locator.dblclick = mock.AsyncMock()
        mock_locator.evaluate = mock.AsyncMock()
        self.controller._page.locator.return_value = mock_locator

        result = await self.controller.click("1", button="right")

        assert result["success"] is False
        assert mock_locator.click.await_count == 2
        mock_locator.evaluate.assert_not_awaited()
    
    @pytest.mark.asyncio
    async def test_type_text(self):
        """Test typing text."""
        mock_locator = self._setup_typing_locator()
        
        result = await self.controller.type_text("1", "Hello World")
        
        assert result["success"] is True
        mock_locator.fill.assert_called_with("Hello World")
    
    @pytest.mark.asyncio
    async def test_type_text_with_submit(self):
        """Test typing text with submit."""
        mock_locator = self._setup_typing_locator()
        
        result = await self.controller.type_text("1", "Hello", submit=True)
        
        assert result["success"] is True
        mock_locator.press.assert_called_with("Enter")

    @pytest.mark.asyncio
    async def test_get_dropdown_options_role_ref(self):
        """List dropdown options through a role ref."""
        role_locator = mock.MagicMock()
        role_locator.evaluate = mock.AsyncMock(
            return_value={
                "ok": True,
                "options": [
                    {
                        "index": 0,
                        "text": "Featured",
                        "value": "featured-rank",
                        "selected": True,
                        "disabled": False,
                    },
                    {
                        "index": 1,
                        "text": "Price: Low to High",
                        "value": "price-asc-rank",
                        "selected": False,
                        "disabled": False,
                    },
                ],
                "selected_value": "featured-rank",
                "selected_index": 0,
            }
        )
        self.controller._page.get_by_role.return_value = role_locator
        self._register_role_ref("e4", "combobox", "Sort by:")

        result = await self.controller.get_dropdown_options("e4")

        assert result["success"] is True
        assert result["selected_value"] == "featured-rank"
        assert result["options"][1]["value"] == "price-asc-rank"
        self.controller._page.get_by_role.assert_called_once_with(
            "combobox",
            name="Sort by:",
        )

    @pytest.mark.asyncio
    async def test_select_dropdown_role_ref(self):
        """Select a dropdown option through a role ref."""
        role_locator = mock.MagicMock()
        role_locator.evaluate = mock.AsyncMock(
            return_value={
                "ok": True,
                "selected_value": "price-asc-rank",
                "selected_text": "Price: Low to High",
            }
        )
        self.controller._page.get_by_role.return_value = role_locator
        self._register_role_ref("e6", "combobox", "Sort by:")

        result = await self.controller.select_dropdown("e6", "Price: Low to High")

        assert result["success"] is True
        assert result["selected_value"] == "price-asc-rank"
        assert result["selected_text"] == "Price: Low to High"
        role_locator.evaluate.assert_awaited_once()
    
    @pytest.mark.asyncio
    async def test_press_key(self):
        """Test pressing key."""
        result = await self.controller.press_key("Enter")
        
        assert result["success"] is True
        self.controller._page.keyboard.press.assert_called_with("Enter")
    
    @pytest.mark.asyncio
    async def test_scroll_down(self):
        """Test scrolling down."""
        result = await self.controller.scroll("down", 500)
        
        assert result["success"] is True
        self.controller._page.mouse.wheel.assert_called_with(0, 500)
    
    @pytest.mark.asyncio
    async def test_scroll_up(self):
        """Test scrolling up."""
        result = await self.controller.scroll("up", 300)
        
        assert result["success"] is True
        self.controller._page.mouse.wheel.assert_called_with(0, -300)
    
    @pytest.mark.asyncio
    async def test_screenshot_full_page(self):
        """Test full page screenshot."""
        self.controller._page.screenshot.return_value = b"pngdata"
        
        result = await self.controller.screenshot(full_page=True)
        
        assert result == b"pngdata"
        self.controller._page.screenshot.assert_called_with(
            full_page=True,
            type="png",
        )
    
    @pytest.mark.asyncio
    async def test_screenshot_element(self):
        """Test element screenshot."""
        mock_locator = mock.MagicMock()
        mock_locator.screenshot = mock.AsyncMock(return_value=b"pngdata")
        self.controller._page.locator.return_value = mock_locator
        
        result = await self.controller.screenshot(ref="1")
        
        assert result == b"pngdata"
        mock_locator.screenshot.assert_called_with(type="png")
    
    @pytest.mark.asyncio
    async def test_wait_for_load(self):
        """Test waiting for load."""
        result = await self.controller.wait_for_load("networkidle")

        assert result["success"] is True
        self.controller._page.wait_for_load_state.assert_called_with(
            "networkidle",
            timeout=30000,
        )

    @pytest.mark.asyncio
    async def test_evaluate(self):
        """Test JavaScript evaluation."""
        self.controller._page.evaluate.return_value = {"data": "value"}

        result = await self.controller.evaluate("window.location.href")

        assert result["success"] is True
        assert result["result"] == {"data": "value"}

    @pytest.mark.asyncio
    async def test_get_status_switches_to_remaining_live_tab_when_active_page_is_closed(self):
        """Closed active pages should not break status polling."""
        closed_page = mock.MagicMock()
        closed_page.is_closed.return_value = True
        closed_page.title = mock.AsyncMock(side_effect=AssertionError("closed page title should not be read"))
        closed_page.url = "https://closed.example.com"

        live_page = mock.MagicMock()
        live_page.is_closed.return_value = False
        live_page.title = mock.AsyncMock(return_value="Live tab")
        live_page.url = "https://example.com/live"

        self.controller._page = closed_page
        self.controller._context.pages = [closed_page, live_page]
        self.controller._mode = "user_chrome"

        status = await self.controller.get_status()

        assert status["connected"] is True
        assert status["target_id"] == str(id(live_page))
        assert status["title"] == "Live tab"
        assert status["url"] == "https://example.com/live"
        assert status["tab_count"] == 1
        assert self.controller._page is live_page
        closed_page.title.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_get_status_tolerates_navigation_time_title_failures(self):
        """Transient navigation title errors should not fail browser status."""
        live_page = mock.MagicMock()
        live_page.is_closed.return_value = False
        live_page.title = mock.AsyncMock(
            side_effect=Exception("Page.title: Execution context was destroyed, most likely because of a navigation")
        )
        live_page.url = "https://example.com/live"

        self.controller._page = live_page
        self.controller._context.pages = [live_page]
        self.controller._mode = "user_chrome"

        status = await self.controller.get_status()

        assert status["connected"] is True
        assert status["title"] == ""
        assert status["url"] == "https://example.com/live"
        assert status["tab_count"] == 1

    @pytest.mark.asyncio
    async def test_get_tabs_filters_closed_pages(self):
        """Closed Playwright pages should be omitted from tab snapshots."""
        closed_page = mock.MagicMock()
        closed_page.is_closed.return_value = True
        closed_page.title = mock.AsyncMock(side_effect=AssertionError("closed page title should not be read"))
        closed_page.url = "https://closed.example.com"

        live_page = mock.MagicMock()
        live_page.is_closed.return_value = False
        live_page.title = mock.AsyncMock(return_value="Live tab")
        live_page.url = "https://example.com/live"

        self.controller._context.pages = [closed_page, live_page]

        tabs = await self.controller.get_tabs()

        assert tabs == [
            BrowserTab(
                target_id=str(id(live_page)),
                title="Live tab",
                url="https://example.com/live",
            )
        ]
        closed_page.title.assert_not_awaited()


class TestBrowserControllerSnapshot:
    """Test snapshot functionality."""
    
    def setup_method(self):
        """Setup mock page."""
        self.controller = BrowserController()
        self.controller._page = mock.AsyncMock()
        self.controller._page.url = "https://example.com"
        self.controller._page.title.return_value = "Example"
    
    @pytest.mark.asyncio
    async def test_get_ai_snapshot(self):
        """Test AI snapshot generation."""
        self.controller._enhanced_cdp_pipeline.build_ai_snapshot = mock.AsyncMock(
            return_value=EnhancedAiSnapshotResult(
                text="Title: Example\nURL: https://example.com\n\nDOM tree (browser-use style):\n[1]<button>Submit</button>",
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
        )

        snapshot = await self.controller.get_page_snapshot(format_type="ai")

        assert snapshot.title == "Example"
        assert snapshot.url == "https://example.com"
        assert "Submit" in snapshot.text
        assert snapshot.ref_count == 1

    @pytest.mark.asyncio
    async def test_get_ai_snapshot_falls_back_to_legacy_when_enhanced_path_fails(self):
        """Enhanced pipeline failures should fall back to legacy query-selector path."""
        self.controller._enhanced_cdp_pipeline.build_ai_snapshot = mock.AsyncMock(
            side_effect=RuntimeError("cdp failed")
        )

        mock_elem = mock.AsyncMock()
        mock_elem.evaluate = mock.AsyncMock(
            side_effect=[
                {
                    "tag": "button",
                    "role": "button",
                    "type": "",
                    "id": "",
                    "nameAttr": "",
                    "placeholder": "",
                    "href": "",
                    "label": "Submit",
                    "visible": True,
                    "ancestors": [],
                },
                None,
            ]
        )
        self.controller._page.query_selector_all.return_value = [mock_elem]

        snapshot = await self.controller.get_page_snapshot(format_type="ai")

        assert snapshot.title == "Example"
        assert snapshot.url == "https://example.com"
        assert snapshot.ref_count == 1
        assert "Submit" in snapshot.text
    
    @pytest.mark.asyncio
    async def test_get_aria_snapshot(self):
        """Test ARIA snapshot generation."""
        mock_locator = mock.MagicMock()
        mock_locator.aria_snapshot = mock.AsyncMock(
            return_value='- button "Submit"'
        )
        self.controller._page.locator = mock.MagicMock(return_value=mock_locator)
        
        snapshot = await self.controller.get_page_snapshot(format_type="aria")
        
        assert snapshot.title == "Example"
        assert "button" in snapshot.text
        assert snapshot.ref_count == 0

    @pytest.mark.asyncio
    async def test_get_aria_snapshot_truncates_to_max_chars(self):
        """ARIA snapshot should respect max_chars truncation."""
        long_snapshot = "\n".join([f'- button "Item {i}"' for i in range(200)])
        mock_locator = mock.MagicMock()
        mock_locator.aria_snapshot = mock.AsyncMock(return_value=long_snapshot)
        self.controller._page.locator = mock.MagicMock(return_value=mock_locator)

        snapshot = await self.controller.get_page_snapshot(format_type="aria", max_chars=200)

        assert snapshot.title == "Example"
        assert snapshot.ref_count == 0
        assert len(snapshot.text) <= 200


class TestSingleton:
    """Test singleton pattern."""
    
    def setup_method(self):
        """Reset before each test."""
        reset_browser_controller()
    
    def test_get_browser_controller(self):
        """Test singleton returns same instance."""
        c1 = get_browser_controller()
        c2 = get_browser_controller()
        
        assert c1 is c2
    
    def test_reset_browser_controller(self):
        """Test reset creates new instance."""
        c1 = get_browser_controller()
        reset_browser_controller()
        c2 = get_browser_controller()
        
        assert c1 is not c2
