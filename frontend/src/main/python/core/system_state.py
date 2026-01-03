"""
System state capture for frontend tool results.
"""

import datetime
import logging
import platform
import subprocess
import socket
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

async def get_system_state_xml() -> str:
    """
    Capture the current system state and format it as XML.
    Includes active window, mouse position, and current time.
    """
    state = await capture_system_state()
    
    xml = " <os_state>\n"
    if state.get("active_window"):
        xml += f"    <active_window>{state['active_window']}</active_window>\n"
    if state.get("mouse_position"):
        xml += f"    <mouse_position>{state['mouse_position']}</mouse_position>\n"
    if state.get("screen_resolution"):
        xml += f"    <screen_resolution>{state['screen_resolution']}</screen_resolution>\n"
    
    # Add resource stats if available
    if "stats" in state:
        stats = state["stats"]
        xml += "    <system_stats>\n"
        xml += f"        <cpu_percent>{stats.get('cpu_percent', 0):.1f}%</cpu_percent>\n"
        xml += f"        <memory_percent>{stats.get('memory_percent', 0):.1f}%</memory_percent>\n"
        xml += f"        <battery_percent>{stats.get('battery_percent', 'N/A')}</battery_percent>\n"
        xml += f"        <battery_charging>{stats.get('battery_charging', 'N/A')}</battery_charging>\n"
        xml += "    </system_stats>\n"

    if state.get("internet"):
        xml += f"    <internet_status>{state['internet']}</internet_status>\n"
        
    xml += f"    <time>{state['time']}</time>\n"
    xml += "</os_state>"
    
    return xml

async def get_initial_state_xml() -> str:
    """
    Generate comprehensive XML block for initial user message with all windows and system stats.
    Matches the structure expected by the backend.
    """
    state = await capture_system_state(include_windows=True)
    stats = state.get("stats", {})
    windows = state.get("windows", [])

    # Format all windows as XML
    windows_xml = "\n".join(f"        <window>{w}</window>" for w in windows)
    
    return f"""<system_context>
    <os_state>
        <active_window>{state.get('active_window', 'Unknown')}</active_window>
        <mouse_position>{state.get('mouse_position', 'Unknown')}</mouse_position>
        <clipboard_preview>{state.get('clipboard', '<empty>')}</clipboard_preview>
        <screen_resolution>{state.get('screen_resolution', 'Unknown')}</screen_resolution>
        <time>{state.get('time')}</time>
        <internet_status>{state.get('internet', 'Unknown')}</internet_status>
        <all_open_windows>
{windows_xml}
        </all_open_windows>
        <system_stats>
            <cpu_percent>{stats.get('cpu_percent', 0):.1f}%</cpu_percent>
            <memory_percent>{stats.get('memory_percent', 0):.1f}%</memory_percent>
            <battery_percent>{stats.get('battery_percent', 'N/A')}</battery_percent>
            <battery_charging>{stats.get('battery_charging', 'N/A')}</battery_charging>
        </system_stats>
    </os_state>
</system_context>"""

async def get_full_state_xml() -> str:
    """
    Generate standard XML block for subsequent message injection.
    """
    state = await capture_system_state()
    
    return f"""<system_context>
    <os_state>
        <active_window>{state.get('active_window', 'Unknown')}</active_window>
        <mouse_position>{state.get('mouse_position', 'Unknown')}</mouse_position>
        <clipboard_preview>{state.get('clipboard', '<empty>')}</clipboard_preview>
        <screen_resolution>{state.get('screen_resolution', 'Unknown')}</screen_resolution>
        <time>{state.get('time')}</time>
        <internet_status>{state.get('internet', 'Unknown')}</internet_status>
    </os_state>
</system_context>"""

async def get_sequential_state_xml() -> str:
    """
    Generate minimal XML block for sequential messages.
    Used for messages after the initial one in a conversation.
    Includes only: active_window, mouse_position, time, and clipboard_preview.
    """
    state = await capture_system_state()
    
    return f"""<system_context>
    <os_state>
        <active_window>{state.get('active_window', 'Unknown')}</active_window>
        <mouse_position>{state.get('mouse_position', 'Unknown')}</mouse_position>
        <time>{state.get('time')}</time>
        <clipboard_preview>{state.get('clipboard', '<empty>')}</clipboard_preview>
    </os_state>
</system_context>"""

