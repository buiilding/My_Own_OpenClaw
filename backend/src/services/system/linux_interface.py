"""
Linux System Interface Implementation.

Provides Linux-specific implementations of system operations.
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
    # Configure pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.0
except ImportError:
    psutil = None
    pyautogui = None
    pyperclip = None

from backend.src.services.system.interface import SystemInterface

logger = logging.getLogger(__name__)


class LinuxSystemInterface(SystemInterface):
    """Linux implementation of system operations."""
    
    def __init__(self):
        """Initialize Linux system interface."""
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
            # Try xdotool first
            try:
                result = subprocess.check_output(
                    ["xdotool", "getactivewindow", "getwindowname"],
                    stderr=subprocess.DEVNULL,
                    timeout=0.5
                ).decode("utf-8").strip()
                return result if result else "No Active Window"
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                pass
            
            return "Unknown Window"
        except Exception as e:
            logger.debug(f"Error getting active window: {e}")
            return "Unknown Window"
    
    def get_open_windows(self) -> List[str]:
        """Get list of all open window titles."""
        windows = []
        try:
            # Use wmctrl if available
            output = subprocess.check_output(
                ["wmctrl", "-l"], 
                stderr=subprocess.DEVNULL
            ).decode("utf-8")
            
            for line in output.splitlines():
                parts = line.split(maxsplit=3)
                if len(parts) >= 4:
                    title = parts[3]
                    windows.append(title)
        except (FileNotFoundError, subprocess.CalledProcessError):
            # Fallback to xdotool search
            pass
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
            # Use wmctrl to find and activate window
            # First find the window ID
            result = subprocess.run(
                ["wmctrl", "-l"],
                capture_output=True,
                text=True,
                timeout=2.0
            )

            if result.returncode != 0:
                logger.debug("wmctrl not available for window switching")
                return False

            target_window_id = None
            for line in result.stdout.splitlines():
                parts = line.split(maxsplit=3)
                if len(parts) >= 4:
                    window_id = parts[0]
                    title = parts[3]
                    # Case-insensitive partial match
                    if window_title.lower() in title.lower():
                        target_window_id = window_id
                        break

            if target_window_id:
                # Activate the window
                subprocess.run(
                    ["wmctrl", "-i", "-a", target_window_id],
                    capture_output=True,
                    timeout=2.0
                )
                return True
            else:
                logger.debug(f"Window with title containing '{window_title}' not found")
                return False

        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError) as e:
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

