"""
Tests for browser tool implementation.
"""

import pytest

# Skip all tests if playwright is not installed
pytest.importorskip("playwright")

from unittest import mock

from tools.browser.browser_tool import execute_browser_control
from tools.browser.controller import reset_browser_controller
from tools.result import ToolResult


@pytest.fixture(autouse=True)
def reset_controller():
    """Reset controller before each test."""
    reset_browser_controller()


class TestExecuteBrowserControl:
    """Test main execute function."""
    
    @pytest.mark.asyncio
    async def test_missing_action(self):
        """Test error when action is missing."""
        result = await execute_browser_control({})
        
        assert result.success is False
        assert "action" in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_unknown_action(self):
        """Test error for unknown action."""
        result = await execute_browser_control({"action": "unknown"})
        
        assert result.success is False
        assert "Unhandled" in result.error
    
    @pytest.mark.asyncio
    async def test_validation_error(self):
        """Test validation error handling."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            result = await execute_browser_control({"action": "click"})  # Missing ref
        
        assert result.success is False
        assert "ref" in result.error.lower()


class TestConnectAction:
    """Test connect action."""
    
    @pytest.mark.asyncio
    async def test_connect_user_chrome(self):
        """Test connecting to user Chrome."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.auto_connect_to_chrome.return_value = {
                "status": "connected",
                "mode": "user_chrome",
                "url": "https://example.com",
            }
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "connect",
                "mode": "user_chrome",
                "cdp_url": "http://127.0.0.1:9222",
            })
            
            assert result.success is True
            assert result.data["mode"] == "user_chrome"
            mock_controller.auto_connect_to_chrome.assert_awaited_once()
    
    @pytest.mark.asyncio
    async def test_connect_managed(self):
        """Test launching managed browser."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.launch_managed_browser.return_value = {
                "status": "launched",
                "mode": "managed",
                "url": "about:blank",
            }
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "connect",
                "mode": "managed",
                "headless": True,
            })
            
            assert result.success is True
            assert result.data["mode"] == "managed"
    
    @pytest.mark.asyncio
    async def test_connect_error(self):
        """Test connection error handling."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.auto_connect_to_chrome.side_effect = ConnectionError("Failed")
            mock_controller.close = mock.AsyncMock()
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "connect",
                "mode": "user_chrome",
            })
            
            assert result.success is False
            assert "Failed to connect to Chrome" in result.error


class TestCompatibilityActions:
    """Test OpenClaw-compatible action names."""

    @pytest.mark.asyncio
    async def test_status_action(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.get_status.return_value = {
                "connected": True,
                "mode": "user_chrome",
                "url": "https://example.com",
                "title": "Example",
                "tab_count": 1,
                "target_id": "t1",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "status"})
            assert result.success is True
            assert result.data["action"] == "status"
            assert result.data["connected"] is True

    @pytest.mark.asyncio
    async def test_open_action(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.open_tab.return_value = {
                "success": True,
                "target_id": "tab1",
                "url": "https://example.com",
                "title": "Example",
                "status": 200,
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {"action": "open", "targetUrl": "https://example.com"}
            )
            assert result.success is True
            assert result.data["action"] == "open"
            assert result.data["target_id"] == "tab1"

    @pytest.mark.asyncio
    async def test_act_hover(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.hover.return_value = {"success": True, "action": "hover", "ref": "e1"}
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {"action": "act", "request": {"kind": "hover", "ref": "e1"}}
            )
            assert result.success is True
            assert result.data["action"] == "hover"

    @pytest.mark.asyncio
    async def test_console_action(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_console_messages.return_value = [
                {"type": "log", "text": "hello", "timestamp": "2026-02-14T00:00:00+00:00"}
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "console", "limit": 50})
            assert result.success is True
            assert result.data["action"] == "console"
            assert result.data["count"] == 1

    @pytest.mark.asyncio
    async def test_dialog_action_armed(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_dialog_events.return_value = []
            mock_controller.arm_dialog = mock.Mock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "dialog", "accept": False})
            assert result.success is True
            assert result.data["action"] == "dialog"
            assert result.data["armed"] is True

    @pytest.mark.asyncio
    async def test_dialog_action_wait(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.arm_dialog = mock.Mock()
            mock_controller.wait_for_dialog.return_value = {
                "type": "alert",
                "message": "hi",
                "handled_as": "accept",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {"action": "dialog", "accept": True, "timeoutMs": 1000}
            )
            assert result.success is True
            assert result.data["armed"] is False
            assert result.data["handled"]["type"] == "alert"

    @pytest.mark.asyncio
    async def test_errors_action(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_page_errors.return_value = [{"message": "boom"}]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "errors"})
            assert result.success is True
            assert result.data["action"] == "errors"
            assert result.data["count"] == 1

    @pytest.mark.asyncio
    async def test_requests_action(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_network_requests.return_value = [{"id": "r1", "url": "https://example.com"}]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "requests"})
            assert result.success is True
            assert result.data["action"] == "requests"
            assert result.data["count"] == 1

    @pytest.mark.asyncio
    async def test_trace_start_action(self):
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.trace_start.return_value = {"success": True}
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "trace_start"})
            assert result.success is True
            assert result.data["action"] == "trace_start"


