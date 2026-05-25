from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.src.api.routes.memory.embeddings.service import (
    embed_text_with_runtime_recovery,
    embedding_to_list,
    generate_embedding_response,
    raise_embedding_error,
    resolve_health_payload,
)


class FakeArray:
    def __init__(self, values):
        self._values = values

    def tolist(self):
        return list(self._values)


class FakeEmbedder:
    provider_id = "fake-provider"
    model_id = "fake-embedder-v1"
    model_name = "fake-embedder"
    dimension = 3

    async def embed_text(self, _text: str):
        return FakeArray([0.1, 0.2, 0.3])


class RecoveringCudaEmbedder:
    provider_id = "recovering-provider"
    model_id = "recovering-cuda-embedder-v1"
    model_name = "recovering-cuda-embedder"
    dimension = 3

    def __init__(self) -> None:
        self.embed_calls = 0
        self.recover_calls = 0

    async def embed_text(self, _text: str):
        self.embed_calls += 1
        if self.embed_calls == 1:
            raise RuntimeError("CUDA error: CUBLAS_STATUS_ALLOC_FAILED")
        return FakeArray([0.4, 0.5, 0.6])

    async def recover_from_cuda_runtime_failure(self, error: Exception) -> bool:
        self.recover_calls += 1
        assert "CUBLAS_STATUS_ALLOC_FAILED" in str(error)
        return True


class StaleDimensionEmbedder:
    provider_id = "stale-provider"
    model_id = "stale-embedder-v1"
    model_name = "stale-embedder"
    dimension = 999

    async def embed_text(self, _text: str):
        return FakeArray([0.1, 0.2, 0.3])


def test_embedding_to_list_handles_tolist_and_iterable() -> None:
    assert embedding_to_list(FakeArray([1, 2])) == [1, 2]
    assert embedding_to_list((3, 4)) == [3, 4]


@pytest.mark.asyncio
async def test_generate_embedding_response_builds_contract() -> None:
    response = await generate_embedding_response(
        request_text="hello",
        request_model_name="default",
        embedding_provider=FakeEmbedder(),
        logger=SimpleNamespace(info=lambda *_args, **_kwargs: None),
    )

    assert response.model_name == "fake-embedder"
    assert response.provider_id == "fake-provider"
    assert response.model_id == "fake-embedder-v1"
    assert response.dimension == 3
    assert response.embedding == [0.1, 0.2, 0.3]
    assert response.embedding_space_version == "fake-provider:fake-embedder-v1:3"


@pytest.mark.asyncio
async def test_generate_embedding_response_space_version_uses_returned_dimension() -> (
    None
):
    response = await generate_embedding_response(
        request_text="hello",
        request_model_name="default",
        embedding_provider=StaleDimensionEmbedder(),
        logger=SimpleNamespace(info=lambda *_args, **_kwargs: None),
    )

    assert response.dimension == 3
    assert response.embedding_space_version == "stale-provider:stale-embedder-v1:3"


@pytest.mark.asyncio
async def test_embed_text_with_runtime_recovery_retries_after_cuda_failure() -> None:
    embedder = RecoveringCudaEmbedder()
    warnings: list[str] = []

    embedding = await embed_text_with_runtime_recovery(
        text="hello",
        embedding_provider=embedder,
        logger=SimpleNamespace(
            warning=lambda message, *_args, **_kwargs: warnings.append(message)
        ),
    )

    assert embedding_to_list(embedding) == [0.4, 0.5, 0.6]
    assert embedder.embed_calls == 2
    assert embedder.recover_calls == 1
    assert warnings == [
        "Embedding provider hit a CUDA runtime failure. Retrying embedding on CPU fallback."
    ]


@pytest.mark.asyncio
async def test_generate_embedding_response_recovers_from_cuda_failure() -> None:
    response = await generate_embedding_response(
        request_text="hello",
        request_model_name="default",
        embedding_provider=RecoveringCudaEmbedder(),
        logger=SimpleNamespace(
            info=lambda *_args, **_kwargs: None,
            warning=lambda *_args, **_kwargs: None,
        ),
    )

    assert response.model_name == "recovering-cuda-embedder"
    assert response.provider_id == "recovering-provider"
    assert response.model_id == "recovering-cuda-embedder-v1"
    assert response.dimension == 3
    assert response.embedding == [0.4, 0.5, 0.6]
    assert (
        response.embedding_space_version
        == "recovering-provider:recovering-cuda-embedder-v1:3"
    )


@pytest.mark.asyncio
async def test_resolve_health_payload_uses_live_probe() -> None:
    payload = await resolve_health_payload(
        embedding_provider=FakeEmbedder(),
        healthy_payload_fn=lambda **kwargs: {"status": "healthy", **kwargs},
    )

    assert payload == {
        "status": "healthy",
        "provider_id": "fake-provider",
        "model_id": "fake-embedder-v1",
        "model_name": "fake-embedder",
        "dimension": 3,
        "embedding_space_version": "fake-provider:fake-embedder-v1:3",
    }


@pytest.mark.asyncio
async def test_resolve_health_payload_space_version_uses_probe_dimension() -> None:
    payload = await resolve_health_payload(
        embedding_provider=StaleDimensionEmbedder(),
        healthy_payload_fn=lambda **kwargs: {"status": "healthy", **kwargs},
    )

    assert payload["dimension"] == 3
    assert payload["embedding_space_version"] == "stale-provider:stale-embedder-v1:3"


@pytest.mark.asyncio
async def test_resolve_health_payload_recovers_from_cuda_failure() -> None:
    payload = await resolve_health_payload(
        embedding_provider=RecoveringCudaEmbedder(),
        healthy_payload_fn=lambda **kwargs: {"status": "healthy", **kwargs},
    )

    assert payload == {
        "status": "healthy",
        "provider_id": "recovering-provider",
        "model_id": "recovering-cuda-embedder-v1",
        "model_name": "recovering-cuda-embedder",
        "dimension": 3,
        "embedding_space_version": "recovering-provider:recovering-cuda-embedder-v1:3",
    }


def test_raise_embedding_error_raises_http_exception() -> None:
    with pytest.raises(HTTPException) as exc_info:
        raise_embedding_error(
            error=RuntimeError("boom"),
            logger=SimpleNamespace(error=lambda *_args, **_kwargs: None),
            started_at=0.0,
        )

    assert exc_info.value.status_code == 500
