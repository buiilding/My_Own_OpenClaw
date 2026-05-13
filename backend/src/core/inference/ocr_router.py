"""OCR router."""

from __future__ import annotations

from typing import Optional

from backend.src.core.inference.circuit_breaker import ProviderCircuitBreaker
from backend.src.core.inference.errors import (
    ProviderCapabilityError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from backend.src.core.interfaces.ocr import IOcrProvider


class OcrRouter:
    """Capability router for OCR providers."""

    def __init__(
        self,
        provider: Optional[IOcrProvider] = None,
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
    def provider(self) -> Optional[IOcrProvider]:
        return self._provider

    def set_provider(self, provider: Optional[IOcrProvider]) -> None:
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
    def enabled(self) -> bool:
        provider = self._provider
        return bool(
            provider is not None
            and getattr(provider, "enabled", False)
            and not self._circuit_breaker.is_open
        )

    @enabled.setter
    def enabled(self, value: bool) -> None:
        provider = self._provider
        if provider is not None:
            provider.enabled = value

    @property
    def is_ready(self) -> bool:
        provider = self._provider
        return bool(
            provider is not None
            and provider.is_ready
            and not self._circuit_breaker.is_open
        )

    @property
    def circuit_open(self) -> bool:
        return self._circuit_breaker.is_open

    def unavailable_error_message(self) -> str:
        provider = self._provider
        provider_id = self.provider_id
        try:
            self._circuit_breaker.ensure_closed(
                capability="ocr",
                provider_id=provider_id,
            )
        except ProviderCapabilityError as error:
            return str(error)
        if provider is None:
            return str(
                ProviderUnavailableError(
                    capability="ocr",
                    provider_id=provider_id,
                    message="OCR provider is not configured",
                )
            )
        if not getattr(provider, "enabled", False):
            return str(
                ProviderUnavailableError(
                    capability="ocr",
                    provider_id=provider_id,
                    message="OCR provider is disabled",
                )
            )
        if not getattr(provider, "is_ready", False):
            return str(
                ProviderUnavailableError(
                    capability="ocr",
                    provider_id=provider_id,
                    message="OCR provider is not ready",
                )
            )
        return "OCR provider is unavailable"

    async def initialize(self) -> None:
        provider = self._provider
        if provider is None:
            return
        try:
            await provider.initialize()
            if getattr(provider, "is_ready", False):
                self._circuit_breaker.record_success()
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message=f"OCR provider initialization failed: {error}",
            ) from error

    async def health_check(self) -> bool:
        provider = self._provider
        if provider is None or self._circuit_breaker.is_open:
            return False
        health_check = getattr(provider, "health_check", None)
        try:
            if callable(health_check):
                healthy = bool(await health_check())
            else:
                healthy = bool(getattr(provider, "is_ready", False))
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            return False
        if healthy:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure("OCR health check returned unhealthy")
        return healthy

    async def analyze_image(self, image_base64: str):
        provider = self._provider
        if provider is None:
            raise ProviderUnavailableError(
                capability="ocr",
                provider_id=self.provider_id,
                message="OCR provider is not configured",
            )
        self._circuit_breaker.ensure_closed(
            capability="ocr",
            provider_id=self.provider_id,
        )
        if not getattr(provider, "enabled", False):
            raise ProviderUnavailableError(
                capability="ocr",
                provider_id=self.provider_id,
                message="OCR provider is disabled",
            )
        try:
            result = await provider.analyze_image(image_base64)
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message=f"OCR provider request failed: {error}",
            ) from error
        if result is None:
            error = ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message="OCR provider returned no result",
            )
            self._circuit_breaker.record_failure(error)
            raise error
        self._circuit_breaker.record_success()
        return result

    async def perform_ocr(self, screenshot_b64: str):
        return await self.analyze_image(screenshot_b64)
