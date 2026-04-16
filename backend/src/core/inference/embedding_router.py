"""Embedding router."""

from __future__ import annotations

from typing import Optional

from backend.src.core.interfaces.embedding import EmbeddingProvider


class EmbeddingRouter:
    """Capability router for embedding providers."""

    def __init__(self, provider: Optional[EmbeddingProvider] = None) -> None:
        self._provider = provider

    @property
    def provider(self) -> Optional[EmbeddingProvider]:
        return self._provider

    def set_provider(self, provider: Optional[EmbeddingProvider]) -> None:
        self._provider = provider

    @property
    def provider_id(self) -> str:
        provider = self._require_provider()
        return provider.provider_id

    @property
    def model_id(self) -> str:
        provider = self._require_provider()
        return provider.model_id

    @property
    def model_name(self) -> str:
        provider = self._require_provider()
        return getattr(provider, "model_name", provider.model_id)

    @property
    def dimension(self) -> int:
        return self._require_provider().dimension

    async def initialize(self) -> None:
        provider = self._provider
        if provider is None:
            return
        initialize = getattr(provider, "initialize", None)
        if callable(initialize):
            await initialize()

    async def embed_text(self, text: str):
        return await self._require_provider().embed_text(text)

    async def embed_batch(self, texts: list[str]):
        return await self._require_provider().embed_batch(texts)

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
            raise RuntimeError("Embedding provider not configured")
        return self._provider
