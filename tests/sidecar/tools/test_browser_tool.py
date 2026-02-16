"""
Tests for browser tool implementation.
"""

import pytest

# Skip all tests if playwright is not installed
pytest.importorskip("playwright")

from unittest import mock

from tools.browser.browser_tool import execute_browser_control
from tools.browser.controller import reset_browser_controller
from tools.browser_use_adapter import AdapterActionResult
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            result = await execute_browser_control({"action": "click"})  # Missing ref

        assert result.success is False
        assert "ref" in result.error.lower()


class TestPhase2AdapterRouting:
    """Validate Phase 2 browser_control adapter routing behavior."""

    @pytest.mark.asyncio
    async def test_routed_action_uses_adapter(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get_controller, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get_controller.return_value = mock_controller

            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="navigate",
                decision="port",
                data={
                    "action": "navigate",
                    "url": "https://example.com",
                    "title": "Example",
                    "status": 200,
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser_control(
                {"action": "navigate", "url": "https://example.com"}
            )

            assert result.success is True
            assert result.data["action"] == "navigate"
            assert result.data["url"] == "https://example.com"
            mock_get_adapter.assert_called_once_with(mock_controller)
            mock_adapter.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_adapter_failure_maps_to_tool_error(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get_controller, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get_controller.return_value = mock_controller

            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=False,
                action="switch_tab",
                decision="port",
                error="Tab not found: missing",
                error_code="TAB_NOT_FOUND",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser_control(
                {"action": "switch_tab", "target_id": "missing"}
            )

            assert result.success is False
            assert result.error == "Tab not found: missing"

    @pytest.mark.asyncio
    async def test_non_routed_action_does_not_use_adapter(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            result = await execute_browser_control({"action": "profiles"})

            assert result.success is True
            assert result.data["action"] == "profiles"
            mock_get_adapter.assert_not_called()


class TestConnectAction:
    """Test connect action."""

    @pytest.mark.asyncio
    async def test_connect_user_chrome(self):
        """Test connecting to user Chrome."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.auto_connect_to_chrome.return_value = {
                "status": "connected",
                "mode": "user_chrome",
                "url": "https://example.com",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "connect",
                    "mode": "user_chrome",
                    "cdp_url": "http://127.0.0.1:9222",
                }
            )

            assert result.success is True
            assert result.data["mode"] == "user_chrome"
            mock_controller.auto_connect_to_chrome.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_connect_managed(self):
        """Test launching managed browser."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.launch_managed_browser.return_value = {
                "status": "launched",
                "mode": "managed",
                "url": "about:blank",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "connect",
                    "mode": "managed",
                    "headless": True,
                }
            )

            assert result.success is True
            assert result.data["mode"] == "managed"

    @pytest.mark.asyncio
    async def test_connect_error(self):
        """Test connection error handling."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.auto_connect_to_chrome.side_effect = ConnectionError(
                "Failed"
            )
            mock_controller.close = mock.AsyncMock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "connect",
                    "mode": "user_chrome",
                }
            )

            assert result.success is False
            assert "Failed to connect to Chrome" in result.error


class TestCompatibilityActions:
    """Test OpenClaw-compatible action names."""

    @pytest.mark.asyncio
    async def test_status_action(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.hover.return_value = {
                "success": True,
                "action": "hover",
                "ref": "e1",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {"action": "act", "request": {"kind": "hover", "ref": "e1"}}
            )
            assert result.success is True
            assert result.data["action"] == "hover"

    @pytest.mark.asyncio
    async def test_console_action(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_console_messages.return_value = [
                {
                    "type": "log",
                    "text": "hello",
                    "timestamp": "2026-02-14T00:00:00+00:00",
                }
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "console", "limit": 50})
            assert result.success is True
            assert result.data["action"] == "console"
            assert result.data["count"] == 1

    @pytest.mark.asyncio
    async def test_dialog_action_armed(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_dialog_events.return_value = []
            mock_controller.arm_dialog = mock.Mock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {"action": "dialog", "accept": False}
            )
            assert result.success is True
            assert result.data["action"] == "dialog"
            assert result.data["armed"] is True

    @pytest.mark.asyncio
    async def test_dialog_action_wait(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_network_requests.return_value = [
                {"id": "r1", "url": "https://example.com"}
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "requests"})
            assert result.success is True
            assert result.data["action"] == "requests"
            assert result.data["count"] == 1

    @pytest.mark.asyncio
    async def test_trace_start_action(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.navigate.return_value = {
                "success": True,
                "url": "https://example.com",
                "title": "Example",
                "status": 200,
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "navigate",
                    "url": "https://example.com",
                }
            )

            assert result.success is True
            assert result.data["url"] == "https://example.com"

    @pytest.mark.asyncio
    async def test_navigate_not_connected(self):
        """Test navigate when not connected."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "navigate",
                    "url": "https://example.com",
                }
            )

            assert result.success is False
            assert "not connected" in result.error.lower()

    @pytest.mark.asyncio
    async def test_navigate_failure(self):
        """Test navigation failure."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.navigate.return_value = {
                "success": False,
                "error": "Connection refused",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "navigate",
                    "url": "https://example.com",
                }
            )

            assert result.success is False
            assert "Connection refused" in result.error


class TestSnapshotAction:
    """Test snapshot action."""

    @pytest.mark.asyncio
    async def test_snapshot_ai_format(self):
        """Test AI format snapshot."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text="[1] button Submit",
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "ai",
                }
            )

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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

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

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "ai",
                    "mode": "efficient",
                }
            )

            assert result.success is True
            assert result.data["format"] == "ai"
            assert result.data["wait_until"] == "load"
            assert result.data["ref_count"] == 1
            assert "refs" not in result.data
            assert "stats" not in result.data

    @pytest.mark.asyncio
    async def test_snapshot_efficient_zero_refs_retries_with_higher_depth(self):
        """Efficient AI snapshot should retry with deeper role depth when refs are empty."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

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

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "ai",
                    "mode": "efficient",
                }
            )

            assert result.success is True
            assert result.data["ref_count"] == 1
            assert mock_controller.get_page_snapshot.await_count == 2
            assert (
                mock_controller.get_page_snapshot.await_args_list[0].kwargs["depth"]
                == 4
            )
            assert (
                mock_controller.get_page_snapshot.await_args_list[1].kwargs["depth"]
                == 12
            )

    @pytest.mark.asyncio
    async def test_snapshot_efficient_zero_refs_retries_flat_ai_when_depth_retry_empty(
        self,
    ):
        """Efficient AI snapshot should retry flat AI extraction if role retries still have zero refs."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

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

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "ai",
                    "mode": "efficient",
                }
            )

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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                }
            )

            assert result.success is False
            assert "not connected" in result.error.lower()

    @pytest.mark.asyncio
    async def test_snapshot_aria_does_not_force_efficient_defaults(self):
        """Test aria snapshot keeps non-efficient defaults."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='- button "Submit"',
                url="https://example.com",
                title="Example",
                ref_count=0,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "aria",
                }
            )

            assert result.success is True
            assert result.data["format"] == "aria"
            assert result.data["wait_until"] == "load"
            mock_controller.wait_for_load.assert_awaited_once_with("load")
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="aria",
                max_chars=4000,
                refs_mode=None,
                interactive=None,
                compact=None,
                depth=None,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_snapshot_aria_max_chars_is_hard_capped_at_4000(self):
        """ARIA snapshot requests should never exceed 4000 chars."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='- button "Submit"',
                url="https://example.com",
                title="Example",
                ref_count=0,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "aria",
                    "max_chars": 10000,
                }
            )

            assert result.success is True
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="aria",
                max_chars=4000,
                refs_mode=None,
                interactive=None,
                compact=None,
                depth=None,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_snapshot_ai_offset_limit_expands_capture_and_returns_window(self):
        """AI snapshot should support offset/limit pagination with expanded capture budget."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

            from tools.browser.controller import PageSnapshot

            full_text = "x" * 6000
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text=full_text,
                url="https://example.com",
                title="Example",
                ref_count=10,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "ai",
                    "offset": 4500,
                    "limit": 300,
                }
            )

            assert result.success is True
            assert result.data["snapshot"] == full_text[4500:4800]
            assert result.data["offset"] == 4500
            assert result.data["limit"] == 300
            assert result.data["returned_chars"] == 300
            assert result.data["total_chars"] == 6000
            assert result.data["has_more"] is True
            assert result.data["next_offset"] == 4800
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="ai",
                max_chars=5312,
                refs_mode=None,
                interactive=True,
                compact=True,
                depth=4,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_snapshot_aria_offset_limit_caps_page_limit_and_paginates(self):
        """ARIA snapshot should cap page limit at 4000 while allowing paged reads."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }

            from tools.browser.controller import PageSnapshot

            full_text = "z" * 12000
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text=full_text,
                url="https://example.com",
                title="Example",
                ref_count=0,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "aria",
                    "offset": 4000,
                    "limit": 10000,
                }
            )

            assert result.success is True
            assert result.data["snapshot"] == full_text[4000:8000]
            assert result.data["offset"] == 4000
            assert result.data["limit"] == 4000
            assert result.data["returned_chars"] == 4000
            assert result.data["total_chars"] == 12000
            assert result.data["has_more"] is True
            assert result.data["next_offset"] == 8000
            mock_controller.get_page_snapshot.assert_awaited_once_with(
                format_type="aria",
                max_chars=8512,
                refs_mode=None,
                interactive=None,
                compact=None,
                depth=None,
                selector=None,
                frame_selector=None,
            )

    @pytest.mark.asyncio
    async def test_snapshot_offset_limit_window_has_upper_bound(self):
        """Snapshot pagination window should enforce a hard capture ceiling."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "format": "ai",
                    "offset": 119900,
                    "limit": 200,
                }
            )

            assert result.success is False
            assert "offset + limit exceeds maximum snapshot window" in result.error
            mock_controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_snapshot_custom_wait_until(self):
        """Test snapshot accepts custom wait_until."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "networkidle",
            }

            from tools.browser.controller import PageSnapshot

            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='- button "Submit"',
                url="https://example.com",
                title="Example",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "snapshot",
                    "wait_until": "networkidle",
                }
            )

            assert result.success is True
            assert result.data["wait_until"] == "networkidle"
            mock_controller.wait_for_load.assert_awaited_once_with("networkidle")


