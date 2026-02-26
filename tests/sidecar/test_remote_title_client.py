import pytest

from tests.sidecar.remote_client_test_utils import (
    DummyResponse,
    DummySession,
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
    url, payload, timeout = session.last_post
    assert url == "http://localhost:9999/api/semantic/title"
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
    url, payload, _timeout = session.last_post
    assert url == "http://localhost:9999/api/semantic/title"
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
async def test_initialize_creates_single_session_and_close_resets(monkeypatch):
    await assert_client_initialize_reuses_session_and_close_resets(
        monkeypatch,
        remote_title_client_module.aiohttp,
        RemoteTitleClient(),
    )
