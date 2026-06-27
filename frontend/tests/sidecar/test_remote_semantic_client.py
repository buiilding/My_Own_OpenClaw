"""Covers local-runtime remote semantic client behavior."""

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
    url, payload, timeout, headers, data = session.last_post
    assert url == "http://localhost:9999/api/semantic/summarize"
    assert headers == {}
    assert data is None
    assert payload == {"conversations": ["hello"], "user_id": "u-1"}
    assert timeout.total == 12


@pytest.mark.asyncio
async def test_summarize_normalizes_missing_summary_and_facts_to_defaults():
    response = DummyResponse(
        200,
        json_data={"success": True, "summary": None, "facts": None},
    )
    client = RemoteSemanticClient(backend_url="http://localhost:9999")
    client._session = DummySession(response=response)

    summary, facts = await client.summarize(["hello"], user_id="u-defaults")

    assert summary == ""
    assert facts == []


@pytest.mark.asyncio
async def test_summarize_non_200_raises_error_with_status_text():
    client = RemoteSemanticClient(backend_url="http://localhost:9999")
    client._session = DummySession(response=DummyResponse(503, text_data="backend down"))

    with pytest.raises(Exception, match="Semantic API returned 503: backend down"):
        await client.summarize(["chunk"], user_id="u-2")


@pytest.mark.asyncio
async def test_summarize_raises_when_api_reports_success_false():
    client = RemoteSemanticClient(backend_url="http://localhost:9999")
    client._session = DummySession(response=DummyResponse(200, json_data={"success": False}))

    with pytest.raises(Exception, match="Semantic API returned success=false"):
        await client.summarize(["chunk"], user_id="u-3")


@pytest.mark.asyncio
async def test_summarize_wraps_network_client_error():
    network_error = aiohttp.ClientError("no route")
    client = RemoteSemanticClient(backend_url="http://localhost:9999")
    client._session = DummySession(post_error=network_error)

    with pytest.raises(Exception, match="Failed to connect to semantic service"):
        await client.summarize(["chunk"], user_id="u-4")


@pytest.mark.asyncio
async def test_summarize_raises_after_retryable_http_status_without_local_fallback(monkeypatch):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://backend.example.com")
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    client = RemoteSemanticClient()
    client._session = SequentialSession(
        post_results=[DummyResponse(530, text_data="cloudflare tunnel error")],
    )

    with pytest.raises(Exception, match="Semantic API returned 530: cloudflare tunnel error"):
        await client.summarize(["chunk"], user_id="u-fallback")

    assert [call[0] for call in client._session.post_calls] == [
        "https://backend.example.com/api/semantic/summarize",
    ]
    assert client.backend_url == "https://backend.example.com"


@pytest.mark.asyncio
async def test_initialize_creates_single_session_and_close_resets(monkeypatch):
    await assert_client_initialize_reuses_session_and_close_resets(
        monkeypatch,
        remote_semantic_client_module.aiohttp,
        RemoteSemanticClient(backend_url="http://localhost:9999"),
    )


@pytest.mark.asyncio
async def test_close_is_noop_when_session_not_initialized():
    client = RemoteSemanticClient(backend_url="http://localhost:9999")

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
