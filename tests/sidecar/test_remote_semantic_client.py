import pytest

from tests.sidecar.remote_client_test_utils import (
    DummyResponse,
    DummySession,
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

aiohttp = ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

from core import remote_semantic_client as remote_semantic_client_module  # noqa: E402
from core.remote_semantic_client import RemoteSemanticClient  # noqa: E402


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


@pytest.mark.asyncio
async def test_summarize_initializes_session_when_missing_and_normalizes_backend_url(monkeypatch):
    response = DummyResponse(
        200,
        json_data={"success": True, "summary": "init ok", "facts": []},
    )
    session = DummySession(response=response)
    client = RemoteSemanticClient(backend_url="http://localhost:9999/", timeout_seconds=8)
    init_calls = 0

    async def fake_initialize():
        nonlocal init_calls
        init_calls += 1
        client._session = session

    monkeypatch.setattr(client, "initialize", fake_initialize)

    summary, facts = await client.summarize(["hello"], user_id="u-init")

    assert init_calls == 1
    assert summary == "init ok"
    assert facts == []
    assert session.last_post[0] == "http://localhost:9999/api/semantic/summarize"
    assert session.last_post[2].total == 8
