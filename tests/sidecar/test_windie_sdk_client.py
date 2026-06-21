"""Covers Python SDK package client behavior."""

import asyncio
import json
import tempfile
from pathlib import Path

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

from windie import (  # noqa: E402
    AgentLocalRuntimeHttpClient as ExportedAgentLocalRuntimeHttpClient,
    AgentSdkClient as ExportedAgentSdkClient,
)
from windie.sdk import (  # noqa: E402
    AgentLocalRuntimeHttpClient,
    AgentSdkClient,
)
from windie import sdk as windie_sdk_module  # noqa: E402


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


def test_python_sdk_discovery_requires_canonical_base_url():
    assert windie_sdk_module._normalize_discovery(
        {"base_url": " http://127.0.0.1:43123 ", "token": " token "}
    ) == {
        "base_url": "http://127.0.0.1:43123",
        "token": "token",
    }
    assert windie_sdk_module._normalize_discovery(
        {"baseUrl": "http://127.0.0.1:43123", "token": "token"}
    ) is None


def test_python_sdk_default_local_runtime_discovery_path_is_generic():
    assert windie_sdk_module.DEFAULT_LOCAL_RUNTIME_DISCOVERY_FILE == (
        Path(tempfile.gettempdir()) / "desktop-runtime" / "local-runtime-daemon.json"
    )


def test_python_sdk_local_runtime_http_client_is_canonical():
    assert ExportedAgentSdkClient is AgentSdkClient
    assert windie_sdk_module.AgentLocalRuntimeHttpClient is AgentLocalRuntimeHttpClient
    assert ExportedAgentLocalRuntimeHttpClient is AgentLocalRuntimeHttpClient
    assert not hasattr(windie_sdk_module, "SidecarDaemonHttpClient")


def test_python_sdk_generated_agent_identity_is_generic():
    definition = windie_sdk_module._build_python_wake_up_agent_definition()
    session = windie_sdk_module.AgentSdkAgentSession(
        websocket=FakeWebSocket(),
        user_id="dev-user",
    )

    assert definition["id"].startswith("python-agent-")
    assert "windie" not in definition["id"].lower()
    assert definition["name"] == "Python Agent"
    assert "windie" not in definition["name"].lower()
    assert session.default_conversation_ref == "conv-python-agent"


@pytest.mark.asyncio
async def test_agent_local_runtime_http_client_errors_use_generic_wording():
    response = DummyResponse(503, text_data="not ready")
    client = AgentLocalRuntimeHttpClient(
        base_url="http://127.0.0.1:4001",
        token="runtime-token",
    )
    client._session = DummySession(response=response)

    with pytest.raises(Exception, match="Local runtime returned 503: not ready"):
        await client.status()

    _, _, headers = client._session.last_get
    assert headers == {"x-agent-local-runtime-token": "runtime-token"}


@pytest.mark.asyncio
async def test_agent_local_runtime_http_client_rejects_non_object_payload_generically():
    response = DummyResponse(200, json_data=["not", "an", "object"])
    client = AgentLocalRuntimeHttpClient(
        base_url="http://127.0.0.1:4001",
        token="runtime-token",
    )
    client._session = DummySession(response=response)

    with pytest.raises(
        Exception,
        match="Local runtime returned a non-object JSON payload",
    ):
        await client.status()


@pytest.mark.asyncio
async def test_agent_local_runtime_http_client_rejects_unsupported_methods_generically():
    client = AgentLocalRuntimeHttpClient(
        base_url="http://127.0.0.1:4001",
        token="runtime-token",
    )
    client._session = DummySession(response=DummyResponse(200, json_data={"ok": True}))

    with pytest.raises(ValueError, match="Unsupported local runtime method: delete"):
        await client._request_json(method="delete", path="/status")


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


class FailingWsSession:
    def __init__(self, error):
        self.error = error
        self.ws_connect_calls = []

    async def ws_connect(self, url, timeout=None, headers=None):
        self.ws_connect_calls.append((url, timeout, headers))
        raise self.error

    async def close(self):
        return None


