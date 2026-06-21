"""
Tests for browser tool registration in the registry.
"""

import pytest
from unittest import mock
from pathlib import Path

from tools.registry import ToolRegistry


REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_RUNTIME_TOOL_HELPER_PATHS = [
    REPO_ROOT / "frontend" / "src" / "main" / "python" / "tools" / "result.py",
    REPO_ROOT / "frontend" / "src" / "main" / "python" / "tools" / "schemas.py",
    REPO_ROOT
    / "frontend"
    / "src"
    / "main"
    / "python"
    / "windie_shared"
    / "browser_contract.py",
    REPO_ROOT
    / "frontend"
    / "src"
    / "main"
    / "python"
    / "tools"
    / "browser"
    / "browser_use_engine.py",
    REPO_ROOT
    / "frontend"
    / "src"
    / "main"
    / "python"
    / "tools"
    / "browser"
    / "chrome_launcher.py",
    REPO_ROOT
    / "frontend"
    / "src"
    / "main"
    / "python"
    / "tools"
    / "browser"
    / "content_extraction.py",
    REPO_ROOT
    / "frontend"
    / "src"
    / "main"
    / "python"
    / "tools"
    / "browser"
    / "file_store.py",
]


def _is_missing_playwright_import(error: ImportError) -> bool:
    missing_name = getattr(error, "name", None)
    return isinstance(missing_name, str) and (
        missing_name == "playwright" or missing_name.startswith("playwright.")
    )


# Skip all tests only if the optional Playwright dependency itself is unavailable.
# Import failures from dedicated browser modules should fail collection.
try:
    from tools.browser.browser_tool import execute_browser

    PLAYWRIGHT_AVAILABLE = True
except ImportError as exc:
    if not _is_missing_playwright_import(exc):
        raise
    execute_browser = None
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
            run_cli.assert_awaited_once_with(
                "state",
                headed=True,
                cdp_url="http://127.0.0.1:9333",
            )

    @pytest.mark.asyncio
    async def test_browser_validation_error(self):
        """Test validation error for browser."""
        registry = ToolRegistry()

        # Missing required action
        result = await registry.execute_tool("browser", {})

        assert result.success is False
        assert "action" in result.error.lower() or "Validation" in result.error


def test_browser_import_guard_only_skips_missing_playwright():
    assert _is_missing_playwright_import(
        ImportError("No module named playwright", name="playwright")
    ) is True
    assert _is_missing_playwright_import(
        ImportError(
            "No module named tools.browser.internal_missing",
            name="tools.browser.internal_missing",
        )
    ) is False


def test_local_runtime_tool_helper_copy_uses_local_runtime_terms():
    sources = "\n".join(
        path.read_text(encoding="utf-8") for path in LOCAL_RUNTIME_TOOL_HELPER_PATHS
    )

    retired_runtime_label = "Python " + "sidecar runtime"

    assert "Python local-runtime tool" in sources
    assert "shared by backend and local runtime" in sources
    assert retired_runtime_label not in sources
    assert "shared by backend and " + "sidecar" not in sources
    assert "Windie-owned" not in sources
    assert "DEFAULT_WINDIE_CDP" not in sources
    assert "terminate_windie_chrome" not in sources
    assert "_iter_windie_chrome" not in sources
    assert "windie_dedicated_browser" not in sources
    assert "local backend tools" not in sources
    assert "local backend." not in sources