class TestExtractAction:
    """Test extract action."""

    @pytest.mark.asyncio
    async def test_extract_success(self):
        """Extract should return query-focused content and source metadata."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }
            mock_controller.evaluate.return_value = {
                "success": True,
                "result": {
                    "title": "Example",
                    "url": "https://example.com",
                    "content": "Pricing\\nFree plan\\nPro plan $20\\nEnterprise plan",
                },
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "extract",
                    "query": "pro plan price",
                }
            )

            assert result.success is True
            assert result.data["action"] == "extract"
            assert result.data["query"] == "pro plan price"
            assert result.data["mode"] == "focused"
            assert result.data["wait_until"] == "load"
            assert result.data["url"] == "https://example.com"
            assert "Pro plan" in result.data["result"]
            assert "extracted_content" in result.data
            mock_controller.wait_for_load.assert_awaited_once_with("load")
            mock_controller.evaluate.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_extract_full_text_mode_returns_unfiltered_content(self):
        """full_text mode should return the source window without relevance filtering."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }
            mock_controller.evaluate.return_value = {
                "success": True,
                "result": {
                    "title": "Example",
                    "url": "https://example.com",
                    "content": "Alpha\nBeta\nGamma",
                },
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "extract",
                    "query": "not-present",
                    "mode": "full_text",
                }
            )

            assert result.success is True
            assert result.data["mode"] == "full_text"
            assert result.data["result"] == "Alpha\nBeta\nGamma"

    @pytest.mark.asyncio
    async def test_extract_structured_mode_returns_structured_payload(self):
        """structured mode should expose parsed table/list payload and JSON text window."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }
            mock_controller.evaluate.return_value = {
                "success": True,
                "result": {
                    "title": "Kimi",
                    "url": "https://example.com/keys",
                    "content": "fallback text",
                    "structured": {
                        "tables": [
                            {
                                "caption": "API Keys",
                                "headers": ["API ID", "Name", "Key"],
                                "row_objects": [
                                    {
                                        "API ID": "1",
                                        "Name": "prod",
                                        "Key": "sk-...1234",
                                    }
                                ],
                            }
                        ],
                        "lists": [],
                        "table_count": 1,
                    },
                },
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "extract",
                    "query": "api keys",
                    "mode": "structured",
                    "selector": "table",
                    "frame": "#content-frame",
                }
            )

            assert result.success is True
            assert result.data["mode"] == "structured"
            assert result.data["selector"] == "table"
            assert result.data["frame"] == "#content-frame"
            assert result.data["structured"]["table_count"] == 1
            assert '"table_count": 1' in result.data["result"]
            script = mock_controller.evaluate.await_args.args[0]
            assert "table" in script
            assert "#content-frame" in script

    @pytest.mark.asyncio
    async def test_extract_invalid_mode(self):
        """Extract should reject unknown modes."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {"action": "extract", "query": "pricing", "mode": "bad_mode"}
            )

            assert result.success is False
            assert "mode must be one of" in result.error

    @pytest.mark.asyncio
    async def test_extract_missing_query(self):
        """Extract should reject missing query."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser_control({"action": "extract"})

            assert result.success is False
            assert "query" in result.error.lower()

    @pytest.mark.asyncio
    async def test_extract_start_from_char_out_of_bounds(self):
        """Extract should reject invalid continuation offsets."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }
            mock_controller.evaluate.return_value = {
                "success": True,
                "result": {
                    "title": "Example",
                    "url": "https://example.com",
                    "content": "short content",
                },
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "extract",
                    "query": "price",
                    "start_from_char": 999,
                }
            )

            assert result.success is False
            assert "exceeds content length" in result.error