class FakeLocalRuntime:
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
                    "execution_target": "local_runtime",
                    "schema": {"type": "object", "properties": {}},
                }
            ],
        }

    async def execute_tool(self, *, tool_name, args, **metadata):
        self.executions.append((tool_name, args, metadata))
        return {
            "success": True,
            "data": {"output": f"{tool_name}:{args.get('text', '')}"},
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
    client = AgentSdkClient(backend_url="https://backend.example.com")
    client._session = session

    result = await client.get_system_prompt(
        user_id="dev-user", interaction_mode="agent"
    )

    assert result["system_prompt"] == "prompt"
    url, timeout, headers = session.last_get
    assert (
        url
        == "https://backend.example.com/api/sdk/system-prompt?user_id=dev-user&interaction_mode=agent"
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
    client = AgentSdkClient(backend_url="http://localhost:8765")
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
async def test_sdk_http_requests_do_not_retry_alternate_backend_urls():
    session = SequentialSession(
        post_results=[DummyResponse(503, text_data="unavailable")],
    )
    client = AgentSdkClient(backend_url="https://backend.example.com")
    client._session = session

    with pytest.raises(Exception, match="SDK API returned 503: unavailable"):
        await client.get_query_plan(
            {
                "user_query_raw": "open file",
                "conversation_ref": "conv-sdk",
                "messages": [],
            }
        )

    assert [call[0] for call in session.post_calls] == [
        "https://backend.example.com/api/sdk/query-plan",
    ]
    assert client.backend_url == "https://backend.example.com"


@pytest.mark.asyncio
async def test_sdk_http_requests_filter_strict_backend_payloads():
    response = DummyResponse(
        200,
        json_data={
            "query_message": {"type": "query", "payload": {"text": "open file"}},
            "transparency_events": [],
        },
    )
    session = DummySession(response=response)
    client = AgentSdkClient(backend_url="http://localhost:8765")
    client._session = session

    payload = {
        "user_query_raw": "open file",
        "conversation_ref": "conv-sdk",
        "turn_ref": "turn-ui-only",
        "messages": [],
        "agent_definition": {
            "id": "python-agent",
            "legacy_context": {"should_not_reach_backend": True},
            "system_prompt": {
                "mode": "replace",
                "content": "Python prompt.",
                "source": "ui",
            },
            "tools": {
                "mode": "default_plus_client",
                "client_manifest": {"version": 1, "tools": []},
                "client_tools": ["bad"],
            },
            "runtime": {
                "operating_system": "macOS",
                "unsupported": True,
            },
        },
    }

    await client.get_query_plan(payload)

    _, posted_payload, _, _, _ = session.last_post
    assert posted_payload == {
        "user_query_raw": "open file",
        "conversation_ref": "conv-sdk",
        "messages": [],
        "agent_definition": {
            "id": "python-agent",
            "system_prompt": {
                "mode": "replace",
                "content": "Python prompt.",
            },
            "tools": {
                "mode": "default_plus_client",
                "client_manifest": {"version": 1, "tools": []},
            },
            "runtime": {"operating_system": "macOS"},
        },
    }


@pytest.mark.asyncio
async def test_sdk_http_ocr_vision_and_title_payloads_drop_unknown_fields():
    response = DummyResponse(200, json_data={"success": True})
    session = DummySession(response=response)
    client = AgentSdkClient(backend_url="http://localhost:8765")
    client._session = session

    await client.ocr_inspect(
        {
            "image": {"artifact_id": "artifact-1", "source": "renderer-cache"},
            "text": "Submit",
            "include_overlay": True,
            "ui_only": True,
        }
    )
    assert session.last_post[1] == {
        "image": {"artifact_id": "artifact-1"},
        "text": "Submit",
        "include_overlay": True,
    }

    await client.vision_locate_all(
        {
            "image": {"image_base64": "abc", "mime_type": "image/png"},
            "description": "button",
            "max_results": 3,
            "trace_id": "trace-ui-only",
        }
    )
    assert session.last_post[1] == {
        "image": {"image_base64": "abc"},
        "description": "button",
        "max_results": 3,
    }

    await client.request_json(
        method="post",
        path="/api/semantic/title",
        payload={
            "user_message": "Hello",
            "assistant_message": "Hi",
            "local_revision_id": "rev-1",
        },
    )
    assert session.last_post[1] == {
        "user_message": "Hello",
        "assistant_message": "Hi",
    }


@pytest.mark.asyncio
async def test_upload_artifact_uses_artifact_endpoint(monkeypatch):
    monkeypatch.setattr(windie_sdk_module.aiohttp, "FormData", FakeFormData)
    session = DummyArtifactSession(
        DummyResponse(
            200,
            json_data={
                "artifact_id": "shot.png",
                "content_type": "image/png",
                "size_bytes": 3,
                "sha256": "abc",
                "url": "https://backend.example.com/api/artifacts/shot.png",
            },
        )
    )
    client = AgentSdkClient(backend_url="https://backend.example.com")
    client._session = session

    result = await client.upload_artifact(
        filename="shot.png",
        content=b"abc",
        content_type="image/png",
    )

    assert result["artifact_id"] == "shot.png"
    url, data, timeout, posted_json, headers = session.last_post
    assert url == "https://backend.example.com/api/artifacts/"
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
async def test_upload_artifact_does_not_retry_alternate_backend_urls(monkeypatch):
    monkeypatch.setattr(windie_sdk_module.aiohttp, "FormData", FakeFormData)
    session = SequentialSession(
        post_results=[DummyResponse(502, text_data="bad gateway")],
    )
    client = AgentSdkClient(backend_url="https://backend.example.com")
    client._session = session

    with pytest.raises(Exception, match="Artifacts API returned 502: bad gateway"):
        await client.upload_artifact(
            filename="shot.png",
            content=b"abc",
            content_type="image/png",
        )

    assert [call[0] for call in session.post_calls] == [
        "https://backend.example.com/api/artifacts/",
    ]
    assert client.backend_url == "https://backend.example.com"


@pytest.mark.asyncio
async def test_wake_up_builds_agent_definition_and_sends_query(monkeypatch):
    monkeypatch.setattr(windie_sdk_module.platform, "system", lambda: "Darwin")
    websocket = FakeWebSocket()
    session = DummyWsSession(websocket)
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
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

    assert session.ws_connect_calls == [("wss://backend.example.com/ws", 60, {})]
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
        "content": (
            "<user_query>\nClick the orange search button\n</user_query>"
        ),
        "screenshot_ref": "artifact-123.png",
    }


@pytest.mark.asyncio
async def test_wake_up_does_not_retry_alternate_backend_urls():
    session = FailingWsSession(aiohttp.ClientError("remote down"))
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
    )
    client._session = session

    with pytest.raises(Exception, match="Failed to connect to agent websocket"):
        await client.wake_up(agent_id="python-agent")

    assert session.ws_connect_calls == [("wss://backend.example.com/ws", 60, {})]
    assert client.backend_url == "https://backend.example.com"


