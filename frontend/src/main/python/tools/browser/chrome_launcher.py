"""
Chrome launcher with auto-detection and CDP support.

Provides automatic Chrome detection, launch, and connection:
- Uses a WindieOS-dedicated Chrome profile
- Auto-launches/attaches to a WindieOS CDP instance
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
from urllib.parse import urlparse

import aiohttp
import psutil

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


DEFAULT_WINDIE_CDP_PORT = _resolve_default_cdp_port()
DEFAULT_WINDIE_CDP_URL = f"http://127.0.0.1:{DEFAULT_WINDIE_CDP_PORT}"
DEFAULT_CDP_URL = DEFAULT_WINDIE_CDP_URL


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
    cdp_url: str = DEFAULT_WINDIE_CDP_URL, timeout: float = 2.0
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
    cdp_url: str = DEFAULT_WINDIE_CDP_URL,
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
                    "WindieOS browser CDP endpoint rejected download behavior probe: %s",
                    error.get("message", error),
                )
                return False
    except Exception as e:
        logger.debug("Error probing CDP download behavior support: %s", e)
        return False


def _iter_windie_chrome_processes(cdp_port: int) -> List[psutil.Process]:
    """Return Chrome processes that match WindieOS' dedicated profile and CDP port."""
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


async def terminate_windie_chrome_with_cdp(cdp_port: int) -> int:
    """Terminate only WindieOS-owned Chrome processes for the requested CDP port."""
    processes = _iter_windie_chrome_processes(cdp_port)
    if not processes:
        return 0

    for process in processes:
        try:
            process.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.debug("Could not terminate WindieOS browser process: %s", e)

    _, alive = psutil.wait_procs(processes, timeout=3)
    for process in alive:
        try:
            process.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.debug("Could not kill WindieOS browser process: %s", e)

    await asyncio.sleep(CHROME_CHECK_INTERVAL)
    return len(processes)


