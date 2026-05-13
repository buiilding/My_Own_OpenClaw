"""Vision router."""

from __future__ import annotations

from typing import Optional

from backend.src.core.inference.circuit_breaker import ProviderCircuitBreaker
from backend.src.core.inference.errors import (
    ProviderCapabilityError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from backend.src.core.interfaces.vision import IVisionProvider


class VisionRouter:
    """Capability router for vision providers."""

    def __init__(
        self,
        provider: Optional[IVisionProvider] = None,
        *,
        failure_threshold: int = 3,
        cooldown_seconds: float = 60.0,
    ) -> None:
        self._provider = provider
        self._circuit_breaker = ProviderCircuitBreaker(
            failure_threshold=failure_threshold,
            cooldown_seconds=cooldown_seconds,
        )

    @property
    def provider(self) -> Optional[IVisionProvider]:
        return self._provider

    def set_provider(self, provider: Optional[IVisionProvider]) -> None:
        self._provider = provider
        self._circuit_breaker.reset()

    def configure_circuit_breaker(
        self,
        *,
        failure_threshold: int,
        cooldown_seconds: float,
    ) -> None:
        self._circuit_breaker.configure(
            failure_threshold=failure_threshold,
            cooldown_seconds=cooldown_seconds,
        )

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
    def is_initialized(self) -> bool:
        provider = self._provider
        return bool(
            provider is not None
            and provider.is_initialized
            and not self._circuit_breaker.is_open
        )

    @property
    def initialization_error(self) -> Optional[str]:
        provider = self._provider
        if self._circuit_breaker.is_open:
            return self.unavailable_error_message()
        return provider.initialization_error if provider is not None else None

    @property
    def circuit_open(self) -> bool:
        return self._circuit_breaker.is_open

    def unavailable_error_message(self) -> str:
        provider = self._provider
        provider_id = self.provider_id
        try:
            self._circuit_breaker.ensure_closed(
                capability="vision",
                provider_id=provider_id,
            )
        except ProviderCapabilityError as error:
            return str(error)
        if provider is None:
            return str(
                ProviderUnavailableError(
                    capability="vision",
                    provider_id=provider_id,
                    message="Vision provider is not configured",
                )
            )
        provider_error = getattr(provider, "initialization_error", None)
        if provider_error:
            return str(
                ProviderUnavailableError(
                    capability="vision",
                    provider_id=provider_id,
                    message=f"Vision provider initialization failed: {provider_error}",
                )
            )
        if not getattr(provider, "is_initialized", False):
            return str(
                ProviderUnavailableError(
                    capability="vision",
                    provider_id=provider_id,
                    message="Vision provider is not initialized",
                )
            )
        return "Vision provider is unavailable"

    async def initialize(self) -> bool:
        provider = self._provider
        if provider is None:
            return False
        try:
            initialized = bool(await provider.initialize())
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=f"Vision provider initialization failed: {error}",
            ) from error
        if initialized:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure(
                getattr(provider, "initialization_error", None)
                or "Vision provider initialization returned false"
            )
        return initialized

    async def health_check(self) -> bool:
        provider = self._provider
        if provider is None or self._circuit_breaker.is_open:
            return False
        health_check = getattr(provider, "health_check", None)
        try:
            if callable(health_check):
                healthy = bool(await health_check())
            else:
                healthy = bool(getattr(provider, "is_initialized", False))
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            return False
        if healthy:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure(
                "Vision health check returned unhealthy"
            )
        return healthy

    async def predict_coordinates(
        self,
        image_base64: str,
        description: str,
    ) -> Optional[tuple[int, int]]:
        provider = self._provider
        if provider is None:
            raise ProviderUnavailableError(
                capability="vision",
                provider_id=self.provider_id,
                message="Vision provider is not configured",
            )
        self._circuit_breaker.ensure_closed(
            capability="vision",
            provider_id=self.provider_id,
        )
        if not getattr(provider, "is_initialized", False):
            raise ProviderUnavailableError(
                capability="vision",
                provider_id=self.provider_id,
                message="Vision provider is not initialized",
            )
        try:
            result = await provider.predict_coordinates(image_base64, description)
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=f"Vision provider request failed: {error}",
            ) from error
        if result is None:
            error = ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message="Vision provider returned no coordinates",
            )
            self._circuit_breaker.record_failure(error)
            raise error
        self._circuit_breaker.record_success()
        return result

    async def answer_question_about_image(
        self,
        image_base64: str,
        prompt: str,
    ) -> Optional[str]:
        provider = self._provider
        if provider is None:
            raise ProviderUnavailableError(
                capability="vision",
                provider_id=self.provider_id,
                message="Vision provider is not configured",
            )
        self._circuit_breaker.ensure_closed(
            capability="vision",
            provider_id=self.provider_id,
        )
        if not getattr(provider, "is_initialized", False):
            raise ProviderUnavailableError(
                capability="vision",
                provider_id=self.provider_id,
                message="Vision provider is not initialized",
            )
        try:
            result = await provider.answer_question_about_image(image_base64, prompt)
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=f"Vision provider request failed: {error}",
            ) from error
        if result is None:
            error = ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message="Vision provider returned no description",
            )
            self._circuit_breaker.record_failure(error)
            raise error
        self._circuit_breaker.record_success()
        return result

    async def unload_model(self) -> bool:
        provider = self._provider
        if provider is None:
            return False
        unload_model = getattr(provider, "unload_model", None)
        if not callable(unload_model):
            return False
        return await unload_model()
