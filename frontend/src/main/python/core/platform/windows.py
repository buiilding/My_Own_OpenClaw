"""Windows window manager implementation."""

import logging
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)


class WindowsWindowManager(BaseWindowManager):
    """Windows-specific window management using win32gui."""
    
    def __init__(self):
        try:
            import win32gui
            import win32con
            self.win32gui = win32gui
            self.win32con = win32con
            self._available = True
        except ImportError:
            logger.warning("win32gui not available, window management disabled on Windows")
            self._available = False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []
        
        windows = []
        
        def enum_windows_callback(hwnd, _):
            if self.win32gui.IsWindowVisible(hwnd):
                title = self.win32gui.GetWindowText(hwnd)
                if title:
                    windows.append({"title": title, "hwnd": hwnd})
            return True
        
        try:
            self.win32gui.EnumWindows(enum_windows_callback, None)
        except Exception as e:
            logger.error(f"Error enumerating windows: {e}", exc_info=True)
        
        return windows
    
    def get_active_window(self) -> Optional[dict]:
        """Get active window."""
        if not self._available:
            return None
        
        try:
            hwnd = self.win32gui.GetForegroundWindow()
            if hwnd:
                title = self.win32gui.GetWindowText(hwnd)
                return {"title": title, "hwnd": hwnd}
        except Exception as e:
            logger.error(f"Error getting active window: {e}", exc_info=True)
        
        return None
    
    def switch_to_window(self, window_title: str) -> bool:
        """Switch to a window by title."""
        if not self._available:
            return False
        
        windows = self.get_windows()
        target = None
        
        for window in windows:
            if window_title.lower() in window["title"].lower():
                target = window
                break
        
        if not target:
            return False
        
        try:
            hwnd = target["hwnd"]
            # Restore if minimized
            if self.win32gui.IsIconic(hwnd):
                self.win32gui.ShowWindow(hwnd, self.win32con.SW_RESTORE)
            # Bring to front
            self.win32gui.SetForegroundWindow(hwnd)
            return True
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)
            return False
