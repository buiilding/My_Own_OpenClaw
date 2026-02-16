import sys
import types
from pathlib import Path

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

from core import remote_semantic_client as remote_semantic_client_module  # noqa: E402
from core.remote_semantic_client import RemoteSemanticClient  # noqa: E402


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
    def __init__(self, response=None, post_error=None):
        self.response = response
        self.post_error = post_error
        self.last_post = None
        self.close_calls = 0

    def post(self, url, json=None, timeout=None):
        if self.post_error is not None:
            raise self.post_error
        self.last_post = (url, json, timeout)
        return self.response

    async def close(self):
        self.close_calls += 1


@pytest.mark.asyncio
async def test_summarize_success_returns_summary_and_facts():
    response = DummyResponse(
        200,
        json_data={"success": True, "summary": "A summary", "facts": ["fact-1", "fact-2"]},
    )
    session = DummySession(response=response)
    client = RemoteSemanticClient(backend_url="http://localhost:9999", timeout_seconds=12)
    client._session = session

    summary, facts = await client.summarize(["hello"], user_id="u-1")

    assert summary == "A summary"
    assert facts == ["fact-1", "fact-2"]
    url, payload, timeout = session.last_post
    assert url == "http://localhost:9999/api/semantic/summarize"
    assert payload == {"conversations": ["hello"], "user_id": "u-1"}
    assert timeout.total == 12


@pytest.mark.asyncio
async def test_summarize_normalizes_missing_summary_and_facts_to_defaults():
    response = DummyResponse(
        200,
        json_data={"success": True, "summary": None, "facts": None},
    )
    client = RemoteSemanticClient()
    client._session = DummySession(response=response)

    summary, facts = await client.summarize(["hello"], user_id="u-defaults")

    assert summary == ""
    assert facts == []


@pytest.mark.asyncio
async def test_summarize_non_200_raises_error_with_status_text():
    client = RemoteSemanticClient()
    client._session = DummySession(response=DummyResponse(503, text_data="backend down"))

    with pytest.raises(Exception, match="Semantic API returned 503: backend down"):
        await client.summarize(["chunk"], user_id="u-2")


@pytest.mark.asyncio
async def test_summarize_raises_when_api_reports_success_false():
    client = RemoteSemanticClient()
    client._session = DummySession(response=DummyResponse(200, json_data={"success": False}))

    with pytest.raises(Exception, match="Semantic API returned success=false"):
        await client.summarize(["chunk"], user_id="u-3")


@pytest.mark.asyncio
async def test_summarize_wraps_network_client_error():
    network_error = aiohttp.ClientError("no route")
    client = RemoteSemanticClient()
    client._session = DummySession(post_error=network_error)

    with pytest.raises(Exception, match="Failed to connect to semantic service"):
        await client.summarize(["chunk"], user_id="u-4")


@pytest.mark.asyncio
async def test_initialize_creates_single_session_and_close_resets():
    created = []

    class FakeClientSession:
        def __init__(self):
            created.append(self)
            self.closed = False

        async def close(self):
            self.closed = True

    monkeypatch = pytest.MonkeyPatch()
    try:
        monkeypatch.setattr(remote_semantic_client_module.aiohttp, "ClientSession", FakeClientSession)

        client = RemoteSemanticClient()
        await client.initialize()
        first_session = client._session

        await client.initialize()
        assert client._session is first_session
        assert len(created) == 1

        await client.close()
        assert first_session.closed is True
        assert client._session is None
    finally:
        monkeypatch.undo()


@pytest.mark.asyncio
async def test_close_is_noop_when_session_not_initialized():
    client = RemoteSemanticClient()

    await client.close()

    assert client._session is None
