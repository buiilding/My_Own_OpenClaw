"""
Browser automation tools for WindieOS sidecar.

Provides web browser control via Playwright:
- User Chrome mode: Control existing Chrome via CDP
- Managed mode: Launch isolated Chromium instance
- AI snapshots: Numbered element refs for reliable interaction
- Full automation: click, type, scroll, screenshot, evaluate
"""

from tools.browser.controller import BrowserController, get_browser_controller
from tools.browser.browser_tool import execute_browser_control
from tools.browser.chrome_detection import (
    ChromeExecutable,
    find_chrome_executable,
    find_all_chrome_executables,
)
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

__all__ = [
    "BrowserController",
    "get_browser_controller",
    "execute_browser_control",
    "ChromeExecutable",
    "find_chrome_executable",
    "find_all_chrome_executables",
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
]