async def capture_system_state(include_windows: bool = False) -> Dict[str, Any]:
    """Capture raw system state data.
    
    Optimized to run independent operations in parallel for faster execution.
    """
    import asyncio
    from core.thread_pool import get_executor
    
    loop = asyncio.get_running_loop()
    executor = get_executor()
    # Run independent operations in parallel for better performance
    # Execute all independent operations concurrently
    tasks = {
        "active_window": loop.run_in_executor(executor, _get_active_window),
        "mouse_pos": loop.run_in_executor(executor, _get_mouse_position),
        "screen_res": loop.run_in_executor(executor, _get_screen_resolution),
        "clipboard": loop.run_in_executor(executor, _get_clipboard_preview),
        "internet": loop.run_in_executor(executor, _check_internet),
        "stats": loop.run_in_executor(executor, _get_resource_stats_sync)
    }
    
    if include_windows:
        system = platform.system()
        if system == "Linux":
            tasks["windows"] = loop.run_in_executor(executor, _get_open_windows_linux)
        elif system == "Windows":
            tasks["windows"] = loop.run_in_executor(executor, _get_open_windows_windows)
        elif system == "Darwin": # macOS
            tasks["windows"] = loop.run_in_executor(executor, _get_open_windows_macos)
    
    # Wait for all tasks to complete
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    
    # Map results back to keys
    mapped_results = dict(zip(tasks.keys(), results))
    
    # Handle exceptions (return None/Unknown for failed operations)
    for key, value in mapped_results.items():
        if isinstance(value, Exception):
            if key == "screen_res":
                mapped_results[key] = "Unknown"
            elif key == "clipboard":
                mapped_results[key] = "<error>"
            elif key == "internet":
                mapped_results[key] = "Unknown"
            elif key == "stats":
                mapped_results[key] = {}
            elif key == "windows":
                mapped_results[key] = []
            else:
                mapped_results[key] = None
    
    return {
        "active_window": mapped_results.get("active_window"),
        "mouse_position": mapped_results.get("mouse_pos"),
        "screen_resolution": mapped_results.get("screen_res"),
        "clipboard": mapped_results.get("clipboard"),
        "internet": mapped_results.get("internet"),
        "stats": mapped_results.get("stats", {}),
        "windows": mapped_results.get("windows", []),
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

def _get_screen_resolution() -> str:
    """Get screen resolution."""
    try:
        import pyautogui
        width, height = pyautogui.size()
        return f"{width}x{height}"
    except:
        return "Unknown"

def _get_active_window() -> Optional[str]:
    """Platform-specific active window capture."""
    system = platform.system()
    try:
        if system == "Linux":
            # Try xdotool
            try:
                window_id = subprocess.check_output(["xdotool", "getactivewindow"], stderr=subprocess.DEVNULL).decode().strip()
                window_name = subprocess.check_output(["xdotool", "getwindowname", window_id], stderr=subprocess.DEVNULL).decode().strip()
                return window_name
            except:
                # Try wmctrl as fallback
                try:
                    output = subprocess.check_output(["wmctrl", "-a", ":ACTIVE:", "-l"], stderr=subprocess.DEVNULL).decode()
                    for line in output.splitlines():
                        if "*" in line: # Current active window
                            return line.split(None, 3)[-1]
                except:
                    pass
        elif system == "Windows":
            try:
                import win32gui
                window = win32gui.GetForegroundWindow()
                return win32gui.GetWindowText(window)
            except ImportError:
                pass
        elif system == "Darwin": # macOS
            try:
                script = 'tell application "System Events" to get name of first process whose frontmost is true'
                return subprocess.check_output(["osascript", "-e", script], stderr=subprocess.DEVNULL).decode().strip()
            except:
                pass
    except Exception as e:
        logger.debug(f"Failed to get active window: {e}")
        
    return None

def _get_mouse_position() -> Optional[str]:
    """Get current mouse position."""
    try:
        import pyautogui
        x, y = pyautogui.position()
        return f"({x}, {y})"
    except Exception as e:
        logger.debug(f"Failed to get mouse position: {e}")
    return None

def _get_clipboard_preview(max_length: int = 100) -> str:
    """Get truncated clipboard content."""
    try:
        import pyperclip
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

def _check_internet() -> str:
    """Quickly check internet connectivity."""
    try:
        # Connect to Google DNS
        socket.create_connection(("8.8.8.8", 53), timeout=0.5)
        return "Online"
    except OSError:
        return "Offline"

async def _get_all_open_windows() -> list[str]:
    """Get list of all open window titles."""
    import asyncio
    from core.thread_pool import get_executor
    
    loop = asyncio.get_running_loop()
    executor = get_executor()
    system = platform.system()
    if system == "Linux":
        return await loop.run_in_executor(executor, _get_open_windows_linux)
    elif system == "Windows":
        return await loop.run_in_executor(executor, _get_open_windows_windows)
    elif system == "Darwin": # macOS
        return await loop.run_in_executor(executor, _get_open_windows_macos)
    return []

def _get_open_windows_linux() -> list[str]:
    windows = []
    try:
        output = subprocess.check_output(["wmctrl", "-l"], stderr=subprocess.DEVNULL, timeout=2.0).decode("utf-8")
        for line in output.splitlines():
            parts = line.split(maxsplit=3)
            if len(parts) >= 4:
                windows.append(parts[3])
    except:
        pass
    return windows

def _get_open_windows_windows() -> list[str]:
    windows = []
    try:
        import win32gui
        def callback(hwnd, windows_list):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title:
                    windows_list.append(title)
            return True
        win32gui.EnumWindows(callback, windows)
    except:
        pass
    return windows

def _get_open_windows_macos() -> list[str]:
    windows = []
    try:
        script = 'tell application "System Events" to get name of every window of every process'
        output = subprocess.check_output(["osascript", "-e", script], stderr=subprocess.DEVNULL, timeout=2.0).decode("utf-8")
        windows = [w.strip() for w in output.split(",") if w.strip()]
    except:
        pass
    return windows

async def _get_resource_stats() -> Dict[str, Any]:
    """Get CPU, Memory, and Battery stats."""
    import asyncio
    from core.thread_pool import get_executor
    
    loop = asyncio.get_running_loop()
    executor = get_executor()
    return await loop.run_in_executor(executor, _get_resource_stats_sync)

def _get_resource_stats_sync() -> Dict[str, Any]:
    stats = {"cpu_percent": 0.0, "memory_percent": 0.0, "battery_percent": "N/A", "battery_charging": "N/A"}
    try:
        import psutil
        stats["cpu_percent"] = psutil.cpu_percent(interval=None)
        stats["memory_percent"] = psutil.virtual_memory().percent
        battery = psutil.sensors_battery()
        if battery:
            stats["battery_percent"] = f"{round(battery.percent, 1)}%"
            stats["battery_charging"] = str(battery.power_plugged)
    except:
        pass
    return stats
