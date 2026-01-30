"""Linux window manager implementation."""

import logging
import subprocess
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)


class LinuxWindowManager(BaseWindowManager):
    """Linux-specific window management using xdotool."""
    
    def __init__(self):
        self._available = self._check_xdotool()
    
    def _check_xdotool(self) -> bool:
        """Check if xdotool is available."""
        try:
            subprocess.run(["xdotool", "--version"], capture_output=True, timeout=1, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("xdotool not available, window management disabled on Linux")
            return False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []
        
        windows = []
        try:
            result = subprocess.run(
                ["xdotool", "search", "--name", ".*"],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                window_ids = result.stdout.strip().split("\n")
                for wid in window_ids:
                    if wid:
                        try:
                            name_result = subprocess.run(
                                ["xdotool", "getwindowname", wid],
                                capture_output=True,
                                text=True,
                                timeout=1
                            )
                            if name_result.returncode == 0:
                                title = name_result.stdout.strip()
                                if title:
                                    windows.append({"title": title, "hwnd": wid})
                        except Exception:
                            continue
        except Exception as e:
            logger.error(f"Error getting windows: {e}", exc_info=True)
        
        return windows
    
    def get_active_window(self) -> Optional[dict]:
        """Get active window."""
        if not self._available:
            return None
        
        try:
            result = subprocess.run(
                ["xdotool", "getactivewindow", "getwindowname"],
                capture_output=True,
                text=True,
                timeout=1
            )
            if result.returncode == 0:
                title = result.stdout.strip()
                if title:
                    return {"title": title, "hwnd": None}
        except Exception as e:
            logger.error(f"Error getting active window: {e}", exc_info=True)
        
        return None
    
    def switch_to_window(self, window_title: str) -> bool:
        """Switch to a window by title."""
        if not self._available:
            return False
        
        try:
            # Search for window by name
            result = subprocess.run(
                ["xdotool", "search", "--name", window_title],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                window_ids = result.stdout.strip().split("\n")
                for wid in window_ids:
                    if wid:
                        # Activate the window
                        subprocess.run(
                            ["xdotool", "windowactivate", wid],
                            capture_output=True,
                            timeout=1
                        )
                        return True
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)
        
        return False
