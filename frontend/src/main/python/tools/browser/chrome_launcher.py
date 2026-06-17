"""
Chrome launcher with auto-detection and CDP support.

Provides automatic Chrome detection, launch, and connection:
- Uses a dedicated Chrome profile
- Auto-launches/attaches to a dedicated CDP instance
- Leaves the user's default Chrome instance untouched
"""

import asyncio
import logging
import os
import platform
import subprocess
import time
from pathlib import Path
from typing import List, Optional, Tuple

import aiohttp
import psutil
from core.user_data_paths import app_user_data_root
from tools.browser.chrome_detection import find_chrome_executable

logger = logging.getLogger(__name__)

DEFAULT_CDP_PORT = 9333
CHROME_STARTUP_TIMEOUT = 10  # seconds
CHROME_CHECK_INTERVAL = 0.5  # seconds


def _resolve_default_cdp_port() -> int:
    raw = os.getenv("WINDIE_BROWSER_CDP_PORT", "").strip()
    if not raw:
        return DEFAULT_CDP_PORT
    try:
        parsed = int(raw)
        if parsed <= 0:
            raise ValueError
        return parsed
    except ValueError:
        logger.warning(
            "Invalid WINDIE_BROWSER_CDP_PORT=%r; falling back to %d",
            raw,
            DEFAULT_CDP_PORT,
        )
        return DEFAULT_CDP_PORT


DEFAULT_DEDICATED_CDP_PORT = _resolve_default_cdp_port()
DEFAULT_DEDICATED_CDP_URL = f"http://127.0.0.1:{DEFAULT_DEDICATED_CDP_PORT}"


class ChromeLauncherError(Exception):
    """Base exception for Chrome launcher errors."""

    pass


class ChromeNotFoundError(ChromeLauncherError):
    """Raised when Chrome executable is not found."""

    pass


class ChromeLaunchTimeoutError(ChromeLauncherError):
    """Raised when Chrome fails to start within timeout."""

    pass


