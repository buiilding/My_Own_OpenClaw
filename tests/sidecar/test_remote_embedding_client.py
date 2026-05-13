import numpy as np
import pytest
from tests.sidecar.remote_client_test_utils import (
    DummyResponse,
    DummySession,
    SequentialSession,
    assert_client_initialize_reuses_session_and_close_resets,
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

aiohttp = ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

from core import remote_embedding_client as remote_embedding_client_module  # noqa: E402
from core.remote_embedding_client import (  # noqa: E402
    EmbeddingServiceUnavailableError,
    RemoteEmbeddingClient,
)


@pytest.mark.asyncio
async def test_embed_text_success():
    response = DummyResponse(
        200,
        json_data={
            "embedding": [1.0, 2.0, 3.0],
            "provider_id": "local-sentence-transformer",
            "model_id": "all-MiniLM-L6-v2",
            "model_name": "all-MiniLM-L6-v2",
            "dimension": 3,
            "embedding_space_version": "local-sentence-transformer:all-MiniLM-L6-v2:3",
        },
    )
    client = RemoteEmbeddingClient(backend_url="http://localhost:9999")
    client._session = DummySession(response)

    embedding = await client.embed_text("hello")

    assert isinstance(embedding, np.ndarray)
    assert embedding.tolist() == [1.0, 2.0, 3.0]
    assert client._session.last_post[0] == "http://localhost:9999/api/embeddings/"
    assert client.dimension == 3
    assert client.provider_id == "local-sentence-transformer"
    assert client.model_id == "all-MiniLM-L6-v2"
    assert (
        client.embedding_space_version
        == "local-sentence-transformer:all-MiniLM-L6-v2:3"
    )
    assert client.get_embedding_space_metadata() == {
        "embedding_provider_id": "local-sentence-transformer",
        "embedding_model_id": "all-MiniLM-L6-v2",
        "embedding_dimension": 3,
        "embedding_space_version": "local-sentence-transformer:all-MiniLM-L6-v2:3",
    }


@pytest.mark.asyncio
async def test_embed_text_error_status():
    response = DummyResponse(500, text_data="boom")
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    with pytest.raises(Exception):
        await client.embed_text("hello")


@pytest.mark.asyncio
async def test_embed_text_marks_embedding_service_unavailable():
    response = DummyResponse(
        503,
        text_data='{"detail":"Embedding service not available"}',
    )
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    with pytest.raises(EmbeddingServiceUnavailableError):
        await client.embed_text("hello")

    with pytest.raises(EmbeddingServiceUnavailableError):
        await client.embed_text("hello again")


@pytest.mark.asyncio
async def test_embed_text_wraps_network_client_error():
    client = RemoteEmbeddingClient()
    client._session = DummySession(
        DummyResponse(200, json_data={"embedding": [1.0]}),
        post_error=aiohttp.ClientError("network down"),
    )

    with pytest.raises(Exception, match="Failed to connect to embedding service"):
        await client.embed_text("hello")


@pytest.mark.asyncio
async def test_embed_text_raises_after_hosted_network_error_without_local_fallback(
    monkeypatch,
):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://api.windieos.com")
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    client = RemoteEmbeddingClient()
    client._session = SequentialSession(
        post_results=[aiohttp.ClientError("remote down")],
    )

    with pytest.raises(Exception, match="Failed to connect to embedding service"):
        await client.embed_text("hello")

    assert [call[0] for call in client._session.post_calls] == [
        "https://api.windieos.com/api/embeddings/",
    ]
    assert client.backend_url == "https://api.windieos.com"


@pytest.mark.asyncio
async def test_embed_text_raises_after_retryable_http_status_without_local_fallback(
    monkeypatch,
):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://api.windieos.com")
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    client = RemoteEmbeddingClient()
    client._session = SequentialSession(
        post_results=[DummyResponse(530, text_data="cloudflare tunnel error")],
    )

    with pytest.raises(
        Exception, match="Embedding API returned 530: cloudflare tunnel error"
    ):
        await client.embed_text("hello")

    assert [call[0] for call in client._session.post_calls] == [
        "https://api.windieos.com/api/embeddings/",
    ]
    assert client.backend_url == "https://api.windieos.com"


@pytest.mark.asyncio
async def test_health_check():
    response = DummyResponse(
        200,
        json_data={
            "status": "healthy",
            "provider_id": "local-sentence-transformer",
            "model_id": "all-MiniLM-L6-v2",
            "model_name": "all-MiniLM-L6-v2",
            "dimension": 384,
            "embedding_space_version": "local-sentence-transformer:all-MiniLM-L6-v2:384",
        },
    )
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    assert await client.health_check() is True
    assert client.dimension == 384
    assert client.get_embedding_space_metadata() == {
        "embedding_provider_id": "local-sentence-transformer",
        "embedding_model_id": "all-MiniLM-L6-v2",
        "embedding_dimension": 384,
        "embedding_space_version": "local-sentence-transformer:all-MiniLM-L6-v2:384",
    }


@pytest.mark.asyncio
async def test_health_check_returns_false_for_non_healthy_payload():
    response = DummyResponse(200, json_data={"status": "degraded"})
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    assert await client.health_check() is False


@pytest.mark.asyncio
async def test_health_check_returns_false_for_non_200():
    response = DummyResponse(503, json_data={"status": "healthy"})
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    assert await client.health_check() is False


@pytest.mark.asyncio
async def test_health_check_returns_false_when_request_raises():
    client = RemoteEmbeddingClient()
    client._session = DummySession(
        DummyResponse(200, json_data={"status": "healthy"}),
        get_error=RuntimeError("boom"),
    )

    assert await client.health_check() is False


@pytest.mark.asyncio
async def test_health_check_returns_false_after_hosted_error_without_local_fallback(
    monkeypatch,
):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://api.windieos.com")
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    client = RemoteEmbeddingClient()
    client._session = SequentialSession(
        get_results=[RuntimeError("remote down")],
    )

    assert await client.health_check() is False
    assert [call[0] for call in client._session.get_calls] == [
        "https://api.windieos.com/api/embeddings/health",
    ]
    assert client.backend_url == "https://api.windieos.com"


@pytest.mark.asyncio
async def test_initialize_reuses_session_and_close_resets(monkeypatch):
    await assert_client_initialize_reuses_session_and_close_resets(
        monkeypatch,
        remote_embedding_client_module.aiohttp,
        RemoteEmbeddingClient(),
    )


@pytest.mark.asyncio
async def test_close_is_noop_when_session_not_initialized():
    client = RemoteEmbeddingClient()

    await client.close()

    assert client._session is None


@pytest.mark.asyncio
async def test_embed_text_initializes_session_when_missing_and_normalizes_backend_url(
    monkeypatch,
):
    response = DummyResponse(200, json_data={"embedding": [0.1, 0.2]})
    session = DummySession(response)
    client = RemoteEmbeddingClient(backend_url="http://localhost:9999/")
    init_calls = 0

    async def fake_initialize():
        nonlocal init_calls
        init_calls += 1
        client._session = session

    monkeypatch.setattr(client, "initialize", fake_initialize)

    embedding = await client.embed_text("hello")

    assert init_calls == 1
    assert isinstance(embedding, np.ndarray)
    assert np.allclose(embedding, np.array([0.1, 0.2], dtype=np.float32))
    assert session.last_post[0] == "http://localhost:9999/api/embeddings/"
    assert session.last_post[2].total == 30


@pytest.mark.asyncio
async def test_embed_text_sanitizes_lone_surrogates_in_payload():
    response = DummyResponse(200, json_data={"embedding": [0.5]})
    session = DummySession(response)
    client = RemoteEmbeddingClient()
    client._session = session

    await client.embed_text("broken\udc9dtext")

    assert session.last_post[1]["text"] == "broken�text"


@pytest.mark.asyncio
async def test_embed_text_truncates_payload_to_backend_limit():
    response = DummyResponse(200, json_data={"embedding": [0.25]})
    session = DummySession(response)
    client = RemoteEmbeddingClient()
    client._session = session

    await client.embed_text("a" * 9000)

    assert (
        len(session.last_post[1]["text"])
        == remote_embedding_client_module.EMBEDDING_TEXT_MAX_LENGTH
    )


def test_dimension_property_returns_expected_default():
    client = RemoteEmbeddingClient()

    assert (
        client.dimension == remote_embedding_client_module.DEFAULT_EMBEDDING_DIMENSION
    )
