"""Local vision provider adapter."""

from __future__ import annotations

from typing import Optional

from backend.src.services.vision.vision_service import VisionService


class LocalVisionProvider:
    """Wrap the in-process vision service behind the provider contract."""

    provider_id = "local-vision"

    def __init__(self, service: VisionService) -> None:
        self._service = service

    @property
    def model_id(self) -> str:
        return self._service.model_name

    @property
    def model_name(self) -> str:
        return self._service.model_name

    @property
    def model(self):
        return self._service.model

    @property
    def is_initialized(self) -> bool:
        return self._service.is_initialized

    @property
    def initialization_error(self) -> Optional[str]:
        return self._service.initialization_error

    async def initialize(self) -> bool:
        return await self._service.initialize()

    async def unload_model(self) -> bool:
        return await self._service.unload_model()