def find_chrome_process() -> Optional[int]:
    """
    Find Chrome process ID if running.

    Returns:
        Process ID if found, None otherwise
    """
    system = platform.system()

    try:
        if system == "Windows":
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq chrome.exe", "/FO", "CSV"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if "chrome.exe" in result.stdout:
                # Parse PID from CSV output
                lines = result.stdout.strip().split("\n")
                if len(lines) > 1:
                    parts = lines[1].split('","')
                    if len(parts) > 1:
                        return int(parts[1].replace('"', ""))
        else:
            # Linux/macOS
            result = subprocess.run(
                ["pgrep", "-f", "chrome"], capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                pids = [int(p) for p in result.stdout.strip().split("\n") if p.strip()]
                return pids[0] if pids else None
    except Exception as e:
        logger.debug(f"Error finding Chrome process: {e}")

    return None


def is_chrome_running_with_cdp(port: int = DEFAULT_CDP_PORT) -> bool:
    """
    Check if Chrome is running with CDP on specific port.

    Args:
        port: CDP port to check

    Returns:
        True if Chrome is running with CDP on that port
    """
    # Quick check: is anything listening on the port?
    try:
        import socket

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(("127.0.0.1", port))
        sock.close()
        return result == 0
    except Exception:
        return False


def get_chrome_user_data_dir() -> Path:
    """
    Get WindieOS-owned Chrome profile directory.

    This profile is separate from the user's default Chrome profile so
    credentials and browser state are isolated to WindieOS automation.
    """
    system = platform.system()
    home = Path.home()

    if system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local"))
        return Path(local_app_data) / "WindieOS" / "BrowserProfile"
    if system == "Darwin":
        return home / "Library" / "Application Support" / "WindieOS" / "BrowserProfile"
    return home / ".config" / "windieos" / "browser-profile"


async def launch_chrome_with_cdp(
    cdp_port: int = DEFAULT_WINDIE_CDP_PORT,
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

    logger.info("Launching WindieOS browser instance with CDP on port %s", cdp_port)

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


async def kill_existing_chrome(graceful: bool = True) -> bool:
    """
    Kill existing Chrome process.

    Args:
        graceful: Try graceful termination first

    Returns:
        True if Chrome was killed, False if not running
    """
    system = platform.system()

    try:
        if find_chrome_process() is None:
            return False
        if system == "Windows":
            if graceful:
                subprocess.run(["taskkill", "/IM", "chrome.exe"], capture_output=True)
            else:
                subprocess.run(
                    ["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True
                )
        else:
            if graceful:
                subprocess.run(["pkill", "-f", "chrome"], capture_output=True)
            else:
                subprocess.run(["pkill", "-9", "-f", "chrome"], capture_output=True)

        # Wait for process to die
        await asyncio.sleep(2)
        return find_chrome_process() is None
    except Exception as e:
        logger.warning(f"Error killing Chrome: {e}")
        return False


async def ensure_chrome_with_cdp(
    cdp_port: int = DEFAULT_WINDIE_CDP_PORT,
    auto_launch: bool = True,
    headless: bool = False,
) -> str:
    """
    Ensure the WindieOS-dedicated Chrome instance is running with CDP.

    This path intentionally does not inspect/kill the user's default Chrome
    process. If the WindieOS CDP endpoint is unavailable, it launches a
    separate Chrome instance with WindieOS profile data.

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

    # Case 1: WindieOS CDP endpoint already available and compatible.
    if await is_cdp_available(cdp_url):
        if await is_cdp_download_behavior_supported(cdp_url):
            logger.info("WindieOS browser with CDP already available at %s", cdp_url)
            return cdp_url

        terminated = await terminate_windie_chrome_with_cdp(cdp_port)
        if terminated:
            logger.warning(
                "Restarting WindieOS browser because existing CDP endpoint at %s "
                "does not support Playwright attach setup",
                cdp_url,
            )
        else:
            raise ChromeLauncherError(
                "WindieOS browser CDP endpoint is available but does not support "
                "Playwright attach setup, and the process is not a WindieOS-owned "
                "browser that can be restarted safely."
            )

    # Case 2: WindieOS CDP endpoint unavailable -> launch dedicated instance.
    if auto_launch:
        logger.info(
            "WindieOS browser CDP endpoint unavailable; launching dedicated instance"
        )
        _, cdp_url = await launch_chrome_with_cdp(
            cdp_port=cdp_port,
            headless=headless,
        )
        return cdp_url

    # Case 3: Cannot proceed
    raise ChromeLauncherError(
        "WindieOS browser is not running and auto_launch is disabled. "
        f"Start a WindieOS browser instance with --remote-debugging-port={cdp_port}."
    )


class ChromeLauncher:
    """
    High-level Chrome launcher with lifecycle management.

    Example:
        launcher = ChromeLauncher()
        cdp_url = await launcher.launch()
        # ... use browser ...
        await launcher.shutdown()
    """

    def __init__(
        self,
        cdp_port: int = DEFAULT_WINDIE_CDP_PORT,
        auto_launch: bool = True,
        headless: bool = False,
    ):
        self.cdp_port = cdp_port
        self.cdp_url = f"http://127.0.0.1:{cdp_port}"
        self.auto_launch = auto_launch
        self.headless = headless
        self.process: Optional[subprocess.Popen] = None
        self._launched_by_us = False

    async def launch(self) -> str:
        """
        Launch or connect to Chrome.

        Returns:
            CDP URL
        """
        # Check if already available
        if await is_cdp_available(self.cdp_url):
            logger.info(f"Using existing Chrome with CDP at {self.cdp_url}")
            return self.cdp_url

        # Launch new Chrome
        if self.auto_launch:
            self.process, self.cdp_url = await launch_chrome_with_cdp(
                cdp_port=self.cdp_port,
                headless=self.headless,
            )
            self._launched_by_us = True
            return self.cdp_url

        raise ChromeLauncherError("CDP not available and auto_launch disabled")

    async def shutdown(self, kill: bool = False):
        """
        Shutdown Chrome if we launched it.

        Args:
            kill: Force kill even if we didn't launch it
        """
        if self.process and self._launched_by_us:
            logger.info("Shutting down Chrome we launched")
            try:
                self.process.terminate()
                await asyncio.sleep(1)
                if self.process.poll() is None:
                    self.process.kill()
            except Exception as e:
                logger.warning(f"Error shutting down Chrome: {e}")
        elif kill:
            await kill_existing_chrome(graceful=False)
