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


class FakeSidecarRuntime:
    def __init__(self):
        self.status_calls = 0
        self.module_tools = []
        self.plugins = []
        self.mcps = []
        self.executions = []
        self.shutdown_calls = 0
        self.close_calls = 0

    async def status(self):
        self.status_calls += 1
        return {"status": "ok"}

    async def register_module_tool(self, tool, *, workspace_path=None):
        self.module_tools.append((tool, workspace_path))
        return {"success": True, "tool": tool}

    async def register_plugin(self, plugin):
        self.plugins.append(plugin)
        return {"success": True}

    async def register_mcp(self, mcp):
        self.mcps.append(mcp)
        return {"success": True}

    async def list_tools(self):
        return {
            "version": 1,
            "tools": [
                {
                    "name": "save_note",
                    "description": "Save a note.",
                    "execution_target": "sidecar",
                    "schema": {"type": "object", "properties": {}},
                }
            ],
        }

    async def execute_tool(self, *, tool_name, args, **metadata):
        self.executions.append((tool_name, args, metadata))
        return {
            "success": True,
            "data": {"llm_content": f"{tool_name}:{args.get('text', '')}"},
        }

    async def shutdown(self):
        self.shutdown_calls += 1

    async def close(self):
        self.close_calls += 1


@pytest.mark.asyncio
async def test_get_system_prompt_builds_query_string():
    response = DummyResponse(
        200,
        json_data={"config": {"model_provider": "openai"}, "system_prompt": "prompt"},
    )
    session = DummySession(response=response)
    client = WindieSdkClient(backend_url="https://api.windieos.com")
    client._session = session

    result = await client.get_system_prompt(
        user_id="dev-user", interaction_mode="agent"
    )

    assert result["system_prompt"] == "prompt"
    url, timeout, headers = session.last_get
    assert (
        url
        == "https://api.windieos.com/api/sdk/system-prompt?user_id=dev-user&interaction_mode=agent"
    )
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
async def test_wake_up_builds_agent_definition_and_sends_query(monkeypatch):
    monkeypatch.setattr(windie_sdk_client_module.platform, "system", lambda: "Darwin")
    websocket = FakeWebSocket()
    session = DummyWsSession(websocket)
    client = WindieSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
    )
    client._session = session

    agent = await client.wake_up(
        agent_id="python-agent",
        name="Python Agent",
        system_prompt="Python SDK prompt.",
        workspace_path="/tmp/project",
        skills=[
            {
                "id": "code-review",
                "type": "extension_skill",
                "content": "Lead with risks.",
            }
        ],
    )
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
        "agent_definition": {
            "version": 1,
            "id": "python-agent",
            "name": "Python Agent",
            "system_prompt": {"mode": "replace", "content": "Python SDK prompt."},
            "skills": [
                {
                    "id": "code-review",
                    "type": "extension_skill",
                    "content": "Lead with risks.",
                }
            ],
            "runtime": {
                "operating_system": "macOS",
                "workspace_path": "/tmp/project",
            },
        },
    }
    assert websocket.sent[1]["type"] == "query"
    assert websocket.sent[1]["id"] == message_id
    assert websocket.sent[1]["payload"] == {
        "text": "Click the orange search button",
        "conversation_ref": "conv-123",
        "screenshot_ref": "artifact-123.png",
    }


@pytest.mark.asyncio
async def test_wake_up_requires_user_id_when_no_default_is_configured():
    client = WindieSdkClient(backend_url="https://api.windieos.com")
    client._session = DummyWsSession(FakeWebSocket())

    with pytest.raises(Exception, match="requires a user_id or default_user_id"):
        await client.wake_up()