async def is_cdp_available(
    cdp_url: str = DEFAULT_DEDICATED_CDP_URL, timeout: float = 2.0
) -> bool:
    """
    Check if Chrome is running with CDP available.

    Args:
        cdp_url: CDP endpoint URL
        timeout: Connection timeout in seconds

    Returns:
        True if CDP is available, False otherwise
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{cdp_url}/json/version", timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                return response.status == 200
    except Exception:
        return False


async def is_cdp_download_behavior_supported(
    cdp_url: str = DEFAULT_DEDICATED_CDP_URL,
    timeout: float = 2.0,
) -> bool:
    """
    Check whether the CDP browser endpoint supports Playwright's attach setup.

    Playwright's CDP attach path sends Browser.setDownloadBehavior while
    initializing the default context. Some stale or embedded CDP endpoints accept
    the websocket but reject that command with "Browser context management is not
    supported", which makes connect_over_cdp fail immediately.
    """
    try:
        request_timeout = aiohttp.ClientTimeout(total=timeout)
        async with aiohttp.ClientSession(timeout=request_timeout) as session:
            async with session.get(f"{cdp_url}/json/version") as response:
                if response.status != 200:
                    return False
                version_payload = await response.json()

            websocket_url = version_payload.get("webSocketDebuggerUrl")
            if not websocket_url:
                return False

            async with session.ws_connect(websocket_url, timeout=timeout) as ws:
                await ws.send_json(
                    {
                        "id": 1,
                        "method": "Browser.setDownloadBehavior",
                        "params": {"behavior": "default"},
                    }
                )
                message = await ws.receive(timeout=timeout)
                if message.type != aiohttp.WSMsgType.TEXT:
                    return False
                payload = message.json()
                error = payload.get("error")
                if not error:
                    return True
                logger.warning(
                    "Dedicated browser CDP endpoint rejected download behavior probe: %s",
                    error.get("message", error),
                )
                return False
    except Exception as e:
        logger.debug("Error probing CDP download behavior support: %s", e)
        return False


def _iter_dedicated_chrome_processes(cdp_port: int) -> List[psutil.Process]:
    """Return Chrome processes that match the dedicated profile and CDP port."""
    user_data_arg = f"--user-data-dir={get_chrome_user_data_dir()}"
    port_arg = f"--remote-debugging-port={cdp_port}"
    matches: List[psutil.Process] = []

    for process in psutil.process_iter(["cmdline"]):
        try:
            cmdline = process.info.get("cmdline") or []
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if port_arg in cmdline and user_data_arg in cmdline:
            matches.append(process)

    return matches


async def terminate_dedicated_chrome_with_cdp(cdp_port: int) -> int:
    """Terminate only dedicated-profile Chrome processes for the requested CDP port."""
    processes = _iter_dedicated_chrome_processes(cdp_port)
    if not processes:
        return 0

    for process in processes:
        try:
            process.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.debug("Could not terminate dedicated browser process: %s", e)

    _, alive = psutil.wait_procs(processes, timeout=3)
    for process in alive:
        try:
            process.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.debug("Could not kill dedicated browser process: %s", e)

    await asyncio.sleep(CHROME_CHECK_INTERVAL)
    return len(processes)


def get_chrome_user_data_dir() -> Path:
    """
    Get the dedicated Chrome profile directory.

    This profile is separate from the user's default Chrome profile so
    credentials and browser state are isolated to browser automation.
    """
    system = platform.system()
    home = Path.home()

    if system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local"))
        return Path(local_app_data) / "windieos" / "BrowserProfile"
    return app_user_data_root() / "BrowserProfile"


async def launch_chrome_with_cdp(
    cdp_port: int = DEFAULT_DEDICATED_CDP_PORT,
    headless: bool = False,
    executable_path: Optional[str] = None,
    extra_args: Optional[List[str]] = None,
) -> Tuple[subprocess.Popen, str]:
    """
    Launch Chrome with CDP enabled.

    Args:
        cdp_port: Port for Chrome DevTools Protocol
        headless: Run without UI
        executable_path: Optional path to Chrome executable
        extra_args: Additional Chrome arguments

    Returns:
        Tuple of (process, cdp_url)

    Raises:
        ChromeNotFoundError: If Chrome executable not found
        ChromeLaunchTimeoutError: If Chrome fails to start
    """
    # Find Chrome executable
    if not executable_path:
        exe = find_chrome_executable()
        if not exe:
            raise ChromeNotFoundError("Chrome not found. Please install Google Chrome.")
        executable_path = exe.path

    logger.info("Launching dedicated browser instance with CDP on port %s", cdp_port)

    user_data_dir = get_chrome_user_data_dir()
    user_data_dir.mkdir(parents=True, exist_ok=True)

    # Build command arguments
    args = [
        executable_path,
        f"--remote-debugging-port={cdp_port}",
        f"--user-data-dir={user_data_dir}",
        "--profile-directory=Default",
    ]

    if headless:
        args.append("--headless=new")
        args.append("--disable-gpu")

    if extra_args:
        args.extend(extra_args)

    # Launch Chrome
    try:
        if platform.system() == "Windows":
            # On Windows, use CREATE_NEW_PROCESS_GROUP to allow clean termination
            process = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            )
        else:
            process = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,  # Detach from parent
            )
    except Exception as e:
        raise ChromeLauncherError(f"Failed to launch Chrome: {e}") from e

    cdp_url = f"http://127.0.0.1:{cdp_port}"

    # Wait for CDP to be available
    start_time = time.time()
    while time.time() - start_time < CHROME_STARTUP_TIMEOUT:
        if await is_cdp_available(cdp_url, timeout=1.0):
            logger.info(f"Chrome launched successfully with CDP at {cdp_url}")
            return process, cdp_url
        await asyncio.sleep(CHROME_CHECK_INTERVAL)

    # Timeout - kill process and raise error
    try:
        process.terminate()
        await asyncio.sleep(1)
        if process.poll() is None:
            process.kill()
    except Exception:
        pass

    raise ChromeLaunchTimeoutError(
        f"Chrome failed to start CDP within {CHROME_STARTUP_TIMEOUT} seconds"
    )


async def ensure_chrome_with_cdp(
    cdp_port: int = DEFAULT_DEDICATED_CDP_PORT,
    auto_launch: bool = True,
    headless: bool = False,
) -> str:
    """
    Ensure the dedicated Chrome instance is running with CDP.

    This path intentionally does not inspect/kill the user's default Chrome
    process. If the dedicated CDP endpoint is unavailable, it launches a
    separate Chrome instance with dedicated profile data.

    Args:
        cdp_port: Port for CDP
        auto_launch: Launch Chrome if not running
        headless: Launch headless if auto-launching

    Returns:
        CDP URL for connection

    Raises:
        ChromeLauncherError: If Chrome cannot be made available
    """
    cdp_url = f"http://127.0.0.1:{cdp_port}"

    # Case 1: dedicated CDP endpoint already available and compatible.
    if await is_cdp_available(cdp_url):
        if await is_cdp_download_behavior_supported(cdp_url):
            logger.info("Dedicated browser with CDP already available at %s", cdp_url)
            return cdp_url

        terminated = await terminate_dedicated_chrome_with_cdp(cdp_port)
        if terminated:
            logger.warning(
                "Restarting dedicated browser because existing CDP endpoint at %s "
                "does not support Playwright attach setup",
                cdp_url,
            )
        else:
            raise ChromeLauncherError(
                "Dedicated browser CDP endpoint is available but does not support "
                "Playwright attach setup, and the process is not a dedicated "
                "browser process that can be restarted safely."
            )

    # Case 2: dedicated CDP endpoint unavailable -> launch dedicated instance.
    if auto_launch:
        logger.info(
            "Dedicated browser CDP endpoint unavailable; launching dedicated instance"
        )
        _, cdp_url = await launch_chrome_with_cdp(
            cdp_port=cdp_port,
            headless=headless,
        )
        return cdp_url

    # Case 3: Cannot proceed
    raise ChromeLauncherError(
        "Dedicated browser is not running and auto_launch is disabled. "
        f"Start a dedicated browser instance with --remote-debugging-port={cdp_port}."
    )