@pytest.mark.asyncio
async def test_python_agent_query_renders_attachment_content_without_query_context():
    websocket = FakeWebSocket()
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
    )
    client._session = DummyWsSession(websocket)
    agent = await client.wake_up(agent_id="python-agent")

    await agent.query(
        text="Summarize the attachment",
        conversation_ref="conv-attachments",
        attachment_context="file body",
        attachment_filenames=["notes.txt"],
    )

    assert websocket.sent[1]["payload"] == {
        "text": "Summarize the attachment",
        "conversation_ref": "conv-attachments",
        "content": (
            "<attached_file_context>\nfile body\n</attached_file_context>\n\n"
            "<user_query>\nSummarize the attachment\n</user_query>"
        ),
    }
    assert "query_context" not in websocket.sent[1]["payload"]
    assert "attachment_context" not in websocket.sent[1]["payload"]
    assert "attachment_filenames" not in websocket.sent[1]["payload"]


@pytest.mark.asyncio
async def test_python_agent_update_settings_filters_backend_payload():
    websocket = FakeWebSocket()
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
    )
    client._session = DummyWsSession(websocket)
    agent = await client.wake_up(agent_id="python-agent")

    await agent.update_settings(
        {
            "selected_model_id": "gpt-test",
            "appearance_theme": "graphite",
            "global_agent_stop_shortcut": "CommandOrControl+Alt+.",
            "provider_api_keys": {
                "openai": {
                    "enabled": True,
                    "api_key": "sk-test",
                    "renderer_only": True,
                },
                "future_provider": {
                    "enabled": True,
                    "api_key": "future",
                },
            },
            "provider_oauth": {
                "openai_codex": {
                    "connected": True,
                    "access_token": "access",
                    "refresh_token": "refresh",
                    "renderer_only": True,
                },
                "future_oauth": {"connected": True},
            },
        }
    )

    assert websocket.sent[1]["type"] == "update-settings"
    assert websocket.sent[1]["payload"] == {
        "selected_model_id": "gpt-test",
        "provider_api_keys": {
            "openai": {
                "enabled": True,
                "api_key": "sk-test",
            },
            "future_provider": {
                "enabled": True,
                "api_key": "future",
            },
        },
    }


