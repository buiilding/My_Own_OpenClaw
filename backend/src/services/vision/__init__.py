"""
Vision Services Package.

Provides vision model handlers and coordinate utilities.
"""
from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels,
)
from backend.src.services.vision.internvl import InternVLModel

__all__ = [
    "InternVLModel",
    "extract_first_point",
    "extract_last_bbox",
    "scale_norm_to_pixels",
]
