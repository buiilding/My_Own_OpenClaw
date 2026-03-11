"""
System State Collection for Local Backend.

Collects system state including active window, mouse position,
clipboard, screen resolution, and system stats.
Cross-platform support for Windows, macOS, and Linux.
"""

import asyncio
import ctypes
import logging
import os
import platform
from datetime import datetime
from typing import Dict, Optional, Any

from core.executors import get_interactive_executor
from core.system_metrics import collect_system_stats
from core.unicode_sanitizer import repair_common_mojibake, sanitize_surrogates_in_text

logger = logging.getLogger(__name__)

# Platform detection
IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"


def _normalize_runtime_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    repaired = repair_common_mojibake(value)
    sanitized = sanitize_surrogates_in_text(repaired)
    return sanitized


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
        def _get_window_title():
            user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            hwnd = user32.GetForegroundWindow()
            if not hwnd:
                return None

            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return None

            buffer = ctypes.create_unicode_buffer(length + 1)
            copied = user32.GetWindowTextW(hwnd, buffer, length + 1)
            if copied <= 0:
                return None
            return buffer.value
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        title = await loop.run_in_executor(get_interactive_executor(), _get_window_title)
        normalized = _normalize_runtime_text(title)
        return normalized if normalized else None
    except Exception as e:
        logger.error(f"Windows window detection failed: {e}", exc_info=True)
        return None


async def _get_active_window_macos() -> Optional[str]:
    """Get active window on macOS."""
    try:
        def _get_window_title():
            from core.platform import WindowManager

            manager = WindowManager()
            active_window = manager.get_active_window()
            if not active_window:
                return None
            return active_window.get("title")
        
        # Run in thread pool
        loop = asyncio.get_event_loop()
        title = await loop.run_in_executor(get_interactive_executor(), _get_window_title)
        normalized = _normalize_runtime_text(title)
        return normalized if normalized else None
    except ImportError:
        logger.warning("macOS window manager dependencies not available, cannot get active window")
        return None
    except Exception as e:
        logger.error(f"macOS window detection failed: {e}", exc_info=True)
        return None


async def _get_active_window_linux() -> Optional[str]:
    """Get active window on Linux."""
    try:
        loop = asyncio.get_running_loop()
        title = await loop.run_in_executor(get_interactive_executor(), _get_active_window_linux_xdotool)
        if title:
            return title

        # Fallback for environments where xdotool is missing/unavailable.
        return await loop.run_in_executor(get_interactive_executor(), _get_active_window_linux_xlib)
    except Exception as e:
        logger.error(f"Linux window detection failed: {e}", exc_info=True)
        return None


async def _get_mouse_position() -> Optional[str]:
    """Get mouse position as string."""
    loop = asyncio.get_running_loop()
    try:
        pos = await loop.run_in_executor(get_interactive_executor(), _get_mouse_position_pyautogui)
        return f"({pos.x}, {pos.y})"
    except Exception as e:
        logger.warning("PyAutoGUI mouse probe failed, trying Xlib fallback: %s", e)
        try:
            pos = await loop.run_in_executor(get_interactive_executor(), _get_mouse_position_linux_xlib)
            if not pos:
                return None
            return f"({pos[0]}, {pos[1]})"
        except Exception as fallback_error:
            logger.error(f"Failed to get mouse position: {fallback_error}", exc_info=True)
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
        loop = asyncio.get_event_loop()
        size = await loop.run_in_executor(get_interactive_executor(), _get_screen_resolution_pyautogui)
        if size is None:
            return None
        return f"{size[0]}x{size[1]}"
    except Exception as e:
        logger.warning("Failed to get screen resolution: %s", e)
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


def _get_active_window_linux_xdotool() -> Optional[str]:
    """Get active Linux window title using xdotool."""
    try:
        import subprocess

        result = subprocess.run(
            ["xdotool", "getactivewindow", "getwindowname"],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode != 0:
            return None
        title = result.stdout.strip()
        normalized = _normalize_runtime_text(title)
        return normalized or None
    except Exception:
        return None


def _decode_x11_property(value: object) -> Optional[str]:
    if isinstance(value, bytes):
        decoded = value.decode("utf-8", errors="ignore").strip()
        normalized = _normalize_runtime_text(decoded)
        return normalized or None
    if isinstance(value, str):
        decoded = value.strip()
        normalized = _normalize_runtime_text(decoded)
        return normalized or None
    try:
        decoded = bytes(value).decode("utf-8", errors="ignore").strip()
        normalized = _normalize_runtime_text(decoded)
        return normalized or None
    except Exception:
        return None


def _get_active_window_linux_xlib() -> Optional[str]:
    """Get active Linux window title via X11 properties."""
    if not IS_LINUX:
        return None
    if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        return None

    display_connection = None
    try:
        from Xlib import X, display  # type: ignore

        display_connection = display.Display()
        root = display_connection.screen().root
        active_window_atom = display_connection.intern_atom("_NET_ACTIVE_WINDOW")
        active_prop = root.get_full_property(active_window_atom, X.AnyPropertyType)
        if active_prop is None or not getattr(active_prop, "value", None):
            return None

        active_window_id = int(active_prop.value[0])
        active_window = display_connection.create_resource_object("window", active_window_id)

        for property_name in ("_NET_WM_NAME", "WM_NAME"):
            property_atom = display_connection.intern_atom(property_name)
            name_prop = active_window.get_full_property(property_atom, X.AnyPropertyType)
            if name_prop is None:
                continue
            decoded_name = _decode_x11_property(name_prop.value)
            if decoded_name:
                return decoded_name
        return None
    except Exception:
        return None
    finally:
        try:
            if display_connection is not None:
                display_connection.close()
        except Exception:
            pass


def _get_mouse_position_pyautogui():
    try:
        import pyautogui
    except ImportError as exc:
        raise RuntimeError("pyautogui not available") from exc
    except BaseException as exc:  # pragma: no cover - platform/import edge case
        raise RuntimeError(f"failed to import pyautogui: {exc}") from exc

    try:
        return pyautogui.position()
    except BaseException as exc:
        raise RuntimeError(f"failed to read mouse position via pyautogui: {exc}") from exc


def _get_screen_resolution_pyautogui() -> Optional[tuple[int, int]]:
    try:
        import pyautogui
    except ImportError:
        logger.warning("pyautogui not available, cannot get screen resolution")
        return None
    except BaseException as exc:  # pragma: no cover - platform/import edge case
        raise RuntimeError(f"failed to import pyautogui: {exc}") from exc

    if not callable(getattr(pyautogui, "size", None)):
        raise RuntimeError("pyautogui missing size()")

    try:
        size = pyautogui.size()
        return int(size.width), int(size.height)
    except BaseException as exc:
        raise RuntimeError(f"failed to read screen resolution via pyautogui: {exc}") from exc


def _get_mouse_position_linux_xlib() -> Optional[tuple[int, int]]:
    """Get Linux mouse position via X11 pointer query."""
    if not IS_LINUX:
        return None
    if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        return None

    display_connection = None
    try:
        from Xlib import display  # type: ignore

        display_connection = display.Display()
        pointer = display_connection.screen().root.query_pointer()
        return int(pointer.root_x), int(pointer.root_y)
    except Exception:
        return None
    finally:
        try:
            if display_connection is not None:
                display_connection.close()
        except Exception:
            pass
