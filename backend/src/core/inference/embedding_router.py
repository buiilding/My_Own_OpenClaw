"""Embedding router."""

from __future__ import annotations

from typing import Optional

from backend.src.core.inference.circuit_breaker import ProviderCircuitBreaker
from backend.src.core.inference.errors import (
    ProviderCapabilityError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.embeddings.errors import (
    EmbeddingCapacityExceededError,
    EmbeddingProviderRequestError,
)


class EmbeddingRouter:
    """Capability router for embedding providers."""

    def __init__(
        self,
        provider: Optional[EmbeddingProvider] = None,
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
    def provider(self) -> Optional[EmbeddingProvider]:
        return self._provider

    def set_provider(self, provider: Optional[EmbeddingProvider]) -> None:
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
        if provider is None:
            return "unconfigured"
        return getattr(provider, "model_name", provider.model_id)

    @property
    def dimension(self) -> int:
        provider = self._provider
        return provider.dimension if provider is not None else 0

    @property
    def is_ready(self) -> bool:
        return self._provider is not None and not self._circuit_breaker.is_open

    @property
    def circuit_open(self) -> bool:
        return self._circuit_breaker.is_open

    async def initialize(self) -> None:
        provider = self._provider
        if provider is None:
            return
        initialize = getattr(provider, "initialize", None)
        try:
            if callable(initialize):
                await initialize()
            self._circuit_breaker.record_success()
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except (EmbeddingCapacityExceededError, EmbeddingProviderRequestError) as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="embeddings",
                provider_id=self.provider_id,
                message=f"Embedding provider initialization failed: {error}",
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
                healthy = True
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            return False
        if healthy:
            self._circuit_breaker.record_success()
        else:
            self._circuit_breaker.record_failure(
                "Embedding health check returned unhealthy"
            )
        return healthy

    async def embed_text(self, text: str):
        provider = self._require_provider()
        self._circuit_breaker.ensure_closed(
            capability="embeddings",
            provider_id=self.provider_id,
        )
        try:
            result = await provider.embed_text(text)
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except (EmbeddingCapacityExceededError, EmbeddingProviderRequestError) as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="embeddings",
                provider_id=self.provider_id,
                message=f"Embedding provider request failed: {error}",
            ) from error
        self._circuit_breaker.record_success()
        return result

    async def embed_batch(self, texts: list[str]):
        provider = self._require_provider()
        self._circuit_breaker.ensure_closed(
            capability="embeddings",
            provider_id=self.provider_id,
        )
        try:
            result = await provider.embed_batch(texts)
        except ProviderCapabilityError as error:
            self._circuit_breaker.record_failure(error)
            raise
        except (EmbeddingCapacityExceededError, EmbeddingProviderRequestError) as error:
            self._circuit_breaker.record_failure(error)
            raise
        except Exception as error:
            self._circuit_breaker.record_failure(error)
            raise ProviderRequestError(
                capability="embeddings",
                provider_id=self.provider_id,
                message=f"Embedding provider request failed: {error}",
            ) from error
        self._circuit_breaker.record_success()
        return result

    async def recover_from_cuda_runtime_failure(self, error: Exception) -> bool:
        provider = self._provider
        if provider is None:
            return False
        recover = getattr(provider, "recover_from_cuda_runtime_failure", None)
        if not callable(recover):
            return False
        return await recover(error)

    def _require_provider(self) -> EmbeddingProvider:
        if self._provider is None:
            raise ProviderUnavailableError(
                capability="embeddings",
                provider_id=self.provider_id,
                message="Embedding provider is not configured",
            )
        return self._provider
