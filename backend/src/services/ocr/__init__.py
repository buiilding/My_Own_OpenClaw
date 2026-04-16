"""OCR service package."""

from backend.src.services.ocr.provider import LocalOcrProvider
from backend.src.services.ocr.ocr_service import OcrService

__all__ = [
    "LocalOcrProvider",
    "OcrService",
]
