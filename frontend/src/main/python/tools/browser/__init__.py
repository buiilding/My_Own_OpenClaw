"""
Browser automation tools for WindieOS sidecar.

Provides web browser control via Playwright:
- User Chrome mode: Control existing Chrome via CDP
- Managed mode: Launch isolated Chromium instance
- AI snapshots: Numbered element refs for reliable interaction
- Full automation: click, type, scroll, screenshot, evaluate
"""

# Chrome detection (no external deps)
from tools.browser.chrome_detection import (
    ChromeExecutable,
    find_chrome_executable,
    find_all_chrome_executables,
)

# Schemas (no external deps)
from tools.browser.schemas import (
    BrowserConnectArgs,
    BrowserNavigateArgs,
    BrowserSnapshotArgs,
    BrowserClickArgs,
    BrowserTypeArgs,
    BrowserPressArgs,
    BrowserScrollArgs,
    BrowserScreenshotArgs,
    BrowserWaitArgs,
    BrowserGetTabsArgs,
    BrowserSwitchTabArgs,
    BrowserEvaluateArgs,
    BrowserCloseArgs,
)

# Optional imports (require playwright)
try:
    from tools.browser.controller import BrowserController, get_browser_controller
    from tools.browser.browser_tool import execute_browser_control
except ImportError:
    # Playwright not installed
    BrowserController = None  # type: ignore
    get_browser_controller = None  # type: ignore
    execute_browser_control = None  # type: ignore

__all__ = [
    # Chrome detection
    "ChromeExecutable",
    "find_chrome_executable",
    "find_all_chrome_executables",
    # Schemas
    "BrowserConnectArgs",
    "BrowserNavigateArgs",
    "BrowserSnapshotArgs",
    "BrowserClickArgs",
    "BrowserTypeArgs",
    "BrowserPressArgs",
    "BrowserScrollArgs",
    "BrowserScreenshotArgs",
    "BrowserWaitArgs",
    "BrowserGetTabsArgs",
    "BrowserSwitchTabArgs",
    "BrowserEvaluateArgs",
    "BrowserCloseArgs",
    # Controller (may be None if playwright not installed)
    "BrowserController",
    "get_browser_controller",
    "execute_browser_control",
]
