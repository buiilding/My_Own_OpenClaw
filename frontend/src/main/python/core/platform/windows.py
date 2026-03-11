"""Windows window manager implementation."""

import ctypes
import logging
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)


class WindowsWindowManager(BaseWindowManager):
    """Windows-specific window management using win32gui."""
    
    def __init__(self):
        try:
            self.user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            self.SW_RESTORE = 9
            self._available = True
        except Exception:
            logger.warning("Win32 user32 APIs unavailable, window management disabled on Windows")
            self._available = False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []
        
        windows = []

        enum_windows_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

        def _get_window_title(hwnd) -> str:
            length = self.user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return ""
            buffer = ctypes.create_unicode_buffer(length + 1)
            copied = self.user32.GetWindowTextW(hwnd, buffer, length + 1)
            if copied <= 0:
                return ""
            return buffer.value

        def enum_windows_callback(hwnd, _):
            if self.user32.IsWindowVisible(hwnd):
                title = _get_window_title(hwnd)
                if title:
                    windows.append({"title": title, "hwnd": int(hwnd)})
            return True
        
        try:
            self.user32.EnumWindows(enum_windows_proc(enum_windows_callback), None)
        except Exception as e:
            logger.error(f"Error enumerating windows: {e}", exc_info=True)
        
        return windows
    
    def get_active_window(self) -> Optional[dict]:
        """Get active window."""
        if not self._available:
            return None
        
        try:
            hwnd = self.user32.GetForegroundWindow()
            if hwnd:
                length = self.user32.GetWindowTextLengthW(hwnd)
                if length <= 0:
                    return None
                buffer = ctypes.create_unicode_buffer(length + 1)
                copied = self.user32.GetWindowTextW(hwnd, buffer, length + 1)
                if copied <= 0:
                    return None
                return {"title": buffer.value, "hwnd": int(hwnd)}
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
            if self.user32.IsIconic(hwnd):
                self.user32.ShowWindow(hwnd, self.SW_RESTORE)
            if hasattr(self.user32, "BringWindowToTop"):
                self.user32.BringWindowToTop(hwnd)
            # Bring to front
            foreground_result = self.user32.SetForegroundWindow(hwnd)
            return bool(foreground_result)
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)
            return False
