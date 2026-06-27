"""Covers local-runtime hosted API client base behavior."""

import pytest

from tests.sidecar.remote_client_test_utils import (
    DummyResponse,
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

aiohttp = ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

from windie._remote_api_client_base import RemoteApiClientBase  # noqa: E402


def _source_for(obj) -> str:
    module = __import__(obj.__module__, fromlist=["__file__"])
    return open(module.__file__, encoding="utf-8").read()


class SequentialSession:
    def __init__(self, *, post_results=None):
        self.post_results = list(post_results or [])
        self.post_calls = []

    def post(self, url, json=None, timeout=None, headers=None, data=None):
        self.post_calls.append((url, json, timeout, headers, data))
        result = self.post_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    async def close(self):
        return None


class DemoClient(RemoteApiClientBase):
    async def send_demo(self, payload):
        return await self._post_success_json(
            path="/api/demo",
            payload=payload,
            api_label="Demo",
            network_service_label="demo",
            request_error_label="demo request",
        )


def test_remote_api_client_requires_backend_url(monkeypatch):
    monkeypatch.delenv("AGENT_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)

    with pytest.raises(
        RuntimeError,
        match=(
            "Agent SDK backend URL is required. Pass backend_url or set "
            "AGENT_BACKEND_HTTP_URL"
        ),
    ):
        DemoClient()


def test_remote_api_client_source_uses_sdk_hosted_wording():
    source = _source_for(RemoteApiClientBase)
    retired_client_label = "backend-backed " + "sidecar HTTP clients"

    assert "Python SDK hosted HTTP clients" in source
    assert retired_client_label not in source


@pytest.mark.asyncio
async def test_post_success_json_uses_primary_backend():
    client = DemoClient(backend_url="http://localhost:9999")
    client._session = SequentialSession(
        post_results=[DummyResponse(200, json_data={"success": True, "value": 1})],
    )

    result = await client.send_demo({"ok": True})

    assert result == {"success": True, "value": 1}
    assert client._session.post_calls[0][0] == "http://localhost:9999/api/demo"


@pytest.mark.asyncio
async def test_post_success_json_raises_after_hosted_network_error_without_local_fallback(monkeypatch):
    monkeypatch.setenv("AGENT_BACKEND_HTTP_URL", "https://backend.example.com")
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    client = DemoClient()
    client._session = SequentialSession(
        post_results=[aiohttp.ClientError("remote down")],
    )

    with pytest.raises(Exception, match="Failed to connect to demo service"):
        await client.send_demo({"ok": True})

    assert [call[0] for call in client._session.post_calls] == [
        "https://backend.example.com/api/demo",
    ]
    assert client.backend_url == "https://backend.example.com"
