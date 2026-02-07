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


def scale_norm_to_pixels(
    x_norm: float, y_norm: float, width: int, height: int
) -> Tuple[int, int]:
    """Scale 0-1000 normalized coordinates to pixel coordinates for given image size."""
    x_px = int(math.floor((x_norm / 1000.0) * width))
    y_px = int(math.floor((y_norm / 1000.0) * height))
    # Clamp to image bounds just in case
    x_px = max(0, min(width - 1, x_px))
    y_px = max(0, min(height - 1, y_px))
    return x_px, y_px
