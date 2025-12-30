"""
Windows System Interface Implementation.

Provides Windows-specific implementations of system operations.
"""
import logging
import platform
import socket
import subprocess
from datetime import datetime
from typing import Any, Dict, List, Tuple

try:
    import psutil
    import pyautogui
    import pyperclip
    try:
        import win32gui
        import win32con
    except ImportError:
        # win32gui/win32con are optional (pywin32 package)
        win32gui = None
        win32con = None
    # Configure pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.0
except ImportError:
    psutil = None
    pyautogui = None
    pyperclip = None
    win32gui = None
    win32con = None

from backend.src.services.system.interface import SystemInterface

logger = logging.getLogger(__name__)


class WindowsSystemInterface(SystemInterface):
    """Windows implementation of system operations."""
    
    def __init__(self):
        """Initialize Windows system interface."""
        self._screen_size = self._get_initial_screen_size()
    
    def _get_initial_screen_size(self) -> str:
        """Get screen size at startup."""
        if pyautogui:
            try:
                width, height = pyautogui.size()
                return f"{width}x{height}"
            except Exception:
                pass
        return "Unknown"
    
    def get_active_window(self) -> str:
        """Get the title of the currently focused window."""
        try:
            if win32gui:
                hwnd = win32gui.GetForegroundWindow()
                title = win32gui.GetWindowText(hwnd)
                return title if title else "No Active Window"
            return "Unknown Window"
        except Exception as e:
            logger.debug(f"Error getting active window: {e}")
            return "Unknown Window"
    
    def get_open_windows(self) -> List[str]:
        """Get list of all open window titles."""
        windows = []
        try:
            if win32gui:
                def enum_windows_callback(hwnd, windows_list):
                    if win32gui.IsWindowVisible(hwnd):
                        title = win32gui.GetWindowText(hwnd)
                        if title:
                            windows_list.append(title)
                    return True
                
                win32gui.EnumWindows(enum_windows_callback, windows)
        except Exception as e:
            logger.debug(f"Error getting open windows: {e}")
        return windows
    
    def switch_to_window(self, window_title: str) -> bool:
        """
        Switch focus to a window with the given title.

        Args:
            window_title: Exact or partial window title to switch to

        Returns:
            True if window was found and activated, False otherwise
        """
        try:
            if win32gui:
                def find_and_activate_window(hwnd, target_title):
                    if win32gui.IsWindowVisible(hwnd):
                        title = win32gui.GetWindowText(hwnd)
                        if title and target_title.lower() in title.lower():
                            try:
                                # Bring window to front and activate it
                                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                                win32gui.SetForegroundWindow(hwnd)
                                return True
                            except Exception as e:
                                logger.debug(f"Error activating window: {e}")
                    return False

                # Enumerate windows to find and activate the target
                result = win32gui.EnumWindows(find_and_activate_window, window_title)
                return result if result is True else False
            else:
                logger.debug("win32gui not available for window switching")
                return False

        except Exception as e:
            logger.debug(f"Error switching window: {e}")
            return False

    def get_mouse_position(self) -> Tuple[int, int]:
        """Get current mouse coordinates."""
        if not pyautogui:
            return (0, 0)
        try:
            return pyautogui.position()
        except Exception:
            return (0, 0)
    
    def get_clipboard_preview(self, max_length: int = 100) -> str:
        """Get truncated clipboard content."""
        if not pyperclip:
            return ""
        try:
            content = pyperclip.paste()
            if not content:
                return "<empty>"
            # Replace newlines to keep it one line in the XML
            content = content.replace("\n", "\\n").replace("\r", "")
            if len(content) > max_length:
                return f"{content[:max_length]}..."
            return content
        except Exception as e:
            logger.debug(f"Error reading clipboard: {e}")
            return "<error>"
    
    def check_internet(self) -> str:
        """Quickly check internet connectivity."""
        try:
            # Connect to Google DNS
            socket.create_connection(("8.8.8.8", 53), timeout=0.5)
            return "Online"
        except OSError:
            return "Offline"
    
    def get_screen_resolution(self) -> str:
        """Get current screen resolution."""
        if pyautogui:
            try:
                width, height = pyautogui.size()
                return f"{width}x{height}"
            except Exception:
                pass
        return self._screen_size
    
    def get_system_time(self) -> str:
        """Get current formatted system time."""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    def get_system_stats(self) -> Dict[str, Any]:
        """Get system resource usage."""
        stats = {
            "cpu_percent": 0.0,
            "memory_percent": 0.0,
            "battery_percent": None,
            "battery_charging": None
        }
        
        if psutil:
            try:
                stats["cpu_percent"] = psutil.cpu_percent(interval=None)
                stats["memory_percent"] = psutil.virtual_memory().percent
                
                battery = psutil.sensors_battery()
                if battery:
                    stats["battery_percent"] = round(battery.percent, 1)
                    stats["battery_charging"] = battery.power_plugged
            except Exception as e:
                logger.error(f"Error reading system stats: {e}")
                
        return stats

