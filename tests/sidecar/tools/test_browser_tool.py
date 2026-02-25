"""
Tests for browser tool implementation.
"""

import pytest

# Skip all tests if playwright is not installed
pytest.importorskip("playwright")

from unittest import mock

from tools.browser.browser_tool import execute_browser
from tools.browser.controller import reset_browser_controller
from tools.browser.browser_tool import AdapterActionResult


@pytest.fixture(autouse=True)
def reset_controller():
    """Reset controller before each test."""
    reset_browser_controller()


class TestExecuteBrowserControl:
    """Test main execute function."""

    @pytest.mark.asyncio
    async def test_missing_action(self):
        """Test error when action is missing."""
        result = await execute_browser({})

        assert result.success is False
        assert "action" in result.error.lower()

    @pytest.mark.asyncio
    async def test_unknown_action(self):
        """Test error for unknown action."""
        result = await execute_browser({"action": "unknown"})

        assert result.success is False
        assert "Unhandled" in result.error

    @pytest.mark.asyncio
    async def test_strict_canonical_mode_rejects_legacy_alias(self):
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY": "1"},
            clear=False,
        ):
            result = await execute_browser({"action": "type", "ref": "1", "text": "hello"})

        assert result.success is False
        assert (
            "Legacy browser actions are disabled by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1."
            in result.error
        )

    @pytest.mark.asyncio
    async def test_legacy_action_flag_can_disable_aliases(self):
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "0"},
            clear=False,
        ):
            result = await execute_browser({"action": "type", "ref": "1", "text": "hello"})

        assert result.success is False
        assert (
            "Legacy browser actions are disabled by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1."
            in result.error
        )

    @pytest.mark.asyncio
    async def test_legacy_aliases_disabled_by_default(self):
        with mock.patch.dict("os.environ", {}, clear=False):
            result = await execute_browser({"action": "type", "ref": "1", "text": "hello"})

        assert result.success is False
        assert (
            "Legacy browser actions are disabled by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1."
            in result.error
        )

    @pytest.mark.asyncio
    async def test_legacy_alias_block_logs_warning_by_default(self, caplog):
        with mock.patch.dict("os.environ", {}, clear=False):
            caplog.set_level("WARNING", logger="tools.browser.browser_tool")
            result = await execute_browser({"action": "type", "ref": "1", "text": "hello"})

        assert result.success is False
        assert (
            "Legacy browser action 'type' blocked by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1; "
            "prefer canonical action 'input'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'type' blocked by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1"
            in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "type"
        assert getattr(record, "preferred_action", None) == "input"
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1"

    @pytest.mark.asyncio
    async def test_strict_mode_takes_precedence_over_legacy_allow_flag(self):
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY": "1",
                "WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1",
            },
            clear=False,
        ):
            result = await execute_browser({"action": "press", "key": "Enter"})

        assert result.success is False
        assert (
            "Legacy browser actions are disabled by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1."
            in result.error
        )

    @pytest.mark.asyncio
    async def test_strict_mode_block_logs_canonical_gate(self, caplog):
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY": "1",
                "WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1",
            },
            clear=False,
        ):
            caplog.set_level("WARNING", logger="tools.browser.browser_tool")
            result = await execute_browser({"action": "press", "key": "Enter"})

        assert result.success is False
        assert (
            "Legacy browser action 'press' blocked by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1; "
            "prefer canonical action 'send_keys'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'press' blocked by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1"
            in rec.getMessage()
        )
        assert getattr(record, "legacy_action_gate", None) == "WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1"
        assert getattr(record, "legacy_action_blocked", None) is True

    @pytest.mark.asyncio
    async def test_legacy_disable_flag_still_allows_canonical_actions(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get_controller, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "0"},
            clear=False,
        ):
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get_controller.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="navigate",
                decision="port",
                data={"action": "navigate", "url": "https://example.com"},
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "navigate", "url": "https://example.com"})

        assert result.success is True
        assert result.data["action"] == "navigate"

    @pytest.mark.asyncio
    async def test_legacy_alias_logs_warning_when_allowed(self, caplog):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get_controller, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            caplog.set_level("WARNING", logger="tools.browser.browser_tool")
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get_controller.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="type",
                decision="compat",
                data={"action": "type", "browser_use_action": "input"},
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "type", "ref": "1", "text": "hello"})

        assert result.success is True
        assert "Legacy browser action 'type' invoked; prefer canonical action 'input'" in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'type' invoked; prefer canonical action 'input'"
            in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "type"
        assert getattr(record, "preferred_action", None) == "input"
        assert getattr(record, "legacy_action_blocked", None) is False
        assert getattr(record, "legacy_action_gate", None) is None

    @pytest.mark.asyncio
    async def test_validation_error(self):
        """Test validation error handling."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            result = await execute_browser({"action": "click"})  # Missing ref

        assert result.success is False
        assert "ref" in result.error.lower()


class TestPhase2AdapterRouting:
    """Validate Phase 2 browser adapter routing behavior."""

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

            result = await execute_browser(
                {"action": "navigate", "url": "https://example.com"}
            )

            assert result.success is True
            assert result.data["action"] == "navigate"
            assert result.data["url"] == "https://example.com"
            mock_get_adapter.assert_called_once()
            called_controller = mock_get_adapter.call_args.args[0]
            assert called_controller is mock_controller
            assert mock_get_adapter.call_args.kwargs == {}
            mock_adapter.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_adapter_failure_maps_to_tool_error(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get_controller, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get_controller.return_value = mock_controller

            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=False,
                action="type",
                decision="port",
                error="Input target not found",
                error_code="ELEMENT_NOT_FOUND",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {"action": "type", "ref": "missing", "text": "hello"}
            )

            assert result.success is False
            assert result.error == "Input target not found"

    @pytest.mark.asyncio
    async def test_profiles_action_uses_adapter(self):
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
                action="profiles",
                decision="compat",
                data={
                    "action": "profiles",
                    "profiles": [
                        {"name": "user_chrome", "driver": "cdp"},
                        {"name": "managed", "driver": "playwright"},
                    ],
                    "default_profile": "user_chrome",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "profiles"})

            assert result.success is True
            assert result.data["action"] == "profiles"
            mock_get_adapter.assert_called_once()


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

            result = await execute_browser(
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
    async def test_connect_managed_mode_is_ignored(self):
        """Test connect ignores managed mode and uses dedicated Windie connect path."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_controller.auto_connect_to_chrome.return_value = {
                "status": "connected",
                "mode": "user_chrome",
                "url": "about:blank",
                "auto_launched": True,
            }
            mock_get.return_value = mock_controller

            result = await execute_browser(
                {
                    "action": "connect",
                    "mode": "managed",
                    "headless": True,
                }
            )

            assert result.success is True
            assert result.data["mode"] == "user_chrome"
            mock_controller.auto_connect_to_chrome.assert_awaited_once()

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

            result = await execute_browser(
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="status",
                decision="port",
                data={
                    "action": "status",
                    "connected": True,
                    "mode": "managed",
                    "url": "https://example.com",
                    "title": "Example",
                    "tab_count": 1,
                    "target_id": "t1",
                    "native_source": "browser_use.state",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "status"})
            assert result.success is True
            assert result.data["action"] == "status"
            assert result.data["connected"] is True

    @pytest.mark.asyncio
    async def test_open_alias_removed(self, caplog):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            caplog.set_level("WARNING", logger="tools.browser.browser_tool")
            result = await execute_browser({"action": "open", "url": "https://example.com"})

            assert result.success is False
            assert "Legacy browser action 'open' has been removed." in (result.error or "")
            assert (
                "Legacy browser action 'open' blocked by legacy_alias_removed; "
                "prefer canonical action 'navigate'"
            ) in caplog.text
            mock_get.assert_not_called()

    @pytest.mark.asyncio
    async def test_success_payload_includes_legacy_deprecation_metadata(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="type",
                decision="compat",
                data={
                    "action": "type",
                    "browser_use_action": "input",
                    "legacy_action": "type",
                    "preferred_action": "input",
                },
                warnings=["'type' is a legacy compatibility alias; prefer 'input'"],
                deprecation="'type' is a legacy compatibility alias; prefer 'input'",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "type", "ref": "1", "text": "hello"})

            assert result.success is True
            assert result.data["deprecation"] == "'type' is a legacy compatibility alias; prefer 'input'"
            assert result.data["warnings"] == [
                "'type' is a legacy compatibility alias; prefer 'input'"
            ]
            assert result.data["legacy_action"] == "type"
            assert result.data["preferred_action"] == "input"

    @pytest.mark.asyncio
    async def test_act_alias_removed(self, caplog):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            caplog.set_level("WARNING", logger="tools.browser.browser_tool")
            result = await execute_browser(
                {"action": "act", "request": {"kind": "hover", "ref": "e1"}}
            )
            assert result.success is False
            assert "Legacy browser action 'act' has been removed." in (result.error or "")
            assert (
                "Legacy browser action 'act' blocked by legacy_alias_removed; "
                "prefer canonical action 'canonical actions directly'"
            ) in caplog.text
            record = next(
                rec
                for rec in caplog.records
                if "Legacy browser action 'act' blocked by legacy_alias_removed" in rec.getMessage()
            )
            assert getattr(record, "legacy_action", None) == "act"
            assert getattr(record, "preferred_action", None) == "canonical actions directly"
            assert getattr(record, "legacy_action_blocked", None) is True
            assert getattr(record, "legacy_action_gate", None) == "legacy_alias_removed"
            mock_get.assert_not_called()

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

            result = await execute_browser({"action": "console", "limit": 50})
            assert result.success is False
            assert "Unhandled action: console" == result.error

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

            result = await execute_browser(
                {"action": "dialog", "accept": False}
            )
            assert result.success is False
            assert "Unhandled action: dialog" == result.error

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

            result = await execute_browser(
                {"action": "dialog", "accept": True, "timeoutMs": 1000}
            )
            assert result.success is False
            assert "Unhandled action: dialog" == result.error

    @pytest.mark.asyncio
    async def test_errors_action(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_page_errors.return_value = [{"message": "boom"}]
            mock_get.return_value = mock_controller

            result = await execute_browser({"action": "errors"})
            assert result.success is False
            assert "Unhandled action: errors" == result.error

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

            result = await execute_browser({"action": "requests"})
            assert result.success is False
            assert "Unhandled action: requests" == result.error

    @pytest.mark.asyncio
    async def test_trace_start_action(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser({"action": "trace_start"})
            assert result.success is False
            assert "Unhandled action: trace_start" == result.error


class TestNavigateAction:
    """Test navigate action."""

    @pytest.mark.asyncio
    async def test_navigate_success(self):
        """Test successful navigation."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="navigate",
                decision="port",
                data={
                    "action": "navigate",
                    "browser_use_action": "navigate",
                    "url": "https://example.com",
                    "title": "Example",
                    "status": 200,
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
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

            result = await execute_browser(
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=False,
                action="navigate",
                decision="port",
                error="Connection refused",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
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
    async def test_snapshot_routes_to_adapter_and_returns_payload(self):
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
                action="snapshot",
                decision="port",
                data={
                    "action": "snapshot",
                    "browser_use_action": "snapshot",
                    "native_source": "browser_use.state",
                    "format": "browser_use_state",
                    "snapshot": "[1]<button>Buy now</button>",
                    "ref_count": 1,
                    "offset": 0,
                    "limit": 4000,
                    "returned_chars": 28,
                    "total_chars": 28,
                    "has_more": False,
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "snapshot",
                    "offset": 0,
                    "limit": 4000,
                }
            )

            assert result.success is True
            assert result.data["browser_use_action"] == "snapshot"
            assert "[1]" in result.data["snapshot"]
            mock_adapter.execute.assert_awaited_once_with(
                "snapshot",
                {"action": "snapshot", "offset": 0, "limit": 4000},
            )

    @pytest.mark.asyncio
    async def test_snapshot_rejects_compatibility_fields(self):
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
                action="snapshot",
                decision="compat",
                error="snapshot no longer supports compatibility 'format'; use Browser Use snapshot semantics",
                error_code="INVALID_ARGUMENT",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "snapshot",
                    "format": "ai",
                }
            )

            assert result.success is False
            assert "no longer supports compatibility 'format'" in result.error

    @pytest.mark.asyncio
    async def test_snapshot_not_connected(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get_controller, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = False
            mock_get_controller.return_value = mock_controller

            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=False,
                action="snapshot",
                decision="compat",
                error="Browser not connected. Run 'connect' action first.",
                error_code="BROWSER_NOT_CONNECTED",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "snapshot"})

            assert result.success is False
            assert "not connected" in result.error.lower()

class TestExtractAction:
    """Test extract action."""

    @pytest.mark.asyncio
    async def test_extract_success(self):
        """Extract should route through Browser Use runtime semantics."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="extract",
                decision="port",
                data={
                    "action": "extract",
                    "browser_use_action": "extract",
                    "extracted_content": "Pricing\\nPro plan $20",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "extract",
                    "query": "pro plan price",
                }
            )

            assert result.success is True
            assert result.data["action"] == "extract"
            assert result.data["browser_use_action"] == "extract"
            assert "Pro plan" in result.data["extracted_content"]

    @pytest.mark.asyncio
    async def test_extract_full_text_mode_rejected(self):
        """Compatibility extract modes are rejected in Browser Use-only runtime."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser(
                {
                    "action": "extract",
                    "query": "not-present",
                    "mode": "full_text",
                }
            )

            assert result.success is False
            assert "no longer supports compatibility 'mode'" in result.error

    @pytest.mark.asyncio
    async def test_extract_structured_mode_rejected(self):
        """Compatibility structured extraction mode is rejected."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser(
                {
                    "action": "extract",
                    "query": "api keys",
                    "mode": "structured",
                    "selector": "table",
                    "frame": "#content-frame",
                }
            )

            assert result.success is False
            assert "no longer supports compatibility 'mode'" in result.error

    @pytest.mark.asyncio
    async def test_extract_invalid_mode(self):
        """Extract should reject unknown modes."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser(
                {"action": "extract", "query": "pricing", "mode": "bad_mode"}
            )

            assert result.success is False
            assert "no longer supports compatibility 'mode'" in result.error

    @pytest.mark.asyncio
    async def test_extract_missing_query(self):
        """Extract should reject missing query."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser({"action": "extract"})

            assert result.success is False
            assert "query" in result.error.lower()

    @pytest.mark.asyncio
    async def test_extract_start_from_char_out_of_bounds(self):
        """Browser Use extract errors should surface through browser."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=False,
                action="extract",
                decision="port",
                error="start_from_char exceeds content length",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="click",
                decision="port",
                data={
                    "action": "click",
                    "browser_use_action": "click",
                    "params": {"index": 5},
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "click",
                    "index": 5,
                }
            )

            assert result.success is True
            assert result.data["browser_use_action"] == "click"

    @pytest.mark.asyncio
    async def test_click_failure(self):
        """Test click failure."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=False,
                action="click",
                decision="port",
                error="Element not found",
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "click",
                    "index": 999,
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

            result = await execute_browser(
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="click",
                decision="port",
                data={"action": "click"},
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "click",
                    "index": 5,
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="click",
                decision="port",
                data={"action": "click"},
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "click",
                    "index": 5,
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.wait_for_load.return_value = {
                "success": False,
                "error": "timed out",
            }
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="click",
                decision="port",
                data={"action": "click"},
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "click",
                    "index": 5,
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
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_controller.get_page_snapshot = mock.AsyncMock()
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="status",
                decision="port",
                data={
                    "action": "status",
                    "connected": True,
                    "mode": "managed",
                    "url": "https://example.com",
                    "title": "Example",
                    "tab_count": 1,
                    "target_id": "t1",
                    "native_source": "browser_use.state",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser({"action": "status"})

            assert result.success is True
            assert "post_action_snapshot" not in result.data
            mock_controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_act_alias_removed_even_when_legacy_enabled(self):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            result = await execute_browser(
                {
                    "action": "act",
                    "request": {"kind": "close"},
                }
            )

            assert result.success is False
            assert "Legacy browser action 'act' has been removed." in (result.error or "")
            mock_get.assert_not_called()
            mock_get_adapter.assert_not_called()


class TestTypeAction:
    """Test type action."""

    @pytest.mark.asyncio
    async def test_type_success(self):
        """Test successful type."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="type",
                decision="port",
                data={
                    "action": "type",
                    "browser_use_action": "input",
                    "text": "Hello World",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "type",
                    "ref": "3",
                    "text": "Hello World",
                }
            )

            assert result.success is True
            assert result.data["text"] == "Hello World"
            assert result.data["browser_use_action"] == "input"


class TestScreenshotAction:
    """Test screenshot action."""

    @pytest.mark.asyncio
    async def test_screenshot_success(self):
        """Test Browser Use screenshot success with native parameters."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="screenshot",
                decision="port",
                data={
                    "action": "screenshot",
                    "browser_use_action": "screenshot",
                    "native_source": "browser_use.tools",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
                {
                    "action": "screenshot",
                    "file_name": "capture.png",
                }
            )

            assert result.success is True
            assert result.data["browser_use_action"] == "screenshot"

    @pytest.mark.asyncio
    async def test_screenshot_element(self):
        """Legacy element screenshot fields are rejected."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser(
                {
                    "action": "screenshot",
                    "ref": "5",
                }
            )

            assert result.success is False
            assert "no longer supports compatibility 'ref'" in result.error

    @pytest.mark.asyncio
    async def test_screenshot_jpeg(self):
        """Legacy screenshot type field is rejected."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller

            result = await execute_browser(
                {
                    "action": "screenshot",
                    "type": "jpeg",
                }
            )

            assert result.success is False
            assert "no longer supports compatibility 'type'" in result.error


class TestGetTabsAction:
    """Test get_tabs action."""

    @pytest.mark.asyncio
    async def test_get_tabs_success(self):
        """Test successful get_tabs."""
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch(
            "tools.browser.browser_tool.get_browser_use_adapter"
        ) as mock_get_adapter:
            mock_controller = mock.AsyncMock()
            mock_controller.is_connected = True
            mock_get.return_value = mock_controller
            mock_adapter = mock.AsyncMock()
            mock_adapter.execute.return_value = AdapterActionResult(
                success=True,
                action="get_tabs",
                decision="port",
                data={
                    "action": "get_tabs",
                    "tab_count": 2,
                    "tabs": [
                        {"target_id": "id1", "title": "Tab 1", "url": "https://example.com"},
                        {"target_id": "id2", "title": "Tab 2", "url": "https://google.com"},
                    ],
                    "native_source": "browser_use.state",
                },
            )
            mock_get_adapter.return_value = mock_adapter

            result = await execute_browser(
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
    async def test_switch_tab_alias_removed(self, caplog):
        with mock.patch(
            "tools.browser.browser_tool.get_browser_controller"
        ) as mock_get, mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            caplog.set_level("WARNING", logger="tools.browser.browser_tool")
            result = await execute_browser(
                {
                    "action": "switch_tab",
                    "target_id": "id2",
                }
            )

            assert result.success is False
            assert "Legacy browser action 'switch_tab' has been removed." in (result.error or "")
            assert (
                "Legacy browser action 'switch_tab' blocked by legacy_alias_removed; "
                "prefer canonical action 'switch'"
            ) in caplog.text
            mock_get.assert_not_called()


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

            result = await execute_browser(
                {
                    "action": "close",
                }
            )

            assert result.success is True
            assert result.data["status"] == "closed"
            mock_controller.close.assert_called_once()