class TestClickAction:
    """Test click action."""

    @pytest.mark.asyncio
    async def test_click_success(self):
        """Test successful click."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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

            result = await execute_browser_control(
                {
                    "action": "click",
                    "ref": "5",
                }
            )

            assert result.success is True
            assert result.data["ref"] == "5"
            assert result.data["strategy"] == "force"
            assert result.data["forced"] is True
            assert result.data["candidate_count"] == 2
            assert result.data["candidate_index"] == 1

    @pytest.mark.asyncio
    async def test_click_failure(self):
        """Test click failure."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {
                "success": False,
                "error": "Element not found",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "click",
                    "ref": "999",
                }
            )

            assert result.success is False
            assert "Element not found" in result.error


class TestPostActionSnapshots:
    """Test automatic snapshots for page-affecting actions."""

    @pytest.mark.asyncio
    async def test_connect_success_does_not_add_post_action_snapshot(self):
        """Automatic post-action snapshots are disabled."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "connect",
                    "mode": "user_chrome",
                }
            )

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.wait_for_load.assert_not_awaited()
            mock_controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_click_success_does_not_add_post_action_snapshot(self):
        """Automatic post-action snapshots are disabled."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "click",
                    "ref": "5",
                }
            )

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.wait_for_load.assert_not_awaited()
            mock_controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_click_post_action_snapshot_retry_path_not_used_when_disabled(self):
        """Disabled auto-snapshot should skip all snapshot-retry calls."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "click",
                    "ref": "5",
                }
            )

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.wait_for_load.assert_not_awaited()
            mock_controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_snapshot_path_not_run_when_disabled(self):
        """Disabled auto-snapshot should not run even if wait path would fail."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.click.return_value = {"success": True}
            mock_controller.wait_for_load.return_value = {
                "success": False,
                "error": "timed out",
            }
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "click",
                    "ref": "5",
                }
            )

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.wait_for_load.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_status_does_not_add_post_action_snapshot(self):
        """Non-page-affecting actions should not include post-action snapshot data."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.close = mock.AsyncMock()
            mock_controller.get_page_snapshot = mock.AsyncMock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "act",
                    "request": {"kind": "close"},
                }
            )

            assert result.success is True
            assert result.data["action"] == "close"
            assert "post_action_snapshot" not in result.data
            mock_controller.get_page_snapshot.assert_not_awaited()


class TestTypeAction:
    """Test type action."""

    @pytest.mark.asyncio
    async def test_type_success(self):
        """Test successful type."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.type_text.return_value = {"success": True}
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "type",
                    "ref": "3",
                    "text": "Hello World",
                }
            )

            assert result.success is True
            assert result.data["text"] == "Hello World"


