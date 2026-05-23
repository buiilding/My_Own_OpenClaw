"""
Tests for browser tool registration in the registry.
"""

import pytest
from unittest import mock

from tools.registry import ToolRegistry

# Skip all tests if playwright is not installed
try:
    from tools.browser.browser_tool import execute_browser

    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="playwright not installed")
class TestBrowserToolRegistration:
    """Test browser tool is properly registered."""

    def test_browser_in_registry(self):
        """Test browser tool is in registry."""
        registry = ToolRegistry()
        assert "browser" in registry.tools

    @pytest.mark.asyncio
    async def test_execute_browser_via_registry(self):
        """Test executing browser tool through registry."""
        registry = ToolRegistry()

        with mock.patch("tools.browser.browser_use_engine.BrowserUseEngineRuntime._run_cli") as run_cli:
            run_cli.return_value = {"_raw_text": "[0]<button>Continue</button>"}
            result = await registry.execute_tool("browser", {
                "action": "connect",
                "explanation": "Connect the browser for the active task.",
            })
            assert result.success is True
            assert result.data["mode"] == "browser_use"
            run_cli.assert_awaited_once_with("state", headed=True)

    @pytest.mark.asyncio
    async def test_browser_validation_error(self):
        """Test validation error for browser."""
        registry = ToolRegistry()

        # Missing required action
        result = await registry.execute_tool("browser", {})

        assert result.success is False
        assert "action" in result.error.lower() or "Validation" in result.error
