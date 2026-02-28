"""
Screenshot Tool - Python implementation using pyautogui and PIL.
Optimized for speed using JPEG compression.
"""

import asyncio
import base64
import hashlib
import io
import logging
import time
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


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


def _generate_screenshot_id(base64_data: str) -> str:
    sample = base64_data[:1024] if len(base64_data) > 1024 else base64_data
    return hashlib.sha256(sample.encode("utf-8")).hexdigest()[:16]


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
            monitor_id = None
            if isinstance(args, dict) and isinstance(args.get("display_bounds"), dict):
                monitor_id = _normalize_monitor_id(args["display_bounds"].get("monitor_id"))

            screenshot = pyautogui.screenshot(region=region) if region else pyautogui.screenshot()

            source_w, source_h = screenshot.size
            virtual_size = _coerce_virtual_size(pyautogui.size())
            if region:
                crop_x, crop_y, crop_w, crop_h = region
            else:
                crop_x, crop_y = 0, 0
                crop_w, crop_h = virtual_size if virtual_size else (source_w, source_h)

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
            base64_data = base64.b64encode(img_bytes).decode("utf-8")

            screenshot_id = _generate_screenshot_id(base64_data)
            timestamp_ms = int(time.time() * 1000)

            return {
                "screenshot": base64_data,
                "compression": "jpeg",
                "size": int(len(base64_data) * 0.75),
                "screenshot_id": screenshot_id,
                "capture_meta": {
                    "screenshot_id": screenshot_id,
                    "source_w": int(source_w),
                    "source_h": int(source_h),
                    "crop_x": int(crop_x),
                    "crop_y": int(crop_y),
                    "crop_w": int(crop_w),
                    "crop_h": int(crop_h),
                    "desktop_virtual_bounds": {
                        "x": int(crop_x),
                        "y": int(crop_y),
                        "width": int(crop_w),
                        "height": int(crop_h),
                    },
                    "monitor_id": monitor_id,
                    "timestamp": timestamp_ms,
                },
            }

        loop = asyncio.get_event_loop()
        capture_payload = await loop.run_in_executor(None, _capture)

        return {
            "success": True,
            "data": {
                **capture_payload,
                "llm_content": "Screenshot captured successfully.",
                "return_display": "Screenshot captured",
            },
        }
    except ImportError as e:
        logger.error(f"Required library not available: {e}")
        return {"success": False, "error": f"Required library not available: {str(e)}"}
    except Exception as e:
        logger.error(f"Screenshot failed: {e}", exc_info=True)
        return {"success": False, "error": f"Screenshot failed: {str(e)}"}