class TestNavigateAction:
    """Test navigate action."""
    
    @pytest.mark.asyncio
    async def test_navigate_success(self):
        """Test successful navigation."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.navigate.return_value = {
                "success": True,
                "url": "https://example.com",
                "title": "Example",
                "status": 200,
            }
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "navigate",
                "url": "https://example.com",
            })
            
            assert result.success is True
            assert result.data["url"] == "https://example.com"
    
    @pytest.mark.asyncio
    async def test_navigate_not_connected(self):
        """Test navigate when not connected."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "navigate",
                "url": "https://example.com",
            })
            
            assert result.success is False
            assert "not connected" in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_navigate_failure(self):
        """Test navigation failure."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.navigate.return_value = {
                "success": False,
                "error": "Connection refused",
            }
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "navigate",
                "url": "https://example.com",
            })
            
            assert result.success is False
            assert "Connection refused" in result.error


class TestSnapshotAction:
    """Test snapshot action."""
    
    @pytest.mark.asyncio
    async def test_snapshot_ai_format(self):
        """Test AI format snapshot."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            
            from tools.browser.controller import PageSnapshot
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text="[1] button Submit",
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "snapshot",
                "format": "ai",
            })
            
            assert result.success is True
            assert result.data["format"] == "ai"
            assert result.data["ref_count"] == 1
            assert "refs" not in result.data
            assert "stats" not in result.data

    @pytest.mark.asyncio
    async def test_snapshot_efficient_role_output(self):
        """Test efficient role snapshot output includes refs and stats."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='- button "Submit" [ref=e1]',
                url="https://example.com",
                title="Example",
                ref_count=1,
                refs={"e1": {"role": "button", "name": "Submit"}},
                stats={"lines": 1, "chars": 26, "refs": 1, "interactive": 1},
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "snapshot",
                "format": "ai",
                "mode": "efficient",
            })

            assert result.success is True
            assert result.data["format"] == "ai"
            assert result.data["ref_count"] == 1
            assert "refs" in result.data
            assert "stats" in result.data
    
    @pytest.mark.asyncio
    async def test_snapshot_not_connected(self):
        """Test snapshot when not connected."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "snapshot",
            })
            
            assert result.success is False
            assert "not connected" in result.error.lower()


class TestClickAction:
    """Test click action."""
    
    @pytest.mark.asyncio
    async def test_click_success(self):
        """Test successful click."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "click",
                "ref": "5",
            })
            
            assert result.success is True
            assert result.data["ref"] == "5"
    
    @pytest.mark.asyncio
    async def test_click_failure(self):
        """Test click failure."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {
                "success": False,
                "error": "Element not found",
            }
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "click",
                "ref": "999",
            })
            
            assert result.success is False
            assert "Element not found" in result.error


class TestTypeAction:
    """Test type action."""
    
    @pytest.mark.asyncio
    async def test_type_success(self):
        """Test successful type."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.type_text.return_value = {"success": True}
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "type",
                "ref": "3",
                "text": "Hello World",
            })
            
            assert result.success is True
            assert result.data["text"] == "Hello World"


class TestScreenshotAction:
    """Test screenshot action."""
    
    @pytest.mark.asyncio
    async def test_screenshot_success(self):
        """Test successful screenshot."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.screenshot.return_value = b"pngdata"
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "screenshot",
                "full_page": True,
            })
            
            assert result.success is True
            assert result.data["format"] == "png"
            assert result.data["full_page"] is True
            assert "image_data" in result.data
    
    @pytest.mark.asyncio
    async def test_screenshot_element(self):
        """Test element screenshot."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.screenshot.return_value = b"pngdata"
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "screenshot",
                "ref": "5",
            })
            
            assert result.success is True
            assert result.data["ref"] == "5"

    @pytest.mark.asyncio
    async def test_screenshot_jpeg(self):
        """Test jpeg screenshot option."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.screenshot.return_value = b"jpegdata"
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "screenshot",
                "type": "jpeg",
            })

            assert result.success is True
            assert result.data["format"] == "jpeg"


class TestGetTabsAction:
    """Test get_tabs action."""
    
    @pytest.mark.asyncio
    async def test_get_tabs_success(self):
        """Test successful get_tabs."""
        from tools.browser.controller import BrowserTab
        
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_tabs.return_value = [
                BrowserTab("id1", "Tab 1", "https://example.com"),
                BrowserTab("id2", "Tab 2", "https://google.com"),
            ]
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "get_tabs",
            })
            
            assert result.success is True
            assert result.data["tab_count"] == 2
            assert len(result.data["tabs"]) == 2


class TestCloseAction:
    """Test close action."""
    
    @pytest.mark.asyncio
    async def test_close_success(self):
        """Test successful close."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.close = mock.AsyncMock()
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "close",
            })
            
            assert result.success is True
            assert result.data["status"] == "closed"
            mock_controller.close.assert_called_once()
