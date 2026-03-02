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

from core.executors import get_interactive_executor
from core.system_metrics import collect_system_stats

logger = logging.getLogger(__name__)

# Platform detection
IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"


async def get_system_state(
    fields: Optional[list] = None
) -> Dict[str, Any]:
    """
    Get system state with optional field selection.
    
    Args:
        fields: Optional list of field names to retrieve. If None, retrieves all fields.
                Valid fields: 'active_window', 'mouse_position', 'clipboard', 
                'screen_resolution', 'windows', 'stats', 'time'
    
    Returns:
        Dictionary with requested system state information.
    """
    # If no fields specified, retrieve all fields (backward compatibility)
    if fields is None:
        fields = ['active_window', 'mouse_position', 'clipboard', 'screen_resolution', 'windows', 'stats', 'time']
    
    try:
        # Build list of coroutines to execute based on requested fields
        coroutines = []
        field_map = {}
        
        if 'active_window' in fields:
            coroutines.append(_get_active_window())
            field_map['active_window'] = len(coroutines) - 1
        
        if 'mouse_position' in fields:
            coroutines.append(_get_mouse_position())
            field_map['mouse_position'] = len(coroutines) - 1
        
        if 'clipboard' in fields:
            coroutines.append(_get_clipboard_preview())
            field_map['clipboard'] = len(coroutines) - 1
        
        if 'screen_resolution' in fields:
            coroutines.append(get_screen_resolution())
            field_map['screen_resolution'] = len(coroutines) - 1
        
        if 'windows' in fields:
            coroutines.append(_get_all_open_windows())
            field_map['windows'] = len(coroutines) - 1
        
        if 'stats' in fields:
            coroutines.append(_get_system_stats())
            field_map['stats'] = len(coroutines) - 1
        
        # Run requested operations in parallel
        if coroutines:
            results = await asyncio.gather(*coroutines, return_exceptions=True)
        else:
            results = []
        
        # Build result dictionary with only requested fields
        result = {}
        
        if 'active_window' in fields:
            idx = field_map.get('active_window')
            if idx is not None:
                active_window = results[idx] if not isinstance(results[idx], Exception) else None
                if isinstance(active_window, Exception):
                    logger.warning(f"Failed to get active window: {active_window}")
                    active_window = None
                result["active_window"] = active_window or "Unknown"
        
        if 'mouse_position' in fields:
            idx = field_map.get('mouse_position')
            if idx is not None:
                mouse_pos = results[idx] if not isinstance(results[idx], Exception) else None
                if isinstance(mouse_pos, Exception):
                    logger.warning(f"Failed to get mouse position: {mouse_pos}")
                    mouse_pos = None
                result["mouse_position"] = mouse_pos or "Unknown"
        
        if 'clipboard' in fields:
            idx = field_map.get('clipboard')
            if idx is not None:
                clipboard = results[idx] if not isinstance(results[idx], Exception) else '<error>'
                if isinstance(clipboard, Exception):
                    logger.warning(f"Failed to get clipboard: {clipboard}")
                    clipboard = '<error>'
                result["clipboard"] = clipboard or "<empty>"
        
        if 'screen_resolution' in fields:
            idx = field_map.get('screen_resolution')
            if idx is not None:
                screen_res = results[idx] if not isinstance(results[idx], Exception) else None
                if isinstance(screen_res, Exception):
                    logger.warning(f"Failed to get screen resolution: {screen_res}")
                    screen_res = None
                result["screen_resolution"] = screen_res or "Unknown"
        
        if 'windows' in fields:
            idx = field_map.get('windows')
            if idx is not None:
                windows = results[idx] if not isinstance(results[idx], Exception) else []
                if isinstance(windows, Exception):
                    logger.warning(f"Failed to get open windows: {windows}")
                    windows = []
                result["windows"] = windows if isinstance(windows, list) else []
        
        if 'stats' in fields:
            idx = field_map.get('stats')
            if idx is not None:
                stats = results[idx] if not isinstance(results[idx], Exception) else {}
                if isinstance(stats, Exception):
                    logger.warning(f"Failed to get system stats: {stats}")
                    stats = {}
                result["stats"] = stats if isinstance(stats, dict) else {}
        
        if 'time' in fields:
            result["time"] = datetime.now().isoformat()
        
        return result
    except Exception as e:
        logger.error(f"Error getting system state: {e}", exc_info=True)
        # Return minimal fallback with only requested fields
        fallback = {}
        if 'active_window' in fields:
            fallback["active_window"] = "Unknown"
        if 'mouse_position' in fields:
            fallback["mouse_position"] = "Unknown"
        if 'clipboard' in fields:
            fallback["clipboard"] = "<error>"
        if 'screen_resolution' in fields:
            fallback["screen_resolution"] = "Unknown"
        if 'windows' in fields:
            fallback["windows"] = []
        if 'stats' in fields:
            fallback["stats"] = {}
        if 'time' in fields:
            fallback["time"] = datetime.now().isoformat()
        return fallback


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
        title = await loop.run_in_executor(get_interactive_executor(), _get_window_title)
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
        title = await loop.run_in_executor(get_interactive_executor(), _get_window_title)
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
        title = await loop.run_in_executor(get_interactive_executor(), _get_window_title_xdotool)
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
        pos = await loop.run_in_executor(get_interactive_executor(), _get_position)
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
        content = await loop.run_in_executor(get_interactive_executor(), _read_clipboard)
        
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
        size = await loop.run_in_executor(get_interactive_executor(), _get_size)
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
        windows = await loop.run_in_executor(get_interactive_executor(), _get_windows)
        return windows
    except Exception as e:
        logger.error(f"Failed to get open windows: {e}", exc_info=True)
        return []


async def _get_system_stats() -> Dict[str, Any]:
    """Get system statistics."""
    try:
        return await collect_system_stats()
    except ImportError:
        logger.warning("psutil not available, cannot get system stats")
        return {}
    except Exception as e:
        logger.error(f"Failed to get system stats: {e}", exc_info=True)
        return {}
