"""Covers local-runtime hosted-client test utilities."""

import sys
import types
from pathlib import Path


def ensure_aiohttp_with_stubs():
    try:
        import aiohttp  # type: ignore

        return aiohttp
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
        return aiohttp


def ensure_frontend_python_path() -> None:
    local_runtime_python_dir = (
        Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
    )
    local_runtime_python_dir_str = str(local_runtime_python_dir)
    if local_runtime_python_dir_str not in sys.path:
        sys.path.insert(0, local_runtime_python_dir_str)


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
    def __init__(self, response=None, *, post_error=None, get_error=None):
        self.response = response
        self.post_error = post_error
        self.get_error = get_error
        self.last_post = None
        self.last_get = None
        self.close_calls = 0

    def post(self, url, json=None, timeout=None, headers=None, data=None):
        if self.post_error is not None:
            raise self.post_error
        self.last_post = (url, json, timeout, headers, data)
        return self.response

    def get(self, url, timeout=None, headers=None):
        if self.get_error is not None:
            raise self.get_error
        self.last_get = (url, timeout, headers)
        return self.response

    async def close(self):
        self.close_calls += 1
        return None


class SequentialSession:
    def __init__(self, *, post_results=None, get_results=None):
        self.post_results = list(post_results or [])
        self.get_results = list(get_results or [])
        self.post_calls = []
        self.get_calls = []

    def post(self, url, json=None, timeout=None, headers=None, data=None):
        self.post_calls.append((url, json, timeout, headers, data))
        result = self.post_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    def get(self, url, timeout=None, headers=None):
        self.get_calls.append((url, timeout, headers))
        result = self.get_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    async def close(self):
        return None


async def assert_client_initialize_reuses_session_and_close_resets(
    monkeypatch,
    aiohttp_module,
    client,
) -> None:
    created = []

    class FakeClientSession:
        def __init__(self):
            self.closed = False
            created.append(self)

        async def close(self):
            self.closed = True

    monkeypatch.setattr(aiohttp_module, "ClientSession", FakeClientSession)

    await client.initialize()
    first_session = client._session

    await client.initialize()
    assert client._session is first_session
    assert len(created) == 1

    await client.close()
    assert first_session.closed is True
    assert client._session is None
