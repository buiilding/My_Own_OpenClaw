"""
Vision Services Package.

Provides vision model handlers and coordinate utilities.
"""
from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels,
)
from backend.src.services.vision.providers import (
    BaseVisionModel,
    InternVLModel,
    VenusVisionModel,
    VISION_MODELS_AVAILABLE,
)
from backend.src.services.vision.utils import normalize_model_name
from backend.src.services.vision.vision_service import VisionService

__all__ = [
    "BaseVisionModel",
    "InternVLModel",
    "VenusVisionModel",
    "VISION_MODELS_AVAILABLE",
    "VisionService",
    "normalize_model_name",
    "extract_first_point",
    "extract_last_bbox",
    "scale_norm_to_pixels",
]