@pytest.mark.asyncio
async def test_wake_up_requires_user_id_when_no_default_is_configured():
    client = AgentSdkClient(backend_url="https://backend.example.com")
    client._session = DummyWsSession(FakeWebSocket())

    with pytest.raises(
        Exception, match="Agent SDK wake_up requires a user_id or default_user_id"
    ):
        await client.wake_up()


@pytest.mark.asyncio
async def test_wake_up_reports_generic_local_runtime_auto_start_failure(tmp_path):
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        auto_start_local_runtime=False,
        local_runtime_discovery_file=str(tmp_path / "missing-local-runtime.json"),
    )

    with pytest.raises(
        Exception,
        match="Agent SDK local runtime is required but auto-start is disabled",
    ):
        await client.wake_up(
            tools=[
                {
                    "name": "save_note",
                    "module": "my_project.tools:save_note",
                    "schema": {"type": "object", "properties": {}},
                }
            ],
        )


def test_python_sdk_local_runtime_errors_use_generic_boundary_wording():
    source = Path(windie_sdk_module.__file__).read_text(encoding="utf-8")
    runtime_env_source = (
        Path(windie_sdk_module.__file__).resolve().parent / "_runtime_env.py"
    ).read_text(encoding="utf-8")

    assert "Timed out waiting for local runtime discovery" in source
    assert "Timed out waiting for local sidecar daemon discovery" not in source
    assert "local_runtime: Any = None" in source
    assert "local_runtime_discovery_file: Optional[str] = None" in source
    assert "local_runtime_daemon_script: Optional[str] = None" in source
    assert "sidecar: Any = None" not in source
    assert "sidecar_discovery_file" not in source
    assert "sidecar_daemon_script" not in source
    assert "LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS" in source
    assert "LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS" in source
    assert "LOCAL_RUNTIME_PYTHON_ENV_KEYS" in source
    assert "AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT" in runtime_env_source
    assert "WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT" in runtime_env_source
    assert "AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE" in runtime_env_source
    assert "WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE" in runtime_env_source
    assert "AGENT_LOCAL_RUNTIME_PYTHON" in runtime_env_source
    assert "WINDIE_PYTHON" in runtime_env_source
    assert "WINDIE_SIDECAR_DAEMON_SCRIPT" not in source
    assert "WINDIE_SIDECAR_DAEMON_SCRIPT" not in runtime_env_source


def test_python_sdk_daemon_script_prefers_generic_env(monkeypatch, tmp_path):
    agent_script = tmp_path / "agent-runtime-daemon.py"
    legacy_script = tmp_path / "legacy-runtime-daemon.py"
    monkeypatch.setenv("AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT", str(agent_script))
    monkeypatch.setenv("WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT", str(legacy_script))

    assert windie_sdk_module._resolve_daemon_script() == agent_script.resolve()


def test_python_sdk_local_runtime_env_aliases_prefer_generic(monkeypatch, tmp_path):
    discovery_file = tmp_path / "agent-runtime.json"
    legacy_discovery_file = tmp_path / "legacy-runtime.json"
    monkeypatch.setenv(
        "AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE",
        str(discovery_file),
    )
    monkeypatch.setenv(
        "WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE",
        str(legacy_discovery_file),
    )
    monkeypatch.setenv("AGENT_LOCAL_RUNTIME_PYTHON", "agent-python")
    monkeypatch.setenv("WINDIE_PYTHON", "legacy-python")

    client = AgentSdkClient(backend_url="https://backend.example.com")

    assert client.local_runtime_discovery_file == discovery_file
    assert client.python_command == "agent-python"


