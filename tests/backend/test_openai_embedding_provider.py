from types import SimpleNamespace

import pytest

from backend.src.embeddings.errors import EmbeddingProviderRequestError
from backend.src.embeddings.openai_provider import OpenAIEmbeddingProvider


class _FakeEmbeddingsApi:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.response


class _FakeOpenAIClient:
    def __init__(self, response=None, error=None):
        self.embeddings = _FakeEmbeddingsApi(response=response, error=error)


@pytest.mark.asyncio
async def test_openai_embedding_provider_returns_vectors_and_metadata() -> None:
    client = _FakeOpenAIClient(
        response=SimpleNamespace(
            data=[
                SimpleNamespace(embedding=[1.0, 2.0, 3.0]),
                SimpleNamespace(embedding=[4.0, 5.0, 6.0]),
            ]
        )
    )
    provider = OpenAIEmbeddingProvider(
        api_key="test-key",
        model_id="text-embedding-3-small",
        client=client,
    )

    vectors = await provider.embed_batch(["hello", "world"])

    assert [vector.tolist() for vector in vectors] == [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
    ]
    assert client.embeddings.calls == [
        {"model": "text-embedding-3-small", "input": ["hello", "world"]}
    ]
    assert provider.provider_id == "openai"
    assert provider.model_id == "text-embedding-3-small"
    assert provider.dimension == 3
    assert provider.embedding_space_version == "openai:text-embedding-3-small:3"


@pytest.mark.asyncio
async def test_openai_embedding_provider_maps_request_errors() -> None:
    provider = OpenAIEmbeddingProvider(
        api_key="test-key",
        client=_FakeOpenAIClient(error=RuntimeError("api down")),
    )

    with pytest.raises(EmbeddingProviderRequestError, match="api down"):
        await provider.embed_text("hello")
