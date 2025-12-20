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
from backend.src.services.vision.utils import normalize_model_name
from backend.src.services.vision.vision_service import VisionService

__all__ = [
    "InternVLModel",
    "VisionService",
    "normalize_model_name",
    "extract_first_point",
    "extract_last_bbox",
    "scale_norm_to_pixels",
]
