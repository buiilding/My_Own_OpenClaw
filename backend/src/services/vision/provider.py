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
    def is_initialized(self) -> bool:
        return self._service.is_initialized

    @property
    def initialization_error(self) -> Optional[str]:
        return self._service.initialization_error

    async def initialize(self) -> bool:
        return await self._service.initialize()

    async def health_check(self) -> bool:
        return self.is_initialized and not self.initialization_error

    async def predict_coordinates(
        self,
        image_base64: str,
        description: str,
    ) -> Optional[tuple[int, int]]:
        model = self._service.model
        if model is None:
            return None
        return await model.predict_click_coordinates(image_base64, description)

    async def answer_question_about_image(
        self,
        image_base64: str,
        prompt: str,
    ) -> Optional[str]:
        model = self._service.model
        if model is None:
            return None
        return await model.answer_question_about_image(image_base64, prompt)

    async def unload_model(self) -> bool:
        return await self._service.unload_model()
