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
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}
            
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
            assert result.data["wait_until"] == "load"
            assert result.data["ref_count"] == 1
            assert "refs" not in result.data
            assert "stats" not in result.data
            mock_controller.wait_for_load.assert_awaited_once_with("load")
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="ai",
                max_chars=4000,
                refs_mode=None,
                interactive=True,
                compact=True,
                depth=4,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_snapshot_efficient_role_output(self):
        """Test efficient role snapshot output returns text payload only."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}

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
            assert result.data["wait_until"] == "load"
            assert result.data["ref_count"] == 1
            assert "refs" not in result.data
            assert "stats" not in result.data

    @pytest.mark.asyncio
    async def test_snapshot_efficient_zero_refs_retries_with_higher_depth(self):
        """Efficient AI snapshot should retry with deeper role depth when refs are empty."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.side_effect = [
                PageSnapshot(
                    text="(no interactive elements)",
                    url="https://example.com",
                    title="Example",
                    ref_count=0,
                ),
                PageSnapshot(
                    text='- button "Submit" [ref=e1]',
                    url="https://example.com",
                    title="Example",
                    ref_count=1,
                ),
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "snapshot",
                "format": "ai",
                "mode": "efficient",
            })

            assert result.success is True
            assert result.data["ref_count"] == 1
            assert mock_controller.get_page_snapshot.await_count == 2
            assert mock_controller.get_page_snapshot.await_args_list[0].kwargs["depth"] == 4
            assert mock_controller.get_page_snapshot.await_args_list[1].kwargs["depth"] == 12

    @pytest.mark.asyncio
    async def test_snapshot_efficient_zero_refs_retries_flat_ai_when_depth_retry_empty(self):
        """Efficient AI snapshot should retry flat AI extraction if role retries still have zero refs."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.side_effect = [
                PageSnapshot(
                    text="(no interactive elements)",
                    url="https://example.com",
                    title="Example",
                    ref_count=0,
                ),
                PageSnapshot(
                    text="(still no interactive elements)",
                    url="https://example.com",
                    title="Example",
                    ref_count=0,
                ),
                PageSnapshot(
                    text='[1] link "Story"',
                    url="https://example.com",
                    title="Example",
                    ref_count=1,
                ),
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "snapshot",
                "format": "ai",
                "mode": "efficient",
            })

            assert result.success is True
            assert result.data["ref_count"] == 1
            assert mock_controller.get_page_snapshot.await_count == 3
            assert mock_controller.get_page_snapshot.await_args_list[2].kwargs == {
                "format_type": "ai",
                "max_chars": 4000,
                "refs_mode": None,
                "interactive": None,
                "compact": None,
                "depth": None,
                "selector": None,
                "frame_selector": None,
            }
    
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

    @pytest.mark.asyncio
    async def test_snapshot_aria_does_not_force_efficient_defaults(self):
        """Test aria snapshot keeps non-efficient defaults."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}

            from tools.browser.controller import PageSnapshot
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='- button "Submit"',
                url="https://example.com",
                title="Example",
                ref_count=0,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "snapshot",
                "format": "aria",
            })

            assert result.success is True
            assert result.data["format"] == "aria"
            assert result.data["wait_until"] == "load"
            mock_controller.wait_for_load.assert_awaited_once_with("load")
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="aria",
                max_chars=12000,
                refs_mode=None,
                interactive=None,
                compact=None,
                depth=None,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_snapshot_custom_wait_until(self):
        """Test snapshot accepts custom wait_until."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {"success": True, "state": "networkidle"}

            from tools.browser.controller import PageSnapshot
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='- button "Submit"',
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "snapshot",
                "wait_until": "networkidle",
            })

            assert result.success is True
            assert result.data["wait_until"] == "networkidle"
            mock_controller.wait_for_load.assert_awaited_once_with("networkidle")


class TestClickAction:
    """Test click action."""
    
    @pytest.mark.asyncio
    async def test_click_success(self):
        """Test successful click."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {
                "success": True,
                "strategy": "force",
                "forced": True,
                "candidate_count": 2,
                "candidate_index": 1,
            }
            mock_get.return_value = mock_controller
            
            result = await execute_browser_control({
                "action": "click",
                "ref": "5",
            })
            
            assert result.success is True
            assert result.data["ref"] == "5"
            assert result.data["strategy"] == "force"
            assert result.data["forced"] is True
            assert result.data["candidate_count"] == 2
            assert result.data["candidate_index"] == 1
    
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


