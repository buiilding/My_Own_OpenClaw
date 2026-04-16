import asyncio
import json

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

from core import windie_sdk_client as windie_sdk_client_module  # noqa: E402
from core import WindieSdkClient as ExportedWindieSdkClient  # noqa: E402
from core.windie_sdk_client import WindieSdkClient  # noqa: E402


class FakeFormData:
    def __init__(self):
        self.fields = []

    def add_field(self, name, value, filename=None, content_type=None):
        self.fields.append(
            {
                "name": name,
                "value": value,
                "filename": filename,
                "content_type": content_type,
            }
        )


class DummyArtifactSession:
    def __init__(self, response):
        self.response = response
        self.last_post = None

    def post(self, url, data=None, timeout=None, json=None, headers=None):
        self.last_post = (url, data, timeout, json, headers)
        return self.response

    async def close(self):
        return None


class FakeWsMessage:
    def __init__(self, data):
        self.data = data


class FakeWebSocket:
    def __init__(self, messages=None, *, block_on_empty=False):
        self.sent = []
        self.messages = list(messages or [])
        self.closed = False
        self.block_on_empty = block_on_empty

    async def send_json(self, payload):
        self.sent.append(payload)

    async def receive(self):
        if not self.messages:
            if self.block_on_empty:
                await asyncio.Future()
            raise Exception("No more websocket messages")
        return FakeWsMessage(json.dumps(self.messages.pop(0)))

    async def close(self):
        self.closed = True


class DummyWsSession:
    def __init__(self, websocket):
        self.websocket = websocket
        self.ws_connect_calls = []

    async def ws_connect(self, url, timeout=None, headers=None):
        self.ws_connect_calls.append((url, timeout, headers))
        return self.websocket

    async def close(self):
        return None


@pytest.mark.asyncio
async def test_get_system_prompt_builds_query_string():
    response = DummyResponse(
        200,
        json_data={"config": {"model_provider": "openai"}, "system_prompt": "prompt"},
    )
    session = DummySession(response=response)
    client = WindieSdkClient(backend_url="https://api.windieos.com")
    client._session = session

    result = await client.get_system_prompt(user_id="dev-user", interaction_mode="agent")

    assert result["system_prompt"] == "prompt"
    url, timeout, headers = session.last_get
    assert url == "https://api.windieos.com/api/sdk/system-prompt?user_id=dev-user&interaction_mode=agent"
    assert timeout.total == 60
    assert headers == {}


@pytest.mark.asyncio
async def test_get_query_plan_posts_payload_and_returns_json():
    response = DummyResponse(
        200,
        json_data={
            "query_message": {"type": "query", "payload": {"text": "open file"}},
            "transparency_events": [],
        },
    )
    session = DummySession(response=response)
    client = WindieSdkClient(backend_url="http://localhost:8765")
    client._session = session

    payload = {
        "user_query_raw": "open file",
        "conversation_ref": "conv-sdk",
        "messages": [],
    }
    result = await client.get_query_plan(payload)

    assert result["query_message"]["payload"]["text"] == "open file"
    url, posted_payload, timeout, headers, data = session.last_post
    assert url == "http://localhost:8765/api/sdk/query-plan"
    assert posted_payload == payload
    assert timeout.total == 60
    assert headers == {}
    assert data is None


@pytest.mark.asyncio
async def test_upload_artifact_uses_artifact_endpoint(monkeypatch):
    monkeypatch.setattr(windie_sdk_client_module.aiohttp, "FormData", FakeFormData)
    session = DummyArtifactSession(
        DummyResponse(
            200,
            json_data={
                "artifact_id": "shot.png",
                "content_type": "image/png",
                "size_bytes": 3,
                "sha256": "abc",
                "url": "https://api.windieos.com/api/artifacts/shot.png",
            },
        )
    )
    client = WindieSdkClient(backend_url="https://api.windieos.com")
    client._session = session

    result = await client.upload_artifact(
        filename="shot.png",
        content=b"abc",
        content_type="image/png",
    )

    assert result["artifact_id"] == "shot.png"
    url, data, timeout, posted_json, headers = session.last_post
    assert url == "https://api.windieos.com/api/artifacts/"
    assert posted_json is None
    assert timeout.total == 60
    assert headers == {}
    assert data.fields == [
        {
            "name": "file",
            "value": b"abc",
            "filename": "shot.png",
            "content_type": "image/png",
        }
    ]


@pytest.mark.asyncio
async def test_connect_agent_sends_handshake_and_query():
    websocket = FakeWebSocket()
    session = DummyWsSession(websocket)
    client = WindieSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
        default_operating_system="macOS",
    )
    client._session = session

    agent = await client.connect_agent()
    message_id = await agent.query(
        text="Click the orange search button",
        conversation_ref="conv-123",
        screenshot_ref="artifact-123.png",
    )

    assert session.ws_connect_calls == [("wss://api.windieos.com/ws", 60, {})]
    assert websocket.sent[0] == {
        "type": "handshake",
        "user_id": "dev-user",
        "operating_system": "macOS",
    }
    assert websocket.sent[1]["type"] == "query"
    assert websocket.sent[1]["id"] == message_id
    assert websocket.sent[1]["payload"] == {
        "text": "Click the orange search button",
        "conversation_ref": "conv-123",
        "screenshot_ref": "artifact-123.png",
    }


@pytest.mark.asyncio
async def test_connect_agent_requires_user_id_when_no_default_is_configured():
    client = WindieSdkClient(backend_url="https://api.windieos.com")
    client._session = DummyWsSession(FakeWebSocket())

    with pytest.raises(Exception, match="requires a user_id or default_user_id"):
        await client.connect_agent()


@pytest.mark.asyncio
async def test_trace_query_collects_events_until_streaming_complete():
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-schemas",
                "payload": {
                    "tool_schemas": [{"type": "function", "name": "read_file"}],
                },
            },
            {
                "type": "streaming-response",
                "payload": {"text": "partial"},
            },
            {
                "type": "streaming-complete",
                "payload": {"final_response": "done"},
            },
        ]
    )
    session = DummyWsSession(websocket)
    client = WindieSdkClient(
        backend_url="http://localhost:8765",
        default_user_id="dev-user",
    )
    client._session = session

    trace = await client.trace_query(
        query={
            "text": "Inspect repo state",
            "conversation_ref": "conv-trace",
        }
    )

    assert trace["final_response"] == "done"
    assert [event["type"] for event in trace["events"]] == [
        "tool-schemas",
        "streaming-response",
        "streaming-complete",
    ]
    assert websocket.closed is True


@pytest.mark.asyncio
async def test_trace_query_times_out_and_closes_websocket():
    websocket = FakeWebSocket(messages=[], block_on_empty=True)
    session = DummyWsSession(websocket)
    client = WindieSdkClient(
        backend_url="http://localhost:8765",
        default_user_id="dev-user",
    )
    client._session = session

    with pytest.raises(Exception, match="Windie SDK trace query timed out after 0.01 seconds"):
        await client.trace_query(
            query={
                "text": "Inspect repo state",
                "conversation_ref": "conv-timeout",
            },
            timeout_seconds=0.01,
        )

    assert websocket.closed is True


@pytest.mark.asyncio
async def test_initialize_creates_single_session_and_close_resets(monkeypatch):
    await assert_client_initialize_reuses_session_and_close_resets(
        monkeypatch,
        windie_sdk_client_module.aiohttp,
        WindieSdkClient(),
    )


def test_core_package_exports_windie_sdk_client():
    assert ExportedWindieSdkClient is WindieSdkClient
