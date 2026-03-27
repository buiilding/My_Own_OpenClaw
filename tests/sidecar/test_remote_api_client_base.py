import pytest

from tests.sidecar.remote_client_test_utils import (
    DummyResponse,
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

aiohttp = ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

from core.remote_api_client_base import RemoteApiClientBase  # noqa: E402


class SequentialSession:
    def __init__(self, *, post_results=None):
        self.post_results = list(post_results or [])
        self.post_calls = []

    def post(self, url, json=None, timeout=None):
        self.post_calls.append((url, json, timeout))
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
async def test_post_success_json_falls_back_to_secondary_backend(monkeypatch):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://api.windieos.com")
    monkeypatch.setenv("WINDIE_BACKEND_FALLBACK_HTTP_URL", "http://127.0.0.1:8765")
    client = DemoClient()
    client._session = SequentialSession(
        post_results=[
            aiohttp.ClientError("remote down"),
            DummyResponse(200, json_data={"success": True, "value": 2}),
        ],
    )

    result = await client.send_demo({"ok": True})

    assert result == {"success": True, "value": 2}
    assert [call[0] for call in client._session.post_calls] == [
        "https://api.windieos.com/api/demo",
        "http://127.0.0.1:8765/api/demo",
    ]
    assert client.backend_url == "http://127.0.0.1:8765"
