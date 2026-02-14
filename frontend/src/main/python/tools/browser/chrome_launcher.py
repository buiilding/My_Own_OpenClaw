"""
Chrome launcher with auto-detection and CDP support.

Provides automatic Chrome detection, launch, and connection:
- Detects Chrome running with CDP
- Auto-launches Chrome if not running
- Transparent fallback to managed browser
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

from tools.browser.chrome_detection import find_chrome_executable

logger = logging.getLogger(__name__)

DEFAULT_CDP_URL = "http://127.0.0.1:9222"
DEFAULT_CDP_PORT = 9222
CHROME_STARTUP_TIMEOUT = 10  # seconds
CHROME_CHECK_INTERVAL = 0.5  # seconds


class ChromeLauncherError(Exception):
    """Base exception for Chrome launcher errors."""
    pass


class ChromeNotFoundError(ChromeLauncherError):
    """Raised when Chrome executable is not found."""
    pass


class ChromeLaunchTimeoutError(ChromeLauncherError):
    """Raised when Chrome fails to start within timeout."""
    pass


async def is_cdp_available(cdp_url: str = DEFAULT_CDP_URL, timeout: float = 2.0) -> bool:
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
                f"{cdp_url}/json/version",
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                return response.status == 200
    except Exception:
        return False


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
                timeout=5
            )
            if "chrome.exe" in result.stdout:
                # Parse PID from CSV output
                lines = result.stdout.strip().split("\n")
                if len(lines) > 1:
                    parts = lines[1].split('","')
                    if len(parts) > 1:
                        return int(parts[1].replace('"', ''))
        else:
            # Linux/macOS
            result = subprocess.run(
                ["pgrep", "-f", "chrome"],
                capture_output=True,
                text=True,
                timeout=5
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
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result == 0
    except Exception:
        return False


def get_chrome_user_data_dir() -> Path:
    """
    Get dedicated Chrome user data directory for CDP launches.

    This avoids launching CDP against the default profile directory.
    """
    system = platform.system()
    home = Path.home()

    if system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", home / "AppData" / "Local")
        return Path(local_app_data) / "Google" / "Chrome" / "User Data-cdp"
    if system == "Darwin":
        return home / "Library" / "Application Support" / "Google" / "Chrome-cdp"
    return home / ".config" / "google-chrome-cdp"


async def launch_chrome_with_cdp(
    cdp_port: int = DEFAULT_CDP_PORT,
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
            raise ChromeNotFoundError(
                "Chrome not found. Please install Google Chrome."
            )
        executable_path = exe.path
    
    logger.info(f"Launching Chrome with CDP on port {cdp_port}")

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
                subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)
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
    cdp_port: int = DEFAULT_CDP_PORT,
    auto_launch: bool = True,
    restart_if_needed: bool = False,
    headless: bool = False,
) -> str:
    """
    Ensure Chrome is running with CDP available.
    
    This is the main entry point - it handles all cases:
    1. CDP already available → return URL
    2. Chrome running without CDP → restart with CDP (if allowed)
    3. Chrome not running → launch with CDP (if allowed)
    4. None of above → raise error
    
    Args:
        cdp_port: Port for CDP
        auto_launch: Launch Chrome if not running
        restart_if_needed: Restart Chrome if running without CDP
        headless: Launch headless if auto-launching
    
    Returns:
        CDP URL for connection
    
    Raises:
        ChromeLauncherError: If Chrome cannot be made available
    """
    cdp_url = f"http://127.0.0.1:{cdp_port}"
    
    # Case 1: CDP already available
    if await is_cdp_available(cdp_url):
        logger.info(f"Chrome with CDP already available at {cdp_url}")
        return cdp_url
    
    # Check if Chrome is running
    chrome_pid = find_chrome_process()
    
    if chrome_pid:
        # Case 2: Chrome running but without CDP on our port
        logger.info(f"Chrome running (PID {chrome_pid}) but CDP not available")
        
        if restart_if_needed:
            logger.info("Restarting Chrome with CDP enabled")
            await kill_existing_chrome(graceful=True)
            await asyncio.sleep(1)  # Wait for shutdown
            
            _, cdp_url = await launch_chrome_with_cdp(
                cdp_port=cdp_port,
                headless=headless,
            )
            return cdp_url
        else:
            raise ChromeLauncherError(
                "Chrome is running but not with --remote-debugging-port. "
                "Please restart Chrome with: google-chrome --remote-debugging-port=9222 "
                "Or enable restart_if_needed to automatically restart."
            )
    
    # Case 3: Chrome not running
    if auto_launch:
        logger.info("Chrome not running, launching with CDP")
        _, cdp_url = await launch_chrome_with_cdp(
            cdp_port=cdp_port,
            headless=headless,
        )
        return cdp_url
    
    # Case 4: Cannot proceed
    raise ChromeLauncherError(
        "Chrome not running and auto_launch disabled. "
        "Please start Chrome with: google-chrome --remote-debugging-port=9222"
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
        cdp_port: int = DEFAULT_CDP_PORT,
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
