"""Inference capability routers."""

from backend.src.core.inference.embedding_router import EmbeddingRouter
from backend.src.core.inference.ocr_router import OcrRouter
from backend.src.core.inference.vision_router import VisionRouter

__all__ = [
    "EmbeddingRouter",
    "OcrRouter",
    "VisionRouter",
]
