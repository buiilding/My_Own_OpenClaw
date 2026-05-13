"""OCR service package."""

from backend.src.services.ocr.ocr_service import OcrService
from backend.src.services.ocr.provider import LocalOcrProvider
from backend.src.services.ocr.remote_provider import RemoteHttpOcrProvider

__all__ = [
    "LocalOcrProvider",
    "OcrService",
    "RemoteHttpOcrProvider",
]
