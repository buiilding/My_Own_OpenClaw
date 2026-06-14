"""Covers remote embedding provider behavior in the backend test suite."""

from __future__ import annotations

import asyncio
import json

import httpx
import numpy as np
import pytest

from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.embeddings.errors import (
    EmbeddingCapacityExceededError,
    EmbeddingProviderRequestError,
)
from backend.src.embeddings.limited_provider import CapacityLimitedEmbeddingProvider
from backend.src.embeddings.remote_provider import RemoteHttpEmbeddingProvider


def _build_transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_remote_provider_propagates_metadata_from_service_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/embed"
        assert request.method == "POST"
        assert json.loads(request.content.decode("utf-8")) == {
            "texts": ["hello", "world"],
        }
        return httpx.Response(
            200,
            json={
                "embeddings": [[1.0, 2.0], [3.0, 4.0]],
                "provider_id": "embedding-service",
                "model_id": "sentence-transformers/all-MiniLM-L6-v2",
                "dimension": 2,
                "embedding_space_version": "embedding-service:sentence-transformers/all-MiniLM-L6-v2:2",
            },
        )

    client = httpx.AsyncClient(
        base_url="http://embeddings.internal",
        transport=_build_transport(handler),
    )
    provider = RemoteHttpEmbeddingProvider(
        service_url="http://embeddings.internal",
        model_id="configured-model",
        http_client=client,
    )

    embeddings = await provider.embed_batch(["hello", "world"])

    assert len(embeddings) == 2
    assert embeddings[0].tolist() == [1.0, 2.0]
    assert embeddings[1].tolist() == [3.0, 4.0]
    assert provider.provider_id == "embedding-service"
    assert provider.model_id == "sentence-transformers/all-MiniLM-L6-v2"
    assert provider.dimension == 2
    assert (
        provider.embedding_space_version
        == "embedding-service:sentence-transformers/all-MiniLM-L6-v2:2"
    )

    await provider.close()


@pytest.mark.asyncio
async def test_remote_provider_sends_embedding_service_api_key() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-windie-embedding-key"] == "service-secret"
        return httpx.Response(
            200,
            json={
                "embeddings": [[1.0, 2.0]],
                "provider_id": "embedding-service",
                "model_id": "remote-model",
                "dimension": 2,
            },
        )

    provider = RemoteHttpEmbeddingProvider(
        service_url="http://embeddings.internal",
        api_key="service-secret",
        http_client=httpx.AsyncClient(
            base_url="http://embeddings.internal",
            transport=_build_transport(handler),
        ),
    )

    embeddings = await provider.embed_batch(["hello"])

    assert embeddings[0].tolist() == [1.0, 2.0]
    await provider.close()


@pytest.mark.asyncio
async def test_remote_provider_maps_capacity_response_to_capacity_error() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "embedding workers saturated"})

    provider = RemoteHttpEmbeddingProvider(
        service_url="http://embeddings.internal",
        http_client=httpx.AsyncClient(
            base_url="http://embeddings.internal",
            transport=_build_transport(handler),
        ),
    )

    with pytest.raises(EmbeddingCapacityExceededError, match="saturated"):
        await provider.embed_batch(["hello"])

    await provider.close()


@pytest.mark.asyncio
async def test_remote_provider_health_check_updates_metadata() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/health"
        return httpx.Response(
            200,
            json={
                "status": "healthy",
                "provider_id": "embedding-service",
                "model_id": "sentence-transformers/all-MiniLM-L6-v2",
                "dimension": 384,
                "embedding_space_version": "embedding-service:sentence-transformers/all-MiniLM-L6-v2:384",
            },
        )

    provider = RemoteHttpEmbeddingProvider(
        service_url="http://embeddings.internal",
        http_client=httpx.AsyncClient(
            base_url="http://embeddings.internal",
            transport=_build_transport(handler),
        ),
    )

    assert await provider.health_check() is True
    assert provider.provider_id == "embedding-service"
    assert provider.model_id == "sentence-transformers/all-MiniLM-L6-v2"
    assert provider.dimension == 384

    await provider.close()


@pytest.mark.asyncio
async def test_remote_provider_rejects_invalid_response_body() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"embeddings": []})

    provider = RemoteHttpEmbeddingProvider(
        service_url="http://embeddings.internal",
        http_client=httpx.AsyncClient(
            base_url="http://embeddings.internal",
            transport=_build_transport(handler),
        ),
    )

    with pytest.raises(EmbeddingProviderRequestError, match="no embeddings"):
        await provider.embed_batch(["hello"])

    await provider.close()


@pytest.mark.asyncio
async def test_remote_provider_rejects_embedding_count_mismatch() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"embeddings": [[1.0, 2.0]]})

    provider = RemoteHttpEmbeddingProvider(
        service_url="http://embeddings.internal",
        http_client=httpx.AsyncClient(
            base_url="http://embeddings.internal",
            transport=_build_transport(handler),
        ),
    )

    with pytest.raises(EmbeddingProviderRequestError) as exc_info:
        await provider.embed_batch(["hello", "world"])

    assert exc_info.value.status_code == 502
    assert "one vector per input" in exc_info.value.detail

    await provider.close()


class _BlockingProvider(EmbeddingProvider):
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    @property
    def model_id(self) -> str:
        return "blocking-model"

    @property
    def dimension(self) -> int:
        return 2

    async def embed_text(self, text: str) -> np.ndarray:
        batch = await self.embed_batch([text])
        return batch[0]

    async def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        self.started.set()
        await self.release.wait()
        return [np.asarray([float(len(texts)), 1.0], dtype=np.float32)]


@pytest.mark.asyncio
async def test_capacity_limited_provider_rejects_when_queue_timeout_expires() -> None:
    blocking_provider = _BlockingProvider()
    provider = CapacityLimitedEmbeddingProvider(
        blocking_provider,
        max_concurrent_requests=1,
        queue_timeout_seconds=0.01,
        label="test-provider",
    )

    first_request = asyncio.create_task(provider.embed_text("first"))
    await blocking_provider.started.wait()

    with pytest.raises(EmbeddingCapacityExceededError, match="timed out waiting"):
        await provider.embed_text("second")

    blocking_provider.release.set()
    assert (await first_request).tolist() == [1.0, 1.0]
