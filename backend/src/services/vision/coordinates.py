"""
Coordinate Extraction Utilities.

Provides utilities for extracting and scaling coordinates from vision model outputs.
"""
import math
import re
from typing import Optional, Tuple

# Regex patterns for extracting coordinates (from CoAct-1 InternVL implementation)
_NUM = r"(-?\d+(?:\.\d+)?)"
POINT_PATTERN = re.compile(r"\[\[\s*" + _NUM + r"\s*,\s*" + _NUM + r"\s*\]\]")
BBOX_PATTERN = re.compile(
    r"\[\[\s*"
    + _NUM
    + r"\s*,\s*"
    + _NUM
    + r"\s*,\s*"
    + _NUM
    + r"\s*,\s*"
    + _NUM
    + r"\s*\]\]"
)


def extract_first_point(text: str) -> Optional[Tuple[float, float]]:
    """Extract the first [[x,y]] as normalized (0-1000) floats."""
    m = POINT_PATTERN.search(text)
    if not m:
        return None
    try:
        x = float(m.group(1))
        y = float(m.group(2))
        return x, y
    except Exception:
        return None


def extract_last_bbox(text: str) -> Optional[Tuple[float, float, float, float]]:
    """Extract the last [[x1,y1,x2,y2]] as normalized (0-1000) floats."""
    last_match = None
    for match in BBOX_PATTERN.finditer(text):
        last_match = match

    if not last_match:
        return None

    try:
        x1 = float(last_match.group(1))
        y1 = float(last_match.group(2))
        x2 = float(last_match.group(3))
        y2 = float(last_match.group(4))
        return x1, y1, x2, y2
    except Exception:
        return None


def extract_point_or_bbox_center(text: str) -> Optional[Tuple[float, float]]:
    """Extract [[x,y]] or convert the last [[x1,y1,x2,y2]] bbox to center point."""
    point = extract_first_point(text)
    if point is not None:
        return point

    bbox = extract_last_bbox(text)
    if bbox is None:
        return None

    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def scale_norm_to_pixels(
    x_norm: float, y_norm: float, width: int, height: int
) -> Tuple[int, int]:
    """Scale 0-1000 normalized coordinates to pixel coordinates for given image size."""
    if width <= 0 or height <= 0:
        return 0, 0

    x_px = int(math.floor((x_norm / 1000.0) * width))
    y_px = int(math.floor((y_norm / 1000.0) * height))
    # Clamp to image bounds just in case
    x_px = max(0, min(width - 1, x_px))
    y_px = max(0, min(height - 1, y_px))
    return x_px, y_px


def scale_model_point_to_pixels(
    x_value: float, y_value: float, width: int, height: int
) -> Tuple[int, int]:
    """
    Scale model output coordinates to pixels.

    Supports three common model coordinate spaces:
    - Unit normalized [0, 1]
    - InternVL-style normalized [0, 1000]
    - Absolute pixel-like values (>1000 on either axis)
    """
    if width <= 0 or height <= 0:
        return 0, 0

    x_norm = x_value
    y_norm = y_value
    if 0 <= x_norm <= 1 and 0 <= y_norm <= 1:
        x_norm *= 1000.0
        y_norm *= 1000.0

    if x_norm > 1000 or y_norm > 1000:
        x_px = max(0, min(width - 1, int(round(x_norm))))
        y_px = max(0, min(height - 1, int(round(y_norm))))
        return x_px, y_px

    return scale_norm_to_pixels(x_norm, y_norm, width, height)
