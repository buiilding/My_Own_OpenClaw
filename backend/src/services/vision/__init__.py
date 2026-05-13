"""
Vision Services Package.

Provides vision model handlers and coordinate utilities.
"""

from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels,
)
from backend.src.services.vision.provider import LocalVisionProvider
from backend.src.services.vision.providers import (
    VISION_MODELS_AVAILABLE,
    BaseVisionModel,
    InternVLModel,
    VenusVisionModel,
)
from backend.src.services.vision.remote_provider import RemoteHttpVisionProvider
from backend.src.services.vision.utils import normalize_model_name
from backend.src.services.vision.vision_service import VisionService

__all__ = [
    "BaseVisionModel",
    "InternVLModel",
    "LocalVisionProvider",
    "RemoteHttpVisionProvider",
    "VenusVisionModel",
    "VISION_MODELS_AVAILABLE",
    "VisionService",
    "normalize_model_name",
    "extract_first_point",
    "extract_last_bbox",
    "scale_norm_to_pixels",
]
