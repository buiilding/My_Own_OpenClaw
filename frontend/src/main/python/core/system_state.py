"""
System State Collection for Local Backend.

Collects system state including active window, mouse position,
clipboard, screen resolution, and system stats.
Cross-platform support for Windows, macOS, and Linux.
"""

import asyncio
import logging
import platform
from datetime import datetime
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

# Platform detection
IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"


async def get_system_state() -> Dict[str, Any]:
    """
    Get complete system state.
    
    Returns:
        Dictionary with system state information including:
        - active_window: Currently focused window title
        - mouse_position: Current mouse coordinates
        - clipboard: Clipboard content preview
        - screen_resolution: Display resolution
        - windows: List of all open window titles
        - stats: System statistics (CPU, memory, battery)
        - time: Timestamp
    """
    try:
        # Run independent operations in parallel for efficiency
        results = await asyncio.gather(
            _get_active_window(),
            _get_mouse_position(),
            _get_clipboard_preview(),
            get_screen_resolution(),
            _get_all_open_windows(),
            _get_system_stats(),
            return_exceptions=True
        )
        
        active_window, mouse_pos, clipboard, screen_res, windows, stats = results
        
        # Handle exceptions
        if isinstance(active_window, Exception):
            logger.warning(f"Failed to get active window: {active_window}")
            active_window = None
        if isinstance(mouse_pos, Exception):
            logger.warning(f"Failed to get mouse position: {mouse_pos}")
            mouse_pos = None
        if isinstance(clipboard, Exception):
            logger.warning(f"Failed to get clipboard: {clipboard}")
            clipboard = '<error>'
        if isinstance(screen_res, Exception):
            logger.warning(f"Failed to get screen resolution: {screen_res}")
            screen_res = None
        if isinstance(windows, Exception):
            logger.warning(f"Failed to get open windows: {windows}")
            windows = []
        if isinstance(stats, Exception):
            logger.warning(f"Failed to get system stats: {stats}")
            stats = {}
        
        return {
            "active_window": active_window or "Unknown",
            "mouse_position": mouse_pos or "Unknown",
            "clipboard": clipboard or "<empty>",
            "screen_resolution": screen_res or "Unknown",
            "windows": windows if isinstance(windows, list) else [],
            "stats": stats if isinstance(stats, dict) else {},
            "time": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error getting system state: {e}", exc_info=True)
        return {
            "active_window": "Unknown",
            "mouse_position": "Unknown",
            "clipboard": "<error>",
            "screen_resolution": "Unknown",
            "windows": [],
            "stats": {},
            "time": datetime.now().isoformat(),
        }


async def _get_active_window() -> Optional[str]:
    """Get active window title."""
    try:
        if IS_WINDOWS:
            return await _get_active_window_windows()
        elif IS_MACOS:
            return await _get_active_window_macos()
        elif IS_LINUX:
            return await _get_active_window_linux()
        else:
            logger.warning(f"Unsupported platform: {platform.system()}")
            return None
    except Exception as e:
        logger.error(f"Failed to get active window: {e}", exc_info=True)
        return None


async def _get_active_window_windows() -> Optional[str]:
    """Get active window on Windows."""
    try:
        import win32gui
        
        def _get_window_title():
            hwnd = win32gui.GetForegroundWindow()
            return win32gui.GetWindowText(hwnd)
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        title = await loop.run_in_executor(None, _get_window_title)
        return title if title else None
    except ImportError:
        logger.warning("win32gui not available, cannot get active window on Windows")
        return None
    except Exception as e:
        logger.error(f"Windows window detection failed: {e}", exc_info=True)
        return None


async def _get_active_window_macos() -> Optional[str]:
    """Get active window on macOS."""
    try:
        from AppKit import NSWorkspace
        
        def _get_window_title():
            workspace = NSWorkspace.sharedWorkspace()
            app = workspace.activeApplication()
            return app.get("NSApplicationName", None)
        
        # Run in thread pool
        loop = asyncio.get_event_loop()
        title = await loop.run_in_executor(None, _get_window_title)
        return title if title else None
    except ImportError:
        logger.warning("AppKit not available, cannot get active window on macOS")
        return None
    except Exception as e:
        logger.error(f"macOS window detection failed: {e}", exc_info=True)
        return None


async def _get_active_window_linux() -> Optional[str]:
    """Get active window on Linux."""
    try:
        # Try xdotool first
        def _get_window_title_xdotool():
            import subprocess
            result = subprocess.run(
                ["xdotool", "getactivewindow", "getwindowname"],
                capture_output=True,
                text=True,
                timeout=1
            )
            if result.returncode == 0:
                return result.stdout.strip()
            return None
        
        loop = asyncio.get_event_loop()
        title = await loop.run_in_executor(None, _get_window_title_xdotool)
        if title:
            return title
        
        # Fallback: try wmctrl (not implemented - xdotool is primary method)
        return None
    except Exception as e:
        logger.error(f"Linux window detection failed: {e}", exc_info=True)
        return None


async def _get_mouse_position() -> Optional[str]:
    """Get mouse position as string."""
    try:
        import pyautogui
        
        def _get_position():
            return pyautogui.position()
        
        loop = asyncio.get_event_loop()
        pos = await loop.run_in_executor(None, _get_position)
        return f"({pos.x}, {pos.y})"
    except ImportError:
        logger.warning("pyautogui not available, cannot get mouse position")
        return None
    except Exception as e:
        logger.error(f"Failed to get mouse position: {e}", exc_info=True)
        return None


async def _get_clipboard_preview(max_length: int = 100) -> str:
    """Get clipboard preview (truncated)."""
    try:
        import pyperclip
        
        def _read_clipboard():
            return pyperclip.paste()
        
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(None, _read_clipboard)
        
        if not content:
            return "<empty>"
        
        # Replace newlines to keep it one line
        single_line = content.replace("\n", "\\n").replace("\r", "")
        if len(single_line) > max_length:
            return f"{single_line[:max_length]}..."
        return single_line
    except ImportError:
        logger.warning("pyperclip not available, cannot get clipboard")
        return "<error>"
    except Exception as e:
        logger.error(f"Failed to get clipboard: {e}", exc_info=True)
        return "<error>"


async def get_screen_resolution() -> Optional[str]:
    """Get screen resolution."""
    try:
        import pyautogui
        
        def _get_size():
            return pyautogui.size()
        
        loop = asyncio.get_event_loop()
        size = await loop.run_in_executor(None, _get_size)
        return f"{size.width}x{size.height}"
    except ImportError:
        logger.warning("pyautogui not available, cannot get screen resolution")
        return None
    except Exception as e:
        logger.error(f"Failed to get screen resolution: {e}", exc_info=True)
        return None


async def _get_all_open_windows() -> list:
    """Get list of all open window titles."""
    try:
        from core.platform import WindowManager
        
        def _get_windows():
            manager = WindowManager()
            windows = manager.get_windows()
            # Extract just the titles
            window_titles = [w["title"] for w in windows if w.get("title") and w["title"].strip()]
            return window_titles
        
        loop = asyncio.get_event_loop()
        windows = await loop.run_in_executor(None, _get_windows)
        return windows
    except Exception as e:
        logger.error(f"Failed to get open windows: {e}", exc_info=True)
        return []


async def _get_system_stats() -> Dict[str, Any]:
    """Get system statistics."""
    try:
        import psutil
        
        def _get_stats():
            cpu_percent = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            try:
                battery = psutil.sensors_battery()
                battery_percent = battery.percent if battery else None
                battery_charging = battery.power_plugged if battery else None
            except (AttributeError, NotImplementedError):
                # Battery info not available on all systems
                battery_percent = None
                battery_charging = None
            
            return {
                "cpu_percent": cpu_percent,
                "memory_percent": mem.percent,
                "battery_percent": battery_percent,
                "battery_charging": battery_charging,
            }
        
        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(None, _get_stats)
        return stats
    except ImportError:
        logger.warning("psutil not available, cannot get system stats")
        return {}
    except Exception as e:
        logger.error(f"Failed to get system stats: {e}", exc_info=True)
        return {}
