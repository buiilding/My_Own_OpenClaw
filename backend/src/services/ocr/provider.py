"""Local OCR provider adapter."""

from __future__ import annotations

from typing import Any, Optional

from backend.src.services.ocr.ocr_service import OcrService


class LocalOcrProvider:
    """Wrap the in-process OCR service behind the provider contract."""

    provider_id = "local-rapidocr"

    def __init__(
        self,
        service: OcrService,
        model_id: str = "rapidocr-ppocrv5-server",
    ) -> None:
        self._service = service
        self.model_id = model_id

    @property
    def enabled(self) -> bool:
        return self._service.enabled

    @enabled.setter
    def enabled(self, value: bool) -> None:
        self._service.enabled = value

    @property
    def is_ready(self) -> bool:
        return self._service.is_ready

    async def initialize(self) -> None:
        await self._service.initialize()

    async def analyze_image(self, image_base64: str) -> Optional[list[dict[str, Any]]]:
        return await self._service.perform_ocr(image_base64)

    async def perform_ocr(self, screenshot_b64: str) -> Optional[list[dict[str, Any]]]:
        return await self.analyze_image(screenshot_b64)
