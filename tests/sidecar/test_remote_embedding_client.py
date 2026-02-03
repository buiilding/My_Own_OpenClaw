import sys
import types
from pathlib import Path

import numpy as np
import pytest


try:
    import aiohttp  # type: ignore
except Exception:
    aiohttp = types.SimpleNamespace()

    class ClientTimeout:
        def __init__(self, total=None):
            self.total = total

    class ClientError(Exception):
        pass

    class ClientSession:
        async def close(self):
            return None

    aiohttp.ClientTimeout = ClientTimeout
    aiohttp.ClientError = ClientError
    aiohttp.ClientSession = ClientSession
    sys.modules["aiohttp"] = aiohttp

frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from core.remote_embedding_client import RemoteEmbeddingClient  # noqa: E402


class DummyResponse:
    def __init__(self, status, json_data=None, text_data=""):
        self.status = status
        self._json = json_data or {}
        self._text = text_data

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def json(self):
        return self._json

    async def text(self):
        return self._text


class DummySession:
    def __init__(self, response):
        self.response = response
        self.last_post = None
        self.last_get = None

    def post(self, url, json=None, timeout=None):
        self.last_post = (url, json, timeout)
        return self.response

    def get(self, url, timeout=None):
        self.last_get = (url, timeout)
        return self.response

    async def close(self):
        return None


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
async def test_health_check():
    response = DummyResponse(200, json_data={"status": "healthy"})
    client = RemoteEmbeddingClient()
    client._session = DummySession(response)

    assert await client.health_check() is True