class TestPostActionSnapshots:
    """Test automatic snapshots for page-affecting actions."""

    @pytest.mark.asyncio
    async def test_connect_success_adds_post_action_snapshot(self):
        """Successful connect should include post-action snapshot data."""
        from tools.browser.controller import PageSnapshot

        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False

            async def _auto_connect(**kwargs):
                mock_controller.is_connected = True
                return {
                    "status": "connected",
                    "mode": "user_chrome",
                    "url": "https://example.com",
                    "title": "Example",
                }

            mock_controller.auto_connect_to_chrome.side_effect = _auto_connect
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text="[1] button Submit",
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "connect",
                "mode": "user_chrome",
            })

            assert result.success is True
            assert "post_action_snapshot" in result.data
            assert result.data["post_action_snapshot"]["action"] == "snapshot"
            assert result.data["post_action_snapshot"]["format"] == "ai"
            assert result.data["post_action_snapshot"]["snapshot"] == "[1] button Submit"
            mock_controller.wait_for_load.assert_awaited_once_with("load")
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="ai",
                max_chars=4000,
                refs_mode=None,
                interactive=True,
                compact=True,
                depth=4,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_click_success_adds_post_action_snapshot(self):
        """Successful click should include post-action snapshot data."""
        from tools.browser.controller import PageSnapshot

        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text="[1] button Submit",
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "click",
                "ref": "5",
            })

            assert result.success is True
            assert "post_action_snapshot" in result.data
            assert result.data["post_action_snapshot"]["action"] == "snapshot"
            assert result.data["post_action_snapshot"]["format"] == "ai"
            assert result.data["post_action_snapshot"]["snapshot"] == "[1] button Submit"
            mock_controller.wait_for_load.assert_awaited_once_with("load")
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="ai",
                max_chars=4000,
                refs_mode=None,
                interactive=True,
                compact=True,
                depth=4,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_click_post_action_snapshot_zero_refs_uses_fallback_retries(self):
        """Post-action snapshots should retry when efficient capture returns zero refs."""
        from tools.browser.controller import PageSnapshot

        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}
            mock_controller.get_page_snapshot.side_effect = [
                PageSnapshot(
                    text="(no interactive elements)",
                    url="https://example.com",
                    title="Example",
                    ref_count=0,
                ),
                PageSnapshot(
                    text="(still no interactive elements)",
                    url="https://example.com",
                    title="Example",
                    ref_count=0,
                ),
                PageSnapshot(
                    text='[1] link "Story"',
                    url="https://example.com",
                    title="Example",
                    ref_count=1,
                ),
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "click",
                "ref": "5",
            })

            assert result.success is True
            assert "post_action_snapshot" in result.data
            assert result.data["post_action_snapshot"]["ref_count"] == 1
            assert result.data["post_action_snapshot"]["snapshot"] == '[1] link "Story"'
            assert mock_controller.get_page_snapshot.await_count == 3

    @pytest.mark.asyncio
    async def test_snapshot_failure_does_not_fail_primary_action(self):
        """Post-action snapshot failure should not fail the original action."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_controller.wait_for_load.return_value = {"success": False, "error": "timed out"}
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "click",
                "ref": "5",
            })

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.wait_for_load.assert_awaited_once_with("load")

    @pytest.mark.asyncio
    async def test_status_does_not_add_post_action_snapshot(self):
        """Non-page-affecting actions should not include post-action snapshot data."""
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
            mock_controller.get_page_snapshot = mock.AsyncMock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "status"})

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_act_close_does_not_add_post_action_snapshot(self):
        """act(close) should not request an automatic snapshot."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.close = mock.AsyncMock()
            mock_controller.get_page_snapshot = mock.AsyncMock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "act",
                "request": {"kind": "close"},
            })

            assert result.success is True
            assert result.data["action"] == "close"
            assert "post_action_snapshot" not in result.data
            mock_controller.get_page_snapshot.assert_not_awaited()


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


class TestSwitchTabAction:
    """Test switch_tab action."""

    @pytest.mark.asyncio
    async def test_switch_tab_success_returns_status_title_and_url(self):
        """Successful switch_tab should report URL/title from get_status."""
        with mock.patch("tools.browser.browser_tool.get_browser_controller") as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.switch_tab.return_value = True
            mock_controller.get_status.return_value = {
                "connected": True,
                "mode": "user_chrome",
                "url": "https://example.com/switched",
                "title": "Switched Tab",
                "tab_count": 2,
                "target_id": "id2",
            }

            from tools.browser.controller import PageSnapshot
            mock_controller.wait_for_load.return_value = {"success": True, "state": "load"}
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='[1] link "Example"',
                url="https://example.com/switched",
                title="Switched Tab",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control({
                "action": "switch_tab",
                "target_id": "id2",
            })

            assert result.success is True
            assert result.data["action"] == "switch_tab"
            assert result.data["target_id"] == "id2"
            assert result.data["url"] == "https://example.com/switched"
            assert result.data["title"] == "Switched Tab"


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
