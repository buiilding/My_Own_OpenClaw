"""OCR router."""

from __future__ import annotations

from typing import Optional

from backend.src.core.interfaces.ocr import IOcrProvider


class OcrRouter:
    """Capability router for OCR providers."""

    def __init__(self, provider: Optional[IOcrProvider] = None) -> None:
        self._provider = provider

    @property
    def provider(self) -> Optional[IOcrProvider]:
        return self._provider

    def set_provider(self, provider: Optional[IOcrProvider]) -> None:
        self._provider = provider

    @property
    def provider_id(self) -> str:
        provider = self._provider
        return provider.provider_id if provider is not None else "unconfigured"

    @property
    def model_id(self) -> str:
        provider = self._provider
        return provider.model_id if provider is not None else "unconfigured"

    @property
    def enabled(self) -> bool:
        provider = self._provider
        return bool(provider is not None and getattr(provider, "enabled", False))

    @enabled.setter
    def enabled(self, value: bool) -> None:
        provider = self._provider
        if provider is not None:
            provider.enabled = value

    @property
    def is_ready(self) -> bool:
        provider = self._provider
        return bool(provider is not None and provider.is_ready)

    async def initialize(self) -> None:
        provider = self._provider
        if provider is None:
            return
        await provider.initialize()

    async def analyze_image(self, image_base64: str):
        provider = self._provider
        if provider is None:
            return None
        return await provider.analyze_image(image_base64)

    async def perform_ocr(self, screenshot_b64: str):
        return await self.analyze_image(screenshot_b64)
