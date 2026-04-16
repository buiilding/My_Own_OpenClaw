"""Vision router."""

from __future__ import annotations

from typing import Any, Optional

from backend.src.core.interfaces.vision import IVisionProvider


class VisionRouter:
    """Capability router for vision providers."""

    def __init__(self, provider: Optional[IVisionProvider] = None) -> None:
        self._provider = provider

    @property
    def provider(self) -> Optional[IVisionProvider]:
        return self._provider

    def set_provider(self, provider: Optional[IVisionProvider]) -> None:
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
    def model_name(self) -> str:
        provider = self._provider
        return provider.model_name if provider is not None else "unconfigured"

    @property
    def model(self) -> Optional[Any]:
        provider = self._provider
        return provider.model if provider is not None else None

    @property
    def is_initialized(self) -> bool:
        provider = self._provider
        return bool(provider is not None and provider.is_initialized)

    @property
    def initialization_error(self) -> Optional[str]:
        provider = self._provider
        return provider.initialization_error if provider is not None else None

    async def initialize(self) -> bool:
        provider = self._provider
        if provider is None:
            return False
        return await provider.initialize()

    async def unload_model(self) -> bool:
        provider = self._provider
        if provider is None:
            return False
        unload_model = getattr(provider, "unload_model", None)
        if not callable(unload_model):
            return False
        return await unload_model()