@pytest.mark.asyncio
async def test_wake_up_registers_local_tools_plugins_and_mcps():
    local_runtime = FakeLocalRuntime()
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
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

    assert local_runtime.status_calls == 1
    assert local_runtime.module_tools[0][0]["name"] == "save_note"
    assert local_runtime.module_tools[0][1] == "/tmp/project"
    assert local_runtime.plugins == [{"path": "/tmp/plugin"}]
    assert local_runtime.mcps == [{"id": "notes", "command": "fake-mcp"}]
    assert websocket.sent[0]["agent_definition"]["tools"] == {
        "mode": "default_plus_client",
        "client_manifest": {
            "version": 1,
            "tools": [
                {
                    "name": "save_note",
                    "description": "Save a note.",
                    "execution_target": "local_runtime",
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
    assert local_runtime.shutdown_calls == 1
    assert local_runtime.close_calls == 1


@pytest.mark.asyncio
async def test_python_agent_session_routes_tool_call_to_local_runtime():
    local_runtime = FakeLocalRuntime()
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
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
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
    assert local_runtime.executions == [
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
        "data": {"output": "save_note:hello"},
    }


@pytest.mark.asyncio
async def test_python_agent_session_ignores_camel_case_tool_call_payload():
    local_runtime = FakeLocalRuntime()
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-call",
                "payload": {
                    "requestId": "req-1",
                    "toolCallId": "call-1",
                    "correlationId": "corr-1",
                    "toolName": "save_note",
                    "parameters": {"text": "hello"},
                },
            }
        ]
    )
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
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
    assert local_runtime.executions == []
    assert all(message.get("type") != "tool-result" for message in websocket.sent)


@pytest.mark.asyncio
async def test_python_agent_tool_result_strips_invalid_capture_meta():
    class PartialCaptureLocalRuntime(FakeLocalRuntime):
        async def execute_tool(self, *, tool_name, args, **metadata):
            await super().execute_tool(tool_name=tool_name, args=args, **metadata)
            return {
                "success": True,
                "data": {
                    "output": "done",
                    "capture_meta": {"capture_engine": "partial"},
                },
            }

    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-call",
                "payload": {
                    "request_id": "req-1",
                    "tool_name": "save_note",
                    "parameters": {"text": "hello"},
                },
            }
        ]
    )
    local_runtime = PartialCaptureLocalRuntime()
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
    )
    client._session = DummyWsSession(websocket)
    agent = await client.wake_up(
        agent_id="python-agent",
        tools=[
            {
                "name": "save_note",
                "module": "my_project.tools:save_note",
                "schema": {"type": "object", "properties": {}},
            }
        ],
    )

    await agent.receive_json()

    assert websocket.sent[-1]["type"] == "tool-result"
    assert websocket.sent[-1]["payload"]["data"] == {"output": "done"}


@pytest.mark.asyncio
async def test_python_agent_stream_and_run_match_high_level_sdk_shape():
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "streaming-response",
                "payload": {"text": "partial"},
            },
            {
                "type": "tool-call",
                "payload": {
                    "request_id": "req-stream",
                    "tool_name": "save_note",
                    "parameters": {"text": "streamed"},
                },
            },
            {
                "type": "tool-output",
                "payload": {
                    "request_id": "req-stream",
                    "tool_name": "save_note",
                    "output": "saved",
                },
            },
            {
                "type": "streaming-complete",
                "payload": {"final_response": "done"},
            },
            {
                "type": "streaming-complete",
                "payload": {"final_response": "run done"},
            },
        ]
    )
    local_runtime = FakeLocalRuntime()
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
    )
    client._session = DummyWsSession(websocket)
    agent = await client.wake_up(
        agent_id="python-agent",
        tools=[
            {
                "name": "save_note",
                "module": "my_project.tools:save_note",
                "schema": {"type": "object", "properties": {}},
            }
        ],
    )

    events = [
        event
        async for event in agent.stream(
            "save this",
            conversation_ref="conv-python-stream",
        )
    ]
    final_response = await agent.run("finish this")

    assert [event["type"] for event in events] == [
        "start",
        "text",
        "tool_call",
        "tool_output",
        "complete",
    ]
    assert events[0]["conversation_ref"] == "conv-python-stream"
    assert events[1]["text"] == "partial"
    assert events[2]["tool_name"] == "save_note"
    assert events[-1]["final_response"] == "done"
    assert final_response == "run done"
    assert websocket.sent[1]["type"] == "query"
    assert websocket.sent[1]["payload"]["conversation_ref"] == "conv-python-stream"
    assert websocket.sent[-1]["type"] == "query"
    assert websocket.sent[-1]["payload"]["conversation_ref"] == "conv-python-agent"
    assert local_runtime.executions[0][0] == "save_note"


