"""Concurrency-limited embedding provider wrapper."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator, List

import numpy as np

from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.embeddings.errors import EmbeddingCapacityExceededError

logger = logging.getLogger(__name__)


class _EmbeddingCapacityGate:
    def __init__(
        self,
        *,
        max_concurrent_requests: int,
        queue_timeout_seconds: float,
    ) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent_requests)
        self._queue_timeout_seconds = queue_timeout_seconds

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[float]:
        queue_started_at = time.perf_counter()
        try:
            await asyncio.wait_for(
                self._semaphore.acquire(),
                timeout=self._queue_timeout_seconds,
            )
        except asyncio.TimeoutError as error:
            raise EmbeddingCapacityExceededError(
                "Embedding capacity exceeded; timed out waiting for an available worker"
            ) from error

        queue_wait_seconds = time.perf_counter() - queue_started_at
        try:
            yield queue_wait_seconds
        finally:
            self._semaphore.release()


class CapacityLimitedEmbeddingProvider(EmbeddingProvider):
    """Wrap an embedding provider with bounded in-flight concurrency."""

    def __init__(
        self,
        provider: EmbeddingProvider,
        *,
        max_concurrent_requests: int,
        queue_timeout_seconds: float,
        label: str = "embedding-provider",
    ) -> None:
        self._provider = provider
        self._gate = _EmbeddingCapacityGate(
            max_concurrent_requests=max_concurrent_requests,
            queue_timeout_seconds=queue_timeout_seconds,
        )
        self._label = label

    @property
    def provider(self) -> EmbeddingProvider:
        return self._provider

    @property
    def provider_id(self) -> str:
        return self._provider.provider_id

    @property
    def model_id(self) -> str:
        return self._provider.model_id

    @property
    def model_name(self) -> str:
        return getattr(self._provider, "model_name", self._provider.model_id)

    @property
    def dimension(self) -> int:
        return self._provider.dimension

    async def initialize(self) -> None:
        initialize = getattr(self._provider, "initialize", None)
        if callable(initialize):
            await initialize()

    async def close(self) -> None:
        close = getattr(self._provider, "close", None)
        if callable(close):
            await close()

    async def embed_text(self, text: str) -> np.ndarray:
        async with self._gate.acquire() as queue_wait_seconds:
            if queue_wait_seconds > 0.05:
                logger.info(
                    "Embedding request waited %.3fs for capacity (%s)",
                    queue_wait_seconds,
                    self._label,
                )
            return await self._provider.embed_text(text)

    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        async with self._gate.acquire() as queue_wait_seconds:
            if queue_wait_seconds > 0.05:
                logger.info(
                    "Embedding batch waited %.3fs for capacity (%s size=%s)",
                    queue_wait_seconds,
                    self._label,
                    len(texts),
                )
            return await self._provider.embed_batch(texts)

    async def recover_from_cuda_runtime_failure(self, error: Exception) -> bool:
        recover = getattr(self._provider, "recover_from_cuda_runtime_failure", None)
        if not callable(recover):
            return False
        return await recover(error)
