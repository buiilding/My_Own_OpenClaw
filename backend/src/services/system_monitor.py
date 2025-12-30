import logging
from typing import Dict, Any

from backend.src.services.system import get_system_interface

logger = logging.getLogger(__name__)

class SystemMonitor:
    """
    Service for monitoring system state including windows, mouse, clipboard, and resources.
    
    Delegates all platform-specific operations to SystemInterface abstraction.
    """
    
    def __init__(self):
        """Initialize system monitor with platform-appropriate interface."""
        self._system = get_system_interface()

    def get_active_window(self) -> str:
        """Get the title of the currently focused window."""
        return self._system.get_active_window()

    def get_mouse_position(self) -> str:
        """Get current mouse coordinates."""
        x, y = self._system.get_mouse_position()
        return f"({x}, {y})"

    def get_clipboard_preview(self, max_length: int = 100) -> str:
        """Get truncated clipboard content."""
        return self._system.get_clipboard_preview(max_length)

    def check_internet(self) -> str:
        """Quickly check internet connectivity."""
        return self._system.check_internet()

    def get_screen_resolution(self) -> str:
        """Get current screen resolution."""
        return self._system.get_screen_resolution()

    def get_system_time(self) -> str:
        """Get current formatted system time."""
        return self._system.get_system_time()

    def get_open_windows(self) -> list[str]:
        """Get list of all open window titles."""
        return self._system.get_open_windows()

    def switch_to_window(self, window_title: str) -> bool:
        """Switch focus to a window with the given title."""
        return self._system.switch_to_window(window_title)

    def get_system_stats(self) -> Dict[str, Any]:
        """Get system resource usage."""
        return self._system.get_system_stats()

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