@pytest.mark.asyncio
async def test_python_agent_session_routes_tool_bundle_to_local_runtime():
    local_runtime = FakeLocalRuntime()
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-bundle",
                "payload": {
                    "bundle_id": "bundle-1",
                    "tools": [
                        {
                            "name": "save_note",
                            "tool_call_id": "call-save-note",
                            "args": {"text": "first"},
                        }
                    ],
                },
            }
        ]
    )
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
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
    assert local_runtime.executions == [
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
    assert websocket.sent[-1]["payload"]["step_results"][0]["status"] == "ok"
    assert websocket.sent[-1]["payload"]["step_results"][0]["output"] == {
        "output": "save_note:first"
    }


@pytest.mark.asyncio
async def test_python_agent_session_ignores_camel_case_tool_bundle_payload():
    local_runtime = FakeLocalRuntime()
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-bundle",
                "payload": {
                    "bundleId": "bundle-1",
                    "tools": [
                        {
                            "toolName": "save_note",
                            "toolCallId": "call-save-note",
                            "args": {"text": "first"},
                        }
                    ],
                },
            }
        ]
    )
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
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
    assert local_runtime.executions == []
    assert all(
        message.get("type") != "tool-bundle-result" for message in websocket.sent
    )


@pytest.mark.asyncio
async def test_python_agent_session_uses_sdk_bundle_step_status_contract():
    class FailingLocalRuntime(FakeLocalRuntime):
        async def execute_tool(self, *, tool_name, args, **metadata):
            self.executions.append((tool_name, args, metadata))
            return {"success": False, "error": "failed"}

    local_runtime = FailingLocalRuntime()
    websocket = FakeWebSocket(
        messages=[
            {
                "type": "tool-bundle",
                "payload": {
                    "bundle_id": "bundle-fail",
                    "tools": [
                        {
                            "name": "save_note",
                            "tool_call_id": "call-fail",
                            "args": {"text": "bad"},
                        }
                    ],
                },
            }
        ]
    )
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        local_runtime=local_runtime,
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

    await agent.receive_json()

    assert websocket.sent[-1]["type"] == "tool-bundle-result"
    assert websocket.sent[-1]["payload"]["status"] == "failure"
    assert websocket.sent[-1]["payload"]["step_results"] == [
        {
            "tool": "save_note",
            "status": "error",
            "output": {"error": "failed"},
            "toolCallId": "call-fail",
        }
    ]


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
    client = AgentSdkClient(
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
    assert websocket.sent[1]["payload"] == {
        "text": "Inspect repo state",
        "conversation_ref": "conv-trace",
        "content": "<user_query>\nInspect repo state\n</user_query>",
    }
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
    client = AgentSdkClient(
        backend_url="http://localhost:8765",
        default_user_id="dev-user",
    )
    client._session = session

    with pytest.raises(
        Exception, match="Agent SDK trace query timed out after 0.01 seconds"
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
        windie_sdk_module.aiohttp,
        AgentSdkClient(backend_url="http://localhost:8765"),
    )


def test_windie_package_exports_agent_sdk_client():
    assert ExportedAgentSdkClient is AgentSdkClient
    assert ExportedAgentLocalRuntimeHttpClient is AgentLocalRuntimeHttpClient
    assert not hasattr(windie_sdk_module, "WindieSdkClient")
    assert not hasattr(windie_sdk_module, "WindieSdkAgentSession")
