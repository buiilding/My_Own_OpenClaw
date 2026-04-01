"""WindieOS browser automation package."""

from tools.browser.chrome_detection import (
    ChromeExecutable,
    find_all_chrome_executables,
    find_chrome_executable,
)
from tools.browser.chrome_launcher import (
    ChromeLaunchTimeoutError,
    ChromeLauncher,
    ChromeLauncherError,
    ChromeNotFoundError,
    DEFAULT_CDP_URL,
    ensure_chrome_with_cdp,
    is_cdp_available,
    launch_chrome_with_cdp,
)
from tools.browser.schemas import (
    BrowserClickArgs,
    BrowserCloseArgs,
    BrowserConnectArgs,
    BrowserControlArgs,
    BrowserEvaluateArgs,
    BrowserExtractArgs,
    BrowserGetTabsArgs,
    BrowserNavigateArgs,
    BrowserScreenshotArgs,
    BrowserScrollArgs,
    BrowserSnapshotArgs,
    BrowserWaitArgs,
)

try:
    from tools.browser.controller import BrowserController, get_browser_controller
    from tools.browser.browser_tool import execute_browser
except ImportError:
    BrowserController = None  # type: ignore
    get_browser_controller = None  # type: ignore
    execute_browser = None  # type: ignore

__all__ = [
    "BrowserClickArgs",
    "BrowserCloseArgs",
    "BrowserConnectArgs",
    "BrowserControlArgs",
    "BrowserController",
    "BrowserEvaluateArgs",
    "BrowserExtractArgs",
    "BrowserGetTabsArgs",
    "BrowserNavigateArgs",
    "BrowserScreenshotArgs",
    "BrowserScrollArgs",
    "BrowserSnapshotArgs",
    "BrowserWaitArgs",
    "ChromeExecutable",
    "ChromeLauncher",
    "ChromeLauncherError",
    "ChromeLaunchTimeoutError",
    "ChromeNotFoundError",
    "DEFAULT_CDP_URL",
    "ensure_chrome_with_cdp",
    "execute_browser",
    "find_all_chrome_executables",
    "find_chrome_executable",
    "get_browser_controller",
    "is_cdp_available",
    "launch_chrome_with_cdp",
]
