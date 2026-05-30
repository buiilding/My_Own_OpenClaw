"""
Screenshot Tool - Python implementation using pyautogui and PIL.
Optimized for speed using JPEG compression.
"""

import base64
import asyncio
import io
import logging
import os
import platform
import shutil
import subprocess
import tempfile
import time
from functools import lru_cache
from typing import Dict, Any, Optional

from core.executors import get_interactive_executor

logger = logging.getLogger(__name__)

SCREENSHOT_TEMP_DIR_NAME = "windieos-screenshots"
SCREENSHOT_TEMP_FILE_PREFIX = "windie-shot-"


def _normalize_monitor_id(raw_monitor_id: object) -> Optional[str]:
    if isinstance(raw_monitor_id, str):
        normalized = raw_monitor_id.strip()
        if normalized:
            return normalized
    return None


def _coerce_region(value: object) -> Optional[tuple[int, int, int, int]]:
    if not isinstance(value, dict):
        return None
    x = value.get("x")
    y = value.get("y")
    width = value.get("width")
    height = value.get("height")
    if not all(isinstance(item, (int, float)) for item in (x, y, width, height)):
        return None
    region = (int(x), int(y), int(width), int(height))
    if region[2] <= 0 or region[3] <= 0:
        return None
    return region


def _coerce_virtual_bounds(value: object) -> Optional[tuple[int, int, int, int]]:
    return _coerce_region(value)


def _coerce_virtual_size(value: object) -> Optional[tuple[int, int]]:
    if isinstance(value, tuple) and len(value) == 2:
        left, right = value
        if isinstance(left, int) and isinstance(right, int) and left > 0 and right > 0:
            return left, right

    width = getattr(value, "width", None)
    height = getattr(value, "height", None)
    if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
        return width, height

    return None


def _is_windows_platform() -> bool:
    return platform.system().lower() == "windows"


def _is_linux_x11_session() -> bool:
    if platform.system().lower() != "linux":
        return False
    session_type = os.environ.get("XDG_SESSION_TYPE", "").lower()
    return session_type == "x11"


def _should_capture_full_virtual_desktop(
    *,
    region: Optional[tuple[int, int, int, int]],
    desktop_virtual_bounds: Optional[tuple[int, int, int, int]],
) -> bool:
    if region is None or desktop_virtual_bounds is None:
        return False

    # On macOS, Pillow's bounded grab path already accepts desktop-space
    # coordinates and returns the correctly scaled region. Capturing the full
    # desktop and cropping manually reintroduces Retina pixel/logical drift.
    if platform.system().lower() == "darwin":
        return False

    return True


def _crop_full_desktop_capture_to_region(
    screenshot: object,
    *,
    region: Optional[tuple[int, int, int, int]],
    desktop_virtual_bounds: Optional[tuple[int, int, int, int]],
):
    if region is None or desktop_virtual_bounds is None:
        return screenshot

    desktop_x, desktop_y, desktop_w, desktop_h = desktop_virtual_bounds
    crop_x, crop_y, crop_w, crop_h = region
    relative_left = crop_x - desktop_x
    relative_top = crop_y - desktop_y
    relative_right = relative_left + crop_w
    relative_bottom = relative_top + crop_h

    if (
        relative_left < 0
        or relative_top < 0
        or relative_right > desktop_w
        or relative_bottom > desktop_h
    ):
        raise ValueError(
            "Display bounds fall outside the reported virtual desktop bounds"
        )

    return screenshot.crop((relative_left, relative_top, relative_right, relative_bottom))


def _paste_cursor_overlay(
    screenshot: object,
    *,
    cursor_image: object,
    draw_x: int,
    draw_y: int,
) -> None:
    if screenshot.mode != "RGBA":
        screenshot_rgba = screenshot.convert("RGBA")
    else:
        screenshot_rgba = screenshot
    screenshot_rgba.paste(cursor_image, (draw_x, draw_y), cursor_image)
    if screenshot.mode != "RGBA":
        screenshot.paste(screenshot_rgba.convert(screenshot.mode))


