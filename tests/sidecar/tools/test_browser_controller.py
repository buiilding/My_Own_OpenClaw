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


class TestPageSnapshot:
    """Test PageSnapshot dataclass."""
    
    def test_creation(self):
        """Test creating PageSnapshot."""
        snapshot = PageSnapshot(
            text="Test snapshot",
            refs={"1": {"role": "button", "name": "Submit"}},
            url="https://example.com",
            title="Example",
        )
        assert snapshot.text == "Test snapshot"
        assert snapshot.url == "https://example.com"
    
    def test_to_dict(self):
        """Test to_dict method."""
        snapshot = PageSnapshot(
            text="Test",
            refs={"1": {"role": "button"}},
            url="https://example.com",
            title="Example",
        )
        d = snapshot.to_dict()
        assert d["snapshot"] == "Test"
        assert d["url"] == "https://example.com"


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
        mock_pw = mock.AsyncMock()
        mock_browser = mock.AsyncMock()
        mock_context = mock.AsyncMock()
        mock_page = mock.AsyncMock()
        
        mock_page.url = "https://example.com"
        mock_context.pages = [mock_page]
        mock_browser.contexts = [mock_context]
        mock_pw.chromium.connect_over_cdp.return_value = mock_browser
        mock_playwright.return_value.start.return_value = mock_pw
        
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
        
        mock_pw = mock.AsyncMock()
        mock_browser = mock.AsyncMock()
        mock_context = mock.AsyncMock()
        mock_page = mock.AsyncMock()
        
        mock_page.url = "about:blank"
        mock_context.new_page.return_value = mock_page
        mock_browser.new_context.return_value = mock_context
        mock_pw.chromium.launch.return_value = mock_browser
        mock_playwright.return_value.start.return_value = mock_pw
        
        controller = BrowserController()
        result = await controller.launch_managed_browser()
        
        assert result["status"] == "launched"
        assert result["mode"] == "managed"
    
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
        self.controller._page = mock.AsyncMock()
        self.controller._browser = mock.AsyncMock()
        self.controller._context = mock.AsyncMock()
    
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
        mock_locator = mock.AsyncMock()
        self.controller._page.locator.return_value = mock_locator
        
        result = await self.controller.click("1")
        
        assert result["success"] is True
        mock_locator.click.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_click_failure(self):
        """Test click failure."""
        self.controller._page.locator.side_effect = Exception("Element not found")
        
        result = await self.controller.click("1")
        
        assert result["success"] is False
    
    @pytest.mark.asyncio
    async def test_type_text(self):
        """Test typing text."""
        mock_locator = mock.AsyncMock()
        self.controller._page.locator.return_value = mock_locator
        
        result = await self.controller.type_text("1", "Hello World")
        
        assert result["success"] is True
        mock_locator.fill.assert_called_with("Hello World")
    
    @pytest.mark.asyncio
    async def test_type_text_with_submit(self):
        """Test typing text with submit."""
        mock_locator = mock.AsyncMock()
        self.controller._page.locator.return_value = mock_locator
        
        result = await self.controller.type_text("1", "Hello", submit=True)
        
        assert result["success"] is True
        mock_locator.press.assert_called_with("Enter")
    
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
        mock_locator = mock.AsyncMock()
        mock_locator.screenshot.return_value = b"pngdata"
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
        # Mock elements
        mock_elem = mock.AsyncMock()
        mock_elem.is_visible.return_value = True
        mock_elem.evaluate.return_value = "button"
        mock_elem.get_attribute.side_effect = lambda x: {
            "role": "button",
            "type": "",
            "aria-label": None,
            "title": None,
            "name": None,
            "value": None,
            "alt": None,
            "placeholder": None,
        }.get(x)
        mock_elem.text_content.return_value = "Submit"
        
        self.controller._page.query_selector_all.return_value = [mock_elem]
        
        snapshot = await self.controller.get_page_snapshot(format_type="ai")
        
        assert snapshot.title == "Example"
        assert snapshot.url == "https://example.com"
        assert "Submit" in snapshot.text
    
    @pytest.mark.asyncio
    async def test_get_aria_snapshot(self):
        """Test ARIA snapshot generation."""
        self.controller._page.accessibility.snapshot.return_value = {
            "role": "WebArea",
            "name": "Example",
            "children": [
                {"role": "button", "name": "Submit"},
            ],
        }
        
        snapshot = await self.controller.get_page_snapshot(format_type="aria")
        
        assert snapshot.title == "Example"
        assert "button" in snapshot.text


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
