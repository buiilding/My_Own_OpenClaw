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

from core import remote_title_client as remote_title_client_module  # noqa: E402
from core.remote_title_client import RemoteTitleClient  # noqa: E402


@pytest.mark.asyncio
async def test_generate_title_success_returns_title_and_payload_includes_overrides():
    response = DummyResponse(
        200,
        json_data={"success": True, "title": "Linux mic troubleshooting"},
    )
    session = DummySession(response=response)
    client = RemoteTitleClient(backend_url="http://localhost:9999", timeout_seconds=10)
    client._session = session

    title = await client.generate_title(
        user_id="u-1",
        user_message="how to fix my mic",
        assistant_message="Open settings and verify input source",
        model_id="k2p5",
        model_provider="kimi-coding",
    )

    assert title == "Linux mic troubleshooting"
    url, payload, timeout, headers, data = session.last_post
    assert url == "http://localhost:9999/api/semantic/title"
    assert headers == {}
    assert data is None
    assert payload == {
        "user_id": "u-1",
        "user_message": "how to fix my mic",
        "assistant_message": "Open settings and verify input source",
        "model_id": "k2p5",
        "model_provider": "kimi-coding",
    }
    assert timeout.total == 10


@pytest.mark.asyncio
async def test_generate_title_omits_empty_overrides_and_normalizes_blank_title():
    response = DummyResponse(
        200,
        json_data={"success": True, "title": None},
    )
    session = DummySession(response=response)
    client = RemoteTitleClient(backend_url="http://localhost:9999/")
    client._session = session

    title = await client.generate_title(
        user_id="u-2",
        user_message="hello",
        assistant_message="hi",
        model_id="  ",
        model_provider="",
    )

    assert title == ""
    url, payload, _timeout, headers, data = session.last_post
    assert url == "http://localhost:9999/api/semantic/title"
    assert headers == {}
    assert data is None
    assert payload == {
        "user_id": "u-2",
        "user_message": "hello",
        "assistant_message": "hi",
    }


@pytest.mark.asyncio
async def test_generate_title_non_200_raises_error_with_status_text():
    client = RemoteTitleClient()
    client._session = DummySession(response=DummyResponse(503, text_data="backend down"))

    with pytest.raises(Exception, match="Title API returned 503: backend down"):
        await client.generate_title(
            user_id="u-3",
            user_message="a",
            assistant_message="b",
        )


@pytest.mark.asyncio
async def test_generate_title_raises_when_api_reports_success_false():
    client = RemoteTitleClient()
    client._session = DummySession(response=DummyResponse(200, json_data={"success": False}))

    with pytest.raises(Exception, match="Title API returned success=false"):
        await client.generate_title(
            user_id="u-4",
            user_message="a",
            assistant_message="b",
        )


@pytest.mark.asyncio
async def test_generate_title_wraps_network_client_error():
    network_error = aiohttp.ClientError("no route")
    client = RemoteTitleClient()
    client._session = DummySession(post_error=network_error)

    with pytest.raises(Exception, match="Failed to connect to title service"):
        await client.generate_title(
            user_id="u-5",
            user_message="a",
            assistant_message="b",
        )


@pytest.mark.asyncio
async def test_generate_title_raises_after_retryable_http_status_without_local_fallback(monkeypatch):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://api.windieos.com")
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    client = RemoteTitleClient()
    client._session = SequentialSession(
        post_results=[DummyResponse(530, text_data="cloudflare tunnel error")],
    )

    with pytest.raises(Exception, match="Title API returned 530: cloudflare tunnel error"):
        await client.generate_title(
            user_id="u-fallback",
            user_message="a",
            assistant_message="b",
        )

    assert [call[0] for call in client._session.post_calls] == [
        "https://api.windieos.com/api/semantic/title",
    ]
    assert client.backend_url == "https://api.windieos.com"


@pytest.mark.asyncio
async def test_initialize_creates_single_session_and_close_resets(monkeypatch):
    await assert_client_initialize_reuses_session_and_close_resets(
        monkeypatch,
        remote_title_client_module.aiohttp,
        RemoteTitleClient(),
    )


@pytest.mark.asyncio
async def test_generate_title_sanitizes_lone_surrogates_in_payload():
    response = DummyResponse(
        200,
        json_data={"success": True, "title": "ok"},
    )
    session = DummySession(response=response)
    client = RemoteTitleClient()
    client._session = session

    await client.generate_title(
        user_id="u-6",
        user_message="hello\udc9duser",
        assistant_message="hello\udc9dassistant",
    )

    _url, payload, _timeout, headers, data = session.last_post
    assert headers == {}
    assert data is None
    assert payload["user_message"] == "hello�user"
    assert payload["assistant_message"] == "hello�assistant"
