"""
Image dimension helpers.

We need to map coordinates produced in screenshot pixel space to the OS mouse
coordinate space. On Linux with HiDPI scaling, `pyautogui.size()` (used by the
frontend for clicks) often returns a logical resolution like 1920x1080, while
captured screenshots can be physical pixels like 3840x2160.
"""

from __future__ import annotations

import struct
from typing import Optional, Tuple

from backend.src.services.ocr.helpers import decode_screenshot_payload


def parse_screen_resolution(value: object) -> Optional[Tuple[int, int]]:
    """Parse screen resolution from system_state (usually 'WIDTHxHEIGHT')."""
    if isinstance(value, str):
        raw = value.strip().lower()
        if "x" not in raw:
            return None
        left, right = raw.split("x", 1)
        try:
            return int(left), int(right)
        except ValueError:
            return None
    if isinstance(value, dict):
        width = value.get("width")
        height = value.get("height")
        if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
            return width, height
    return None


def get_image_dimensions_from_screenshot_b64(screenshot_b64: str) -> Optional[Tuple[int, int]]:
    """
    Return (width, height) for a base64 screenshot payload (JPEG/PNG).

    Avoids PIL dependency; parses headers directly.
    """
    image_bytes = decode_screenshot_payload(screenshot_b64, logger=_NullLogger())
    if not image_bytes:
        return None

    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return _parse_png_dimensions(image_bytes)
    if image_bytes.startswith(b"\xff\xd8"):
        return _parse_jpeg_dimensions(image_bytes)
    return None


def _parse_png_dimensions(data: bytes) -> Optional[Tuple[int, int]]:
    if len(data) < 24:
        return None
    # PNG IHDR chunk starts at offset 8; width/height are big-endian at fixed offsets.
    if data[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", data[16:24])
    if width <= 0 or height <= 0:
        return None
    return int(width), int(height)


def _parse_jpeg_dimensions(data: bytes) -> Optional[Tuple[int, int]]:
    # JPEG markers: scan for SOF0/SOF2/etc which carry width/height.
    # Ref: ITU T.81 (JPEG)
    i = 2  # Skip SOI
    n = len(data)
    while i + 1 < n:
        if data[i] != 0xFF:
            i += 1
            continue

        # Skip fill bytes 0xFF
        while i < n and data[i] == 0xFF:
            i += 1
        if i >= n:
            break

        marker = data[i]
        i += 1

        # Standalone markers without length
        if marker in (0xD8, 0xD9):  # SOI, EOI
            continue
        if marker == 0xDA:  # SOS: image data begins; dimensions must appear before this
            break

        if i + 1 >= n:
            break
        seg_len = struct.unpack(">H", data[i:i + 2])[0]
        if seg_len < 2:
            return None

        # SOF markers that define frame size
        if marker in (
            0xC0, 0xC1, 0xC2, 0xC3,
            0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB,
            0xCD, 0xCE, 0xCF,
        ):
            start = i + 2
            if start + 5 >= n:
                return None
            # [precision:1][height:2][width:2]
            height = struct.unpack(">H", data[start + 1:start + 3])[0]
            width = struct.unpack(">H", data[start + 3:start + 5])[0]
            if width <= 0 or height <= 0:
                return None
            return int(width), int(height)

        i += seg_len
    return None


class _NullLogger:
    def error(self, *_args, **_kwargs) -> None:
        return