def _capture_with_windows_cursor(region: Optional[tuple[int, int, int, int]]):
    """
    Capture screenshot via Win32 GDI and draw the real OS cursor.

    Returns a Pillow image in RGB mode.
    """
    import ctypes
    import win32con
    import win32gui
    import win32ui
    from PIL import Image

    user32 = ctypes.windll.user32

    if region:
        left, top, width, height = region
    else:
        left = int(user32.GetSystemMetrics(76))  # SM_XVIRTUALSCREEN
        top = int(user32.GetSystemMetrics(77))   # SM_YVIRTUALSCREEN
        width = int(user32.GetSystemMetrics(78))  # SM_CXVIRTUALSCREEN
        height = int(user32.GetSystemMetrics(79))  # SM_CYVIRTUALSCREEN

    desktop_dc = win32gui.GetDC(0)
    src_dc = win32ui.CreateDCFromHandle(desktop_dc)
    mem_dc = src_dc.CreateCompatibleDC()
    bitmap = win32ui.CreateBitmap()
    bitmap.CreateCompatibleBitmap(src_dc, width, height)
    mem_dc.SelectObject(bitmap)

    try:
        mem_dc.BitBlt((0, 0), (width, height), src_dc, (left, top), win32con.SRCCOPY)

        # Draw real cursor glyph if visible.
        try:
            flags, hcursor, cursor_pos = win32gui.GetCursorInfo()
            if flags == win32con.CURSOR_SHOWING and hcursor:
                icon_info = win32gui.GetIconInfo(hcursor)
                hotspot_x = int(icon_info[1])
                hotspot_y = int(icon_info[2])
                draw_x = int(cursor_pos[0]) - hotspot_x - left
                draw_y = int(cursor_pos[1]) - hotspot_y - top
                win32gui.DrawIconEx(
                    mem_dc.GetSafeHdc(),
                    draw_x,
                    draw_y,
                    hcursor,
                    0,
                    0,
                    0,
                    None,
                    win32con.DI_NORMAL,
                )
                mask_bitmap = icon_info[3]
                color_bitmap = icon_info[4]
                if mask_bitmap:
                    win32gui.DeleteObject(mask_bitmap)
                if color_bitmap:
                    win32gui.DeleteObject(color_bitmap)
        except Exception as exc:
            logger.debug("Unable to draw Windows cursor on screenshot: %s", exc)

        bmp_info = bitmap.GetInfo()
        bmp_bits = bitmap.GetBitmapBits(True)
        screenshot = Image.frombuffer(
            "RGB",
            (bmp_info["bmWidth"], bmp_info["bmHeight"]),
            bmp_bits,
            "raw",
            "BGRX",
            0,
            1,
        )
        return screenshot
    finally:
        src_dc.DeleteDC()
        mem_dc.DeleteDC()
        win32gui.ReleaseDC(0, desktop_dc)
        win32gui.DeleteObject(bitmap.GetHandle())


def _crop_if_region(image: object, region: Optional[tuple[int, int, int, int]]) -> object:
    if not region:
        return image
    left, top, width, height = region
    return image.crop((left, top, left + width, top + height))


def _screenshot_temp_dir() -> str:
    temp_dir = os.path.join(tempfile.gettempdir(), SCREENSHOT_TEMP_DIR_NAME)
    os.makedirs(temp_dir, mode=0o700, exist_ok=True)
    try:
        os.chmod(temp_dir, 0o700)
    except OSError:
        logger.debug("Unable to tighten screenshot temp directory permissions", exc_info=True)
    return temp_dir


