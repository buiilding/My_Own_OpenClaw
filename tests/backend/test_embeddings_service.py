from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.src.api.routes.memory.embeddings.service import (
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
    model_name = "fake-embedder"

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
    assert response.dimension == 3
    assert response.embedding == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_resolve_health_payload_uses_live_probe() -> None:
    payload = await resolve_health_payload(
        embedding_provider=FakeEmbedder(),
        healthy_payload_fn=lambda **kwargs: {"status": "healthy", **kwargs},
    )

    assert payload == {
        "status": "healthy",
        "model_name": "fake-embedder",
        "dimension": 3,
    }


def test_raise_embedding_error_raises_http_exception() -> None:
    with pytest.raises(HTTPException) as exc_info:
        raise_embedding_error(
            error=RuntimeError("boom"),
            logger=SimpleNamespace(error=lambda *_args, **_kwargs: None),
            started_at=0.0,
        )

    assert exc_info.value.status_code == 500
