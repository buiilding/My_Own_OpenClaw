import numpy as np
import pytest

from tests.sidecar.remote_client_test_utils import (
    DummyResponse,
    DummySession,
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

aiohttp = ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

from core import remote_embedding_client as remote_embedding_client_module  # noqa: E402
from core.remote_embedding_client import RemoteEmbeddingClient  # noqa: E402


@pytest.mark.asyncio
async def test_embed_text_success():
    response = DummyResponse(200, json_data={"embedding": [1.0, 2.0, 3.0]})
    client = RemoteEmbeddingClient(backend_url="http://localhost:9999")
    client._session = DummySession(response)

    embedding = await client.embed_text("hello")

    assert isinstance(embedding, np.ndarray)
    assert embedding.tolist() == [1.0, 2.0, 3.0]
    assert client._session.last_post[0] == "http://localhost:9999/api/embeddings/"


@pytest.mark.asyncio
async def test_embed_text_error_status():
    response = DummyResponse(500, text_data="boom")
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    with pytest.raises(Exception):
        await client.embed_text("hello")


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
async def test_health_check():
    response = DummyResponse(200, json_data={"status": "healthy"})
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    assert await client.health_check() is True


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
async def test_initialize_reuses_session_and_close_resets(monkeypatch):
    created = []

    class FakeClientSession:
        def __init__(self):
            self.closed = False
            created.append(self)

        async def close(self):
            self.closed = True

    monkeypatch.setattr(remote_embedding_client_module.aiohttp, "ClientSession", FakeClientSession)

    client = RemoteEmbeddingClient()
    await client.initialize()
    first_session = client._session

    await client.initialize()
    assert client._session is first_session
    assert len(created) == 1

    await client.close()
    assert first_session.closed is True
    assert client._session is None


@pytest.mark.asyncio
async def test_close_is_noop_when_session_not_initialized():
    client = RemoteEmbeddingClient()

    await client.close()

    assert client._session is None


@pytest.mark.asyncio
async def test_embed_text_initializes_session_when_missing_and_normalizes_backend_url(monkeypatch):
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


def test_dimension_property_returns_expected_default():
    client = RemoteEmbeddingClient()

    assert client.dimension == 384
