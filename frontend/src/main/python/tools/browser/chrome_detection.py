"""
Cross-platform Chrome/Chromium browser detection.

Detects Chrome, Brave, Edge, Chromium, and Chrome Canary across
Linux, macOS, and Windows platforms.
"""

import os
import platform
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class ChromeExecutable:
    """Represents a detected Chrome executable."""

    path: str
    kind: str  # chrome, brave, edge, chromium, chrome_canary


def _exists(path: str) -> bool:
    """Check if file exists and is executable."""
    return os.path.isfile(path) and os.access(path, os.X_OK)


def _find_in_path(name: str) -> Optional[str]:
    """Find executable in PATH."""
    try:
        result = subprocess.run(
            ["which", name], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            path = result.stdout.strip()
            if _exists(path):
                return path
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def _find_linux_chrome() -> List[ChromeExecutable]:
    """Find Chrome executables on Linux."""
    candidates = [
        # Chrome
        ("/usr/bin/google-chrome", "chrome"),
        ("/usr/bin/google-chrome-stable", "chrome"),
        ("/opt/google/chrome/google-chrome", "chrome"),
        # Chromium
        ("/usr/bin/chromium", "chromium"),
        ("/usr/bin/chromium-browser", "chromium"),
        ("/snap/bin/chromium", "chromium"),
        # Brave
        ("/usr/bin/brave", "brave"),
        ("/usr/bin/brave-browser", "brave"),
        ("/opt/brave.com/brave/brave", "brave"),
        # Edge
        ("/usr/bin/microsoft-edge", "edge"),
        ("/usr/bin/microsoft-edge-stable", "edge"),
        ("/opt/microsoft/msedge/microsoft-edge", "edge"),
    ]

    found = []
    seen_paths = set()

    for path, kind in candidates:
        if path not in seen_paths and _exists(path):
            found.append(ChromeExecutable(path=path, kind=kind))
            seen_paths.add(path)

    # Also check PATH
    for name, kind in [
        ("google-chrome", "chrome"),
        ("google-chrome-stable", "chrome"),
        ("chromium", "chromium"),
        ("chromium-browser", "chromium"),
        ("brave", "brave"),
        ("brave-browser", "brave"),
        ("microsoft-edge", "edge"),
    ]:
        if not any(e.kind == kind for e in found):
            path = _find_in_path(name)
            if path and path not in seen_paths:
                found.append(ChromeExecutable(path=path, kind=kind))
                seen_paths.add(path)

    return found


def _find_macos_chrome() -> List[ChromeExecutable]:
    """Find Chrome executables on macOS."""
    app_paths = [
        # Chrome
        ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "chrome"),
        (
            str(
                Path.home()
                / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            ),
            "chrome",
        ),
        # Chrome Canary
        (
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
            "chrome_canary",
        ),
        (
            str(
                Path.home()
                / "Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
            ),
            "chrome_canary",
        ),
        # Brave
        ("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", "brave"),
        (
            str(
                Path.home()
                / "Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
            ),
            "brave",
        ),
        # Edge
        ("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "edge"),
        (
            str(
                Path.home()
                / "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
            ),
            "edge",
        ),
        # Chromium
        ("/Applications/Chromium.app/Contents/MacOS/Chromium", "chromium"),
        (
            str(Path.home() / "Applications/Chromium.app/Contents/MacOS/Chromium"),
            "chromium",
        ),
    ]

    found = []
    seen_paths = set()

    for path, kind in app_paths:
        if path not in seen_paths and _exists(path):
            found.append(ChromeExecutable(path=path, kind=kind))
            seen_paths.add(path)

    return found


def _find_windows_chrome() -> List[ChromeExecutable]:
    """Find Chrome executables on Windows."""
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local_app_data = os.environ.get("LocalAppData", str(Path.home() / "AppData/Local"))

    candidates = [
        # Chrome
        (rf"{program_files}\Google\Chrome\Application\chrome.exe", "chrome"),
        (rf"{program_files_x86}\Google\Chrome\Application\chrome.exe", "chrome"),
        (rf"{local_app_data}\Google\Chrome\Application\chrome.exe", "chrome"),
        # Chrome Canary
        (
            rf"{local_app_data}\Google\Chrome SxS\Application\chrome.exe",
            "chrome_canary",
        ),
        # Edge
        (rf"{program_files}\Microsoft\Edge\Application\msedge.exe", "edge"),
        (rf"{program_files_x86}\Microsoft\Edge\Application\msedge.exe", "edge"),
        # Brave
        (
            rf"{program_files}\BraveSoftware\Brave-Browser\Application\brave.exe",
            "brave",
        ),
        (
            rf"{program_files_x86}\BraveSoftware\Brave-Browser\Application\brave.exe",
            "brave",
        ),
        (
            rf"{local_app_data}\BraveSoftware\Brave-Browser\Application\brave.exe",
            "brave",
        ),
    ]

    found = []
    seen_paths = set()

    for path, kind in candidates:
        # Normalize path separators
        path = os.path.normpath(path)
        if path not in seen_paths and os.path.isfile(path):
            found.append(ChromeExecutable(path=path, kind=kind))
            seen_paths.add(path)

    return found


def find_all_chrome_executables() -> List[ChromeExecutable]:
    """
    Find all Chrome/Chromium-based browser executables on the system.

    Returns:
        List of ChromeExecutable objects, ordered by preference
        (Chrome first, then Brave, Edge, Chromium, Canary).
    """
    system = platform.system()

    if system == "Linux":
        return _find_linux_chrome()
    elif system == "Darwin":
        return _find_macos_chrome()
    elif system == "Windows":
        return _find_windows_chrome()
    else:
        return []


def find_chrome_executable() -> Optional[ChromeExecutable]:
    """
    Find the best Chrome executable.

    Returns:
        ChromeExecutable or None if not found
    """
    all_execs = find_all_chrome_executables()

    if not all_execs:
        return None

    # Priority order: chrome > brave > edge > chromium > chrome_canary
    priority = {"chrome": 0, "brave": 1, "edge": 2, "chromium": 3, "chrome_canary": 4}

    return sorted(all_execs, key=lambda e: priority.get(e.kind, 99))[0]