class TestScreenshotAction:
    """Test screenshot action."""

    @pytest.mark.asyncio
    async def test_screenshot_success(self):
        """Test successful screenshot."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.screenshot.return_value = b"pngdata"
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "screenshot",
                    "full_page": True,
                }
            )

            assert result.success is True
            assert result.data["format"] == "png"
            assert result.data["full_page"] is True
            assert "image_data" in result.data

    @pytest.mark.asyncio
    async def test_screenshot_element(self):
        """Test element screenshot."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.screenshot.return_value = b"pngdata"
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "screenshot",
                    "ref": "5",
                }
            )

            assert result.success is True
            assert result.data["ref"] == "5"

    @pytest.mark.asyncio
    async def test_screenshot_jpeg(self):
        """Test jpeg screenshot option."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.screenshot.return_value = b"jpegdata"
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "screenshot",
                    "type": "jpeg",
                }
            )

            assert result.success is True
            assert result.data["format"] == "jpeg"


class TestGetTabsAction:
    """Test get_tabs action."""

    @pytest.mark.asyncio
    async def test_get_tabs_success(self):
        """Test successful get_tabs."""
        from tools.browser.controller import BrowserTab

        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_tabs.return_value = [
                BrowserTab("id1", "Tab 1", "https://example.com"),
                BrowserTab("id2", "Tab 2", "https://google.com"),
            ]
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "get_tabs",
                }
            )

            assert result.success is True
            assert result.data["tab_count"] == 2
            assert len(result.data["tabs"]) == 2


class TestSwitchTabAction:
    """Test switch_tab action."""

    @pytest.mark.asyncio
    async def test_switch_tab_success_returns_status_title_and_url(self):
        """Successful switch_tab should report URL/title from get_status."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
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

            mock_controller.wait_for_load.return_value = {
                "success": True,
                "state": "load",
            }
            mock_controller.get_page_snapshot.return_value = PageSnapshot(
                text='[1] link "Example"',
                url="https://example.com/switched",
                title="Switched Tab",
                ref_count=1,
            )
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "switch_tab",
                    "target_id": "id2",
                }
            )

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
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.close = mock.AsyncMock()
            mock_get.return_value = mock_controller

            result = await execute_browser_control(
                {
                    "action": "close",
                }
            )

            assert result.success is True
            assert result.data["status"] == "closed"
            mock_controller.close.assert_called_once()
