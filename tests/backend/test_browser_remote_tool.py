"""
Tests for backend browser remote tool.
"""

import pytest
from unittest import mock

from backend.src.tools.browser import RemoteBrowserTool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.browser.openclaw_compat_schema import BrowserOpenClawCompatArgs
from backend.src.tools.remote import REMOTE_TOOLS, get_remote_tool


class TestRemoteBrowserTool:
    """Test RemoteBrowserTool."""

    def test_tool_name(self):
        """Test tool has correct name."""
        tool = RemoteBrowserTool()
        assert tool.name == "browser"

    def test_tool_category(self):
        """Test tool has correct category."""
        from backend.src.tools.categorization import ToolDomain

        tool = RemoteBrowserTool()
        assert tool.category == ToolDomain.BROWSER

    def test_tool_has_description(self):
        """Test tool has description."""
        tool = RemoteBrowserTool()
        assert len(tool.description) > 100
        assert "browser" in tool.description.lower()

    def test_args_model(self):
        """Test tool has correct args model."""
        tool = RemoteBrowserTool()
        assert tool.args_model == BrowserControlArgs

    @pytest.mark.asyncio
    async def test_execute_remote_returns_remote_result(self):
        """Test execute_remote returns RemoteToolResult."""
        tool = RemoteBrowserTool()

        # Mock context
        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "test-123"}

        args = BrowserControlArgs(action="connect", mode="user_chrome")
        result = await tool.execute_remote(args, mock_ctx)

        assert result.is_remote is True
        assert result.tool_name == "browser"
        assert result.args["action"] == "connect"


class TestBrowserToolRegistry:
    """Test browser tool in registry."""

    def test_browser_in_remote_tools(self):
        """Test browser is in REMOTE_TOOLS."""
        assert "browser" in REMOTE_TOOLS
        assert REMOTE_TOOLS["browser"] == RemoteBrowserTool

    def test_get_remote_tool_returns_browser_tool(self):
        """Test get_remote_tool returns browser tool."""
        tool_class = get_remote_tool("browser")
        assert tool_class == RemoteBrowserTool


class TestBrowserControlArgs:
    """Test BrowserControlArgs schema."""

    def test_connect_action(self):
        """Test connect action args."""
        args = BrowserControlArgs(action="connect", mode="user_chrome")
        assert args.action == "connect"
        assert args.mode == "user_chrome"

    def test_navigate_action(self):
        """Test navigate action args."""
        args = BrowserControlArgs(
            action="navigate",
            url="https://example.com",
        )
        assert args.action == "navigate"
        assert args.url == "https://example.com"

    def test_status_action(self):
        """Test OpenClaw-compatible status action args."""
        args = BrowserControlArgs(action="status")
        assert args.action == "status"

    def test_search_action(self):
        """Test Browser Use search action args."""
        args = BrowserControlArgs(action="search", query="pricing tiers")
        assert args.action == "search"
        assert args.query == "pricing tiers"

    def test_extract_action(self):
        """Test extract action args."""
        args = BrowserControlArgs(action="extract", query="collect pricing tiers")
        assert args.action == "extract"
        assert args.query == "collect pricing tiers"
        assert args.start_from_char == 0
        assert args.extract_links is False

    def test_click_action(self):
        """Test click action args."""
        args = BrowserControlArgs(action="click", ref="5")
        assert args.action == "click"
        assert args.ref == "5"

    def test_click_action_with_coordinates(self):
        """Test Browser Use coordinate click args."""
        args = BrowserControlArgs(action="click", coordinate_x=100, coordinate_y=250)
        assert args.action == "click"
        assert args.coordinate_x == 100
        assert args.coordinate_y == 250

    def test_type_action(self):
        """Test type action args."""
        args = BrowserControlArgs(
            action="type",
            ref="3",
            text="Hello",
            submit=True,
        )
        assert args.action == "type"
        assert args.ref == "3"
        assert args.text == "Hello"
        assert args.submit is True

    def test_press_action_key_field(self):
        """Test press action key field remains available."""
        args = BrowserControlArgs(action="press", key="Enter")
        assert args.action == "press"
        assert args.key == "Enter"

    def test_screenshot_action_supports_file_name(self):
        """Test screenshot action keeps file_name support."""
        args = BrowserControlArgs(action="screenshot", file_name="capture.png")
        assert args.action == "screenshot"
        assert args.file_name == "capture.png"

    def test_default_values(self):
        """Test default values."""
        args = BrowserControlArgs(action="snapshot")
        assert args.format == "ai"
        assert args.max_chars is None
        assert args.button == "left"
        assert args.direction == "down"
        assert args.amount == 500

    def test_scroll_action_with_fractional_pages(self):
        """Test Browser Use fractional scroll pages."""
        args = BrowserControlArgs(action="scroll", pages=0.5)
        assert args.pages == 0.5

    def test_openclaw_compat_args_still_available(self):
        """Test OpenClaw-specific schema model remains available after split."""
        args = BrowserOpenClawCompatArgs(action="status")
        assert args.action == "status"
