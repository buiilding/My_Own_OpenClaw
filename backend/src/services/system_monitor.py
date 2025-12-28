import platform
import socket
import subprocess
import logging
from datetime import datetime
from typing import Dict, Optional, Tuple, List, Any

# Third-party imports
try:
    import psutil
    import pyperclip
    import pyautogui
    # Configure pyautogui to fail-safe and minimum interval
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.0
except ImportError:
    # Handle missing dependencies gracefully during dev/test
    psutil = None
    pyperclip = None
    pyautogui = None

logger = logging.getLogger(__name__)

class SystemMonitor:
    """
    Service for monitoring system state including windows, mouse, clipboard, and resources.
    """
    
    def __init__(self):
        self.os_type = platform.system()
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
            if self.os_type == "Linux":
                # Try xdotool first
                try:
                    result = subprocess.check_output(
                        ["xdotool", "getactivewindow", "getwindowname"],
                        stderr=subprocess.DEVNULL,
                        timeout=0.5
                    ).decode("utf-8").strip()
                    return result if result else "No Active Window"
                except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                    # Fallback to creating a generic response or checking other tools if needed
                    pass
            
            # TODO: Add Windows/MacOS implementations if needed
            
            return "Unknown Window"
        except Exception as e:
            logger.debug(f"Error getting active window: {e}")
            return "Unknown Window"

    def get_mouse_position(self) -> str:
        """Get current mouse coordinates."""
        if not pyautogui:
            return "(0, 0)"
        try:
            x, y = pyautogui.position()
            return f"({x}, {y})"
        except Exception:
            return "(0, 0)"

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

    def get_open_windows(self) -> List[str]:
        """Get list of all open window titles."""
        windows = []
        if self.os_type == "Linux":
            try:
                # Use wmctrl if available
                output = subprocess.check_output(
                    ["wmctrl", "-l"], 
                    stderr=subprocess.DEVNULL
                ).decode("utf-8")
                
                for line in output.splitlines():
                    parts = line.split(maxsplit=3)
                    if len(parts) >= 4:
                        # parts[3] is the hostname + title usually, depends on wmctrl output
                        # wmctrl output: <id> <desktop> <machine> <title>
                        title = parts[3]
                        windows.append(title)
            except (FileNotFoundError, subprocess.CalledProcessError):
                # Fallback to xdotool search
                pass
        return windows

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

    def get_full_state_xml(self) -> str:
        """
        Generate the XML block for message injection.
        """
        active_window = self.get_active_window()
        mouse_pos = self.get_mouse_position()
        clipboard = self.get_clipboard_preview()
        resolution = self.get_screen_resolution()
        time_str = self.get_system_time()
        internet = self.check_internet()

        return f"""<system_context>
    <os_state>
        <active_window>{active_window}</active_window>
        <mouse_position>{mouse_pos}</mouse_position>
        <clipboard_preview>{clipboard}</clipboard_preview>
        <screen_resolution>{resolution}</screen_resolution>
        <time>{time_str}</time>
        <internet_status>{internet}</internet_status>
    </os_state>
</system_context>"""

    def get_initial_state_xml(self) -> str:
        """
        Generate comprehensive XML block for initial user message with all windows and system stats.
        """
        active_window = self.get_active_window()
        mouse_pos = self.get_mouse_position()
        clipboard = self.get_clipboard_preview()
        resolution = self.get_screen_resolution()
        time_str = self.get_system_time()
        internet = self.check_internet()
        all_windows = self.get_open_windows()
        system_stats = self.get_system_stats()

        # Format all windows as XML
        windows_xml = "\n".join(f"        <window>{w}</window>" for w in all_windows)

        return f"""<system_context>
    <os_state>
        <active_window>{active_window}</active_window>
        <mouse_position>{mouse_pos}</mouse_position>
        <clipboard_preview>{clipboard}</clipboard_preview>
        <screen_resolution>{resolution}</screen_resolution>
        <time>{time_str}</time>
        <internet_status>{internet}</internet_status>
        <all_open_windows>
{windows_xml}
        </all_open_windows>
        <system_stats>
            <cpu_percent>{system_stats.get('cpu_percent', 0):.1f}%</cpu_percent>
            <memory_percent>{system_stats.get('memory_percent', 0):.1f}%</memory_percent>
            <battery_percent>{system_stats.get('battery_percent', 'N/A')}</battery_percent>
            <battery_charging>{system_stats.get('battery_charging', 'N/A')}</battery_charging>
        </system_stats>
    </os_state>
</system_context>"""

    def get_tool_feedback_xml(self) -> str:
        """
        Generate lighter XML block for tool output feedback.
        Returns just the <os_state> block without wrapper.
        """
        active_window = self.get_active_window()
        mouse_pos = self.get_mouse_position()
        time_str = self.get_system_time()
        
        return f""" <os_state>
    <active_window>{active_window}</active_window>
    <mouse_position>{mouse_pos}</mouse_position>
    <time>{time_str}</time>
</os_state>"""

# Global instance
system_monitor = SystemMonitor()