@pytest.mark.asyncio
async def test_wake_up_registers_local_tools_plugins_and_mcps():
    sidecar = FakeSidecarRuntime()
    client = WindieSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
        sidecar=sidecar,
    )
    websocket = FakeWebSocket()
    client._session = DummyWsSession(websocket)

    await client.wake_up(
        workspace_path="/tmp/project",
        tools=[
            {
                "name": "save_note",
                "module": "my_project.tools:save_note",
                "schema": {"type": "object", "properties": {}},
            }
        ],
        plugins=[{"path": "/tmp/plugin"}],
        mcps=[{"id": "notes", "command": "fake-mcp"}],
    )

    assert sidecar.status_calls == 1
    assert sidecar.module_tools[0][0]["name"] == "save_note"
    assert sidecar.module_tools[0][1] == "/tmp/project"
    assert sidecar.plugins == [{"path": "/tmp/plugin"}]
    assert sidecar.mcps == [{"id": "notes", "command": "fake-mcp"}]
    assert websocket.sent[0]["agent_definition"]["tools"] == {
        "mode": "default_plus_client",
        "client_manifest": {
            "version": 1,
            "tools": [
                {
                    "name": "save_note",
                    "description": "Save a note.",
                    "execution_target": "sidecar",
                    "schema": {"type": "object", "properties": {}},
                }
            ],
        },
    }
    assert websocket.sent[0]["agent_definition"]["plugins"] == [{"path": "/tmp/plugin"}]
    assert websocket.sent[0]["agent_definition"]["mcps"] == [
        {"id": "notes", "command": "fake-mcp"}
    ]
    assert await client.status() == {"status": "ok"}
    assert (await client.list_tools())["tools"][0]["name"] == "save_note"
    await client.shutdown_local_runtime()
    assert sidecar.shutdown_calls == 1
    assert sidecar.close_calls == 1


@pytest.mark.asyncio
async def test_python_agent_session_routes_tool_call_to_sidecar():
    sidecar = FakeSidecarRuntime()
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-call",
                "payload": {
                    "request_id": "req-1",
                    "tool_call_id": "call-1",
                    "correlation_id": "corr-1",
                    "tool_name": "save_note",
                    "parameters": {"text": "hello"},
                },
            }
        ]
    )
    client = WindieSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
        sidecar=sidecar,
    )
    client._session = DummyWsSession(websocket)
    agent = await client.wake_up(
        tools=[
            {
                "name": "save_note",
                "module": "my_project.tools:save_note",
                "schema": {"type": "object", "properties": {}},
            }
        ]
    )

    event = await agent.receive_json()

    assert event["type"] == "tool-call"
    assert sidecar.executions == [
        (
            "save_note",
            {"text": "hello"},
            {
                "request_id": "req-1",
                "tool_call_id": "call-1",
                "correlation_id": "corr-1",
            },
        )
    ]
    assert websocket.sent[-1]["type"] == "tool-result"
    assert websocket.sent[-1]["payload"] == {
        "request_id": "req-1",
        "success": True,
        "data": {"llm_content": "save_note:hello"},
        "error": None,
    }


@pytest.mark.asyncio
async def test_python_agent_session_routes_tool_bundle_to_sidecar():
    sidecar = FakeSidecarRuntime()
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-bundle",
                "payload": {
                    "bundle_id": "bundle-1",
                    "tools": [
                        {
                            "name": "save_note",
                            "toolCallId": "call-save-note",
                            "args": {"text": "first"},
                        }
                    ],
                },
            }
        ]
    )
    client = WindieSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
        sidecar=sidecar,
    )
    client._session = DummyWsSession(websocket)
    agent = await client.wake_up(
        tools=[
            {
                "name": "save_note",
                "module": "my_project.tools:save_note",
                "schema": {"type": "object", "properties": {}},
            }
        ]
    )

    event = await agent.receive_json()

    assert event["type"] == "tool-bundle"
    assert sidecar.executions == [
        (
            "save_note",
            {"text": "first"},
            {"bundle_id": "bundle-1", "tool_call_id": "call-save-note"},
        )
    ]
    assert websocket.sent[-1]["type"] == "tool-bundle-result"
    assert websocket.sent[-1]["payload"]["bundle_id"] == "bundle-1"
    assert websocket.sent[-1]["payload"]["status"] == "success"
    assert websocket.sent[-1]["payload"]["step_results"][0]["toolCallId"] == (
        "call-save-note"
    )
    assert websocket.sent[-1]["payload"]["step_results"][0]["output"] == {
        "llm_content": "save_note:first"
    }


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

    with pytest.raises(
        Exception, match="Windie SDK trace query timed out after 0.01 seconds"
    ):
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
