"""
Tests for backend browser remote tool.
"""

import pytest
from unittest import mock

from backend.src.tools.browser.remote_browser_tool import RemoteBrowserTool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.remote import REMOTE_TOOLS, get_remote_tool


class TestRemoteBrowserTool:
    """Test RemoteBrowserTool."""
    
    def test_tool_name(self):
        """Test tool has correct name."""
        tool = RemoteBrowserTool()
        assert tool.name == "browser_control"
    
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
        assert result.tool_name == "browser_control"
        assert result.args["action"] == "connect"


class TestBrowserToolRegistry:
    """Test browser tool in registry."""
    
    def test_browser_control_in_remote_tools(self):
        """Test browser_control is in REMOTE_TOOLS."""
        assert "browser_control" in REMOTE_TOOLS
        assert REMOTE_TOOLS["browser_control"] == RemoteBrowserTool
    
    def test_get_remote_tool_returns_browser_tool(self):
        """Test get_remote_tool returns browser tool."""
        tool_class = get_remote_tool("browser_control")
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
    
    def test_click_action(self):
        """Test click action args."""
        args = BrowserControlArgs(action="click", ref="5")
        assert args.action == "click"
        assert args.ref == "5"
    
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
    
    def test_default_values(self):
        """Test default values."""
        args = BrowserControlArgs(action="snapshot")
        assert args.format == "ai"
        assert args.max_chars == 5000
        assert args.button == "left"
        assert args.direction == "down"
        assert args.amount == 500