def _capture_with_linux_cursor(region: Optional[tuple[int, int, int, int]]) -> Optional[tuple[object, str]]:
    """
    Capture screenshot on Linux including cursor using gnome-screenshot/scrot.
    """
    commands: list[tuple[list[str], str]] = []
    if shutil.which("scrot"):
        commands.append((["scrot", "--pointer"], "linux_scrot_pointer"))
        commands.append((["scrot", "-p"], "linux_scrot_p"))
    if shutil.which("gnome-screenshot"):
        commands.append((["gnome-screenshot", "-p", "-f"], "linux_gnome_screenshot_include_pointer"))
    if not commands:
        return None

    try:
        from PIL import Image

        for base_cmd, backend_label in commands:
            with tempfile.NamedTemporaryFile(
                suffix=".png",
                prefix=SCREENSHOT_TEMP_FILE_PREFIX,
                dir=_screenshot_temp_dir(),
                delete=False,
            ) as tmp:
                tmp_path = tmp.name
            try:
                cmd = [*base_cmd, tmp_path]
                result = subprocess.run(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
                if result.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
                    continue
                image = Image.open(tmp_path)
                image.load()
                return _crop_if_region(image, region), backend_label
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
    except Exception as exc:
        logger.debug("Linux cursor screenshot path failed: %s", exc)
        return None
    return None


def _overlay_linux_xfixes_cursor(
    screenshot: object,
    *,
    region: Optional[tuple[int, int, int, int]],
) -> bool:
    """
    Overlay real Linux X11 cursor bitmap via XFixes.

    Returns True when cursor pixels were drawn.
    """
    if platform.system().lower() != "linux":
        return False
    if os.environ.get("XDG_SESSION_TYPE", "").lower() == "wayland":
        return False
    if not os.environ.get("DISPLAY"):
        return False

    try:
        import ctypes
        from PIL import Image

        class XFixesCursorImage(ctypes.Structure):
            _fields_ = [
                ("x", ctypes.c_short),
                ("y", ctypes.c_short),
                ("width", ctypes.c_ushort),
                ("height", ctypes.c_ushort),
                ("xhot", ctypes.c_ushort),
                ("yhot", ctypes.c_ushort),
                ("cursor_serial", ctypes.c_ulong),
                ("pixels", ctypes.POINTER(ctypes.c_ulong)),
                ("atom", ctypes.c_ulong),
                ("name", ctypes.c_char_p),
            ]

        lib_x11 = ctypes.cdll.LoadLibrary("libX11.so.6")
        lib_xfixes = ctypes.cdll.LoadLibrary("libXfixes.so.3")

        lib_x11.XOpenDisplay.restype = ctypes.c_void_p
        lib_x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
        lib_x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
        lib_x11.XFree.argtypes = [ctypes.c_void_p]

        lib_xfixes.XFixesGetCursorImage.restype = ctypes.POINTER(XFixesCursorImage)
        lib_xfixes.XFixesGetCursorImage.argtypes = [ctypes.c_void_p]

        display = lib_x11.XOpenDisplay(None)
        if not display:
            return False
        try:
            cursor_ptr = lib_xfixes.XFixesGetCursorImage(display)
            if not cursor_ptr:
                return False
            try:
                cursor = cursor_ptr.contents
                width = int(cursor.width)
                height = int(cursor.height)
                if width <= 0 or height <= 0:
                    return False

                total_pixels = width * height
                raw_pixels = ctypes.cast(
                    cursor.pixels,
                    ctypes.POINTER(ctypes.c_ulong * total_pixels),
                ).contents

                rgba = bytearray(total_pixels * 4)
                for i in range(total_pixels):
                    value = int(raw_pixels[i]) & 0xFFFFFFFF
                    a = (value >> 24) & 0xFF
                    r = (value >> 16) & 0xFF
                    g = (value >> 8) & 0xFF
                    b = value & 0xFF
                    base = i * 4
                    rgba[base] = r
                    rgba[base + 1] = g
                    rgba[base + 2] = b
                    rgba[base + 3] = a

                cursor_image = Image.frombytes("RGBA", (width, height), bytes(rgba))

                if region:
                    left, top, _, _ = region
                else:
                    left, top = 0, 0

                draw_x = int(cursor.x) - int(cursor.xhot) - int(left)
                draw_y = int(cursor.y) - int(cursor.yhot) - int(top)

                _paste_cursor_overlay(
                    screenshot,
                    cursor_image=cursor_image,
                    draw_x=draw_x,
                    draw_y=draw_y,
                )
                return True
            finally:
                lib_x11.XFree(ctypes.cast(cursor_ptr, ctypes.c_void_p))
        finally:
            lib_x11.XCloseDisplay(display)
    except Exception as exc:
        logger.debug("Linux XFixes cursor overlay failed: %s", exc)
        return False


@lru_cache(maxsize=1)
def _get_macos_builtin_cursor() -> tuple[object, tuple[int, int]]:
    from PIL import Image, ImageDraw

    cursor_image = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(cursor_image)

    outline_points = [
        (0, 0),
        (0, 17),
        (4, 13),
        (7, 22),
        (10, 20),
        (7, 12),
        (13, 12),
    ]
    fill_points = [
        (1, 1),
        (1, 15),
        (4, 12),
        (7, 20),
        (8, 19),
        (5, 11),
        (11, 11),
    ]

    draw.polygon(outline_points, fill=(0, 0, 0, 255))
    draw.polygon(fill_points, fill=(255, 255, 255, 255))

    return cursor_image, (0, 0)


def _overlay_macos_builtin_cursor(
    screenshot: object,
    *,
    region: Optional[tuple[int, int, int, int]],
) -> bool:
    """
    Overlay a deterministic built-in macOS-style cursor image.

    Returns True when cursor pixels were drawn.
    """
    if platform.system().lower() != "darwin":
        return False

    try:
        import pyautogui
        cursor_image, (hot_spot_x, hot_spot_y) = _get_macos_builtin_cursor()
        cursor_pos = pyautogui.position()

        if region:
            left, top, _, _ = region
        else:
            left, top = 0, 0

        draw_x = int(cursor_pos.x) - int(hot_spot_x) - int(left)
        draw_y = int(cursor_pos.y) - int(hot_spot_y) - int(top)

        _paste_cursor_overlay(
            screenshot,
            cursor_image=cursor_image,
            draw_x=draw_x,
            draw_y=draw_y,
        )
        return True
    except Exception as exc:
        logger.debug("macOS built-in cursor overlay failed: %s", exc)
        return False


def _capture_with_system_cursor(region: Optional[tuple[int, int, int, int]]) -> Optional[tuple[object, str]]:
    if _is_windows_platform():
        try:
            return _capture_with_windows_cursor(region=region), "windows_win32_drawicon"
        except Exception as exc:
            logger.debug("Windows cursor screenshot path failed: %s", exc)
            return None

    system_name = platform.system().lower()
    if system_name == "darwin":
        # On macOS, avoid screencapture CLI side-effects (flash + shutter sound).
        # Use silent capture path and overlay real cursor with AppKit below.
        return None
    if system_name == "linux":
        # On Linux X11, avoid gnome-screenshot/scrot side-effects (flash + shutter sound).
        # We capture silently via pyautogui fallback and overlay real cursor using XFixes.
        if _is_linux_x11_session():
            return None
        return _capture_with_linux_cursor(region=region)
    return None


async def capture_screenshot(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Capture screenshot with optimized JPEG compression for faster encoding.

    Args:
        args: Screenshot args. Supports optional display_bounds payload.

    Returns:
        Dictionary with success status and screenshot payload.
    """
    try:
        import pyautogui
        from PIL import Image  # noqa: F401

        def _capture() -> Dict[str, Any]:
            region = _coerce_region(args.get("display_bounds") if isinstance(args, dict) else None)
            desktop_virtual_bounds = None
            monitor_id = None
            if isinstance(args, dict) and isinstance(args.get("display_bounds"), dict):
                monitor_id = _normalize_monitor_id(args["display_bounds"].get("monitor_id"))
                desktop_virtual_bounds = _coerce_virtual_bounds(
                    args["display_bounds"].get("desktop_virtual_bounds")
                )

            capture_full_virtual_desktop = _should_capture_full_virtual_desktop(
                region=region,
                desktop_virtual_bounds=desktop_virtual_bounds,
            )
            capture_region = None if capture_full_virtual_desktop else region
            system_capture = _capture_with_system_cursor(region=capture_region)
            capture_engine = "pyautogui_fallback"
            if system_capture is not None:
                screenshot, capture_engine = system_capture
            else:
                screenshot = pyautogui.screenshot(region=capture_region) if capture_region else pyautogui.screenshot()

            if capture_full_virtual_desktop:
                screenshot = _crop_full_desktop_capture_to_region(
                    screenshot,
                    region=region,
                    desktop_virtual_bounds=desktop_virtual_bounds,
                )

            # Linux X11 fallback: overlay real cursor bitmap from XFixes.
            if _overlay_linux_xfixes_cursor(screenshot, region=region):
                capture_engine = f"{capture_engine}+linux_xfixes_cursor"
            if _overlay_macos_builtin_cursor(screenshot, region=region):
                capture_engine = f"{capture_engine}+macos_builtin_cursor"

            source_w, source_h = screenshot.size
            virtual_size = _coerce_virtual_size(pyautogui.size())
            if region:
                crop_x, crop_y, crop_w, crop_h = region
            else:
                crop_x, crop_y = 0, 0
                crop_w, crop_h = virtual_size if virtual_size else (source_w, source_h)
            effective_virtual_bounds = desktop_virtual_bounds or (
                (crop_x, crop_y, crop_w, crop_h)
                if region
                else (crop_x, crop_y, crop_w, crop_h)
            )

            if screenshot.mode != 'RGB':
                screenshot = screenshot.convert('RGB')

            img_buffer = io.BytesIO()
            screenshot.save(
                img_buffer,
                format="JPEG",
                quality=85,
                optimize=False,
                progressive=False,
            )
            img_bytes = img_buffer.getvalue()
            timestamp_ms = int(time.time() * 1000)

            return {
                "screenshot": base64.b64encode(img_bytes).decode("ascii"),
                "screenshot_content_type": "image/jpeg",
                "compression": "jpeg",
                "size": len(img_bytes),
                "capture_meta": {
                    "source_w": int(source_w),
                    "source_h": int(source_h),
                    "crop_x": int(crop_x),
                    "crop_y": int(crop_y),
                    "crop_w": int(crop_w),
                    "crop_h": int(crop_h),
                    "desktop_virtual_bounds": {
                        "x": int(effective_virtual_bounds[0]),
                        "y": int(effective_virtual_bounds[1]),
                        "width": int(effective_virtual_bounds[2]),
                        "height": int(effective_virtual_bounds[3]),
                    },
                    "monitor_id": monitor_id,
                    "timestamp": timestamp_ms,
                    "capture_engine": capture_engine,
                },
            }

        loop = asyncio.get_event_loop()
        capture_payload = await loop.run_in_executor(get_interactive_executor(), _capture)

        return {
            "success": True,
            "data": {
                **capture_payload,
                "output": "Screenshot captured successfully.",
                "message": "Screenshot captured",
            },
        }
    except ImportError as e:
        logger.error(f"Required library not available: {e}")
        return {"success": False, "error": f"Required library not available: {str(e)}"}
    except Exception as e:
        logger.error(f"Screenshot failed: {e}", exc_info=True)
        return {"success": False, "error": f"Screenshot failed: {str(e)}"}
