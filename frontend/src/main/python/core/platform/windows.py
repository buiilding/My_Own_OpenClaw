"""Windows window manager implementation."""

import ctypes
import logging
import time
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)


class WindowsWindowManager(BaseWindowManager):
    """Windows-specific window management using win32gui."""
    
    def __init__(self):
        try:
            self.user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            self.kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
            self.SW_RESTORE = 9
            self.SW_SHOW = 5
            self._available = True
        except Exception:
            logger.warning("Win32 user32 APIs unavailable, window management disabled on Windows")
            self._available = False

    def _get_window_title(self, hwnd) -> str:
        length = self.user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return ""
        buffer = ctypes.create_unicode_buffer(length + 1)
        copied = self.user32.GetWindowTextW(hwnd, buffer, length + 1)
        if copied <= 0:
            return ""
        return buffer.value

    def _wait_for_foreground_window(
        self,
        hwnd: int,
        target_title: str,
        timeout_seconds: float = 1.0,
        poll_seconds: float = 0.05,
    ) -> bool:
        deadline = time.monotonic() + max(0.0, timeout_seconds)
        normalized_target = target_title.strip().lower()

        while time.monotonic() <= deadline:
            foreground_hwnd = self.user32.GetForegroundWindow()
            if foreground_hwnd and int(foreground_hwnd) == int(hwnd):
                return True

            foreground_title = self._get_window_title(foreground_hwnd) if foreground_hwnd else ""
            if foreground_title and normalized_target in foreground_title.lower():
                return True

            time.sleep(max(0.0, poll_seconds))

        return False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []
        
        windows = []

        enum_windows_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

        def enum_windows_callback(hwnd, _):
            if self.user32.IsWindowVisible(hwnd):
                title = self._get_window_title(hwnd)
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
                title = self._get_window_title(hwnd)
                if title:
                    return {"title": title, "hwnd": int(hwnd)}
        except Exception as e:
            logger.error(f"Error getting active window: {e}", exc_info=True)
        
        return None
    
    def switch_to_window(self, window_target: str | dict) -> bool:
        """Switch to a window by title or resolved window record."""
        if not self._available:
            return False
        
        windows = self.get_windows()
        target = None

        if isinstance(window_target, dict):
            requested_hwnd = window_target.get("hwnd")
            if requested_hwnd is not None:
                for window in windows:
                    if int(window["hwnd"]) == int(requested_hwnd):
                        target = window
                        break
            if target is None:
                requested_title = str(window_target.get("title") or "").strip()
                for window in windows:
                    if requested_title and requested_title.lower() in window["title"].lower():
                        target = window
                        break
        else:
            requested_title = str(window_target or "").strip()
            for window in windows:
                if requested_title.lower() in window["title"].lower():
                    target = window
                    break
        
        if not target:
            return False
        
        try:
            hwnd = target["hwnd"]
            current_thread_id = self.kernel32.GetCurrentThreadId()
            foreground_hwnd = self.user32.GetForegroundWindow()
            foreground_thread_id = (
                self.user32.GetWindowThreadProcessId(foreground_hwnd, None)
                if foreground_hwnd
                else 0
            )
            target_thread_id = self.user32.GetWindowThreadProcessId(hwnd, None)
            attached_pairs: list[tuple[int, int]] = []

            def _attach_threads(source_thread_id: int, destination_thread_id: int) -> None:
                if (
                    not source_thread_id
                    or not destination_thread_id
                    or source_thread_id == destination_thread_id
                ):
                    return
                if self.user32.AttachThreadInput(source_thread_id, destination_thread_id, True):
                    attached_pairs.append((source_thread_id, destination_thread_id))

            # Restore if minimized
            if self.user32.IsIconic(hwnd):
                self.user32.ShowWindow(hwnd, self.SW_RESTORE)
            else:
                self.user32.ShowWindow(hwnd, self.SW_SHOW)

            try:
                _attach_threads(foreground_thread_id, current_thread_id)
                _attach_threads(target_thread_id, current_thread_id)
                _attach_threads(target_thread_id, foreground_thread_id)

                self.user32.BringWindowToTop(hwnd)
                self.user32.SetActiveWindow(hwnd)
                self.user32.SetFocus(hwnd)
                set_foreground_result = self.user32.SetForegroundWindow(hwnd)
            finally:
                for source_thread_id, destination_thread_id in reversed(attached_pairs):
                    self.user32.AttachThreadInput(
                        source_thread_id,
                        destination_thread_id,
                        False,
                    )

            if not set_foreground_result:
                logger.info("SetForegroundWindow returned 0 for '%s'", target["title"])

            return self._wait_for_foreground_window(hwnd, target["title"])
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)
            return False
