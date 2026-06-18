"""Covers websocket connection behavior in the backend test suite."""

import json

import pytest
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.auth.context import AuthenticatedInstallIdentity
from backend.src.api.routes.websocket import connection as connection_module
from backend.src.api.routes.websocket.connection import (
    cleanup_connection,
    perform_handshake,
)

restore_route_deps_shim(_original_deps)


class DummyWebSocket:
    def __init__(self, payload: str, headers: dict[str, str] | None = None):
        self._payload = payload
        self.headers = headers or {}

    async def receive_text(self) -> str:
        return self._payload


class DummySafeWebSocket:
    def __init__(self):
        self.closed = []

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed.append((code, reason))


class ExplodingSafeWebSocket(DummySafeWebSocket):
    async def close(
        self, code: int = 1000, reason: str | None = None
    ) -> None:  # noqa: ARG002
        raise RuntimeError("socket close failed")


class DummyTaskManager:
    def __init__(self):
        self.cleaned_user_ids = []

    async def cleanup(self, user_id: str) -> None:
        self.cleaned_user_ids.append(user_id)


class FailingTaskManager(DummyTaskManager):
    async def cleanup(self, user_id: str) -> None:
        await super().cleanup(user_id)
        raise RuntimeError("task cleanup failed")


class DummySessionManager:
    def __init__(self, should_raise: bool = False, remaining_connections: int = 0):
        self.ended_user_ids = []
        self.should_raise = should_raise
        self.remaining_connections = remaining_connections
        self.decremented_user_ids = []

    def decrement_connection_count(self, user_id: str) -> int:
        self.decremented_user_ids.append(user_id)
        return self.remaining_connections

    async def end_session(self, user_id: str) -> None:
        self.ended_user_ids.append(user_id)
        if self.should_raise:
            raise RuntimeError("session cleanup failed")


class DummyInstallAuthService:
    def __init__(self, identity: AuthenticatedInstallIdentity | None):
        self.identity = identity
        self.tokens = []

    def authenticate_token(self, token: str) -> AuthenticatedInstallIdentity | None:
        self.tokens.append(token)
        return self.identity


def _capture_connection_logger_calls(monkeypatch):
    warning_calls = []
    error_calls = []
    monkeypatch.setattr(
        connection_module.logger,
        "warning",
        lambda *args, **kwargs: warning_calls.append((args, kwargs)),
    )
    monkeypatch.setattr(
        connection_module.logger,
        "error",
        lambda *args, **kwargs: error_calls.append((args, kwargs)),
    )
    return warning_calls, error_calls


@pytest.mark.asyncio
async def test_perform_handshake_returns_client_user_id() -> None:
    websocket = DummyWebSocket(
        json.dumps(
            {
                "type": "handshake",
                "user_id": "client_user",
                "agent_definition": {
                    "tools": {
                        "mode": "explicit",
                        "available_tools": ["read_file", "mouse_control"],
                        "disabled_capabilities": ["ocr", "vision"],
                    },
                    "runtime": {
                        "operating_system": "macOS",
                        "coordinate_methods": ["manual"],
                    },
                },
            }
        )
    )
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert safe_ws.closed == []
    assert getattr(safe_ws, "client_operating_system", None) == "macOS"
    assert getattr(safe_ws, "agent_capability_overrides", None) == {
        "agent_available_tools": ["read_file", "mouse_control"],
        "agent_available_coordinate_methods": ["manual"],
        "agent_disabled_capabilities": ["ocr", "vision"],
    }


@pytest.mark.asyncio
async def test_perform_handshake_rejects_removed_top_level_capability_fields() -> None:
    websocket = DummyWebSocket(
        json.dumps(
            {
                "type": "handshake",
                "user_id": "client_user",
                "operating_system": "macOS",
                "available_tools": ["read_file"],
                "available_coordinate_methods": ["manual"],
                "requested_agent_policy": {"disabled_capabilities": ["vision"]},
            }
        )
    )
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


@pytest.mark.asyncio
async def test_perform_handshake_accepts_agent_definition() -> None:
    websocket = DummyWebSocket(
        json.dumps(
            {
                "type": "handshake",
                "user_id": "client_user",
                "agent_definition": {
                    "version": 1,
                    "system_prompt": {
                        "mode": "replace",
                        "content": "Custom agent prompt.",
                    },
                    "tools": {
                        "mode": "client_only",
                        "client_manifest": {
                            "version": 1,
                            "tools": [
                                {
                                    "name": "save_note",
                                    "description": "Save a note.",
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "note": {"type": "string"},
                                        },
                                        "required": ["note"],
                                        "additionalProperties": False,
                                    },
                                }
                            ],
                        },
                        "enabled_remote_tools": ["web_search"],
                    },
                    "runtime": {
                        "operating_system": "Linux",
                        "coordinate_methods": ["manual"],
                    },
                    "skills": [
                        {
                            "id": "review",
                            "type": "extension_skill",
                            "priority": 80,
                            "content": "Review notes before answering.",
                        }
                    ],
                },
            }
        )
    )
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert getattr(safe_ws, "client_operating_system", None) == "Linux"
    assert getattr(safe_ws, "agent_capability_overrides", None) == {
        "agent_available_tools": ["save_note", "web_search"],
        "agent_available_coordinate_methods": ["manual"],
    }
    manifest_result = getattr(safe_ws, "client_tool_manifest_result", None)
    assert manifest_result.accepted_tool_names == ["save_note"]
    agent_definition = getattr(safe_ws, "client_agent_definition", None)
    assert agent_definition.system_prompt_override() == "Custom agent prompt."
    assert agent_definition.client_prompt_layers()[0]["id"] == "review"


@pytest.mark.asyncio
async def test_perform_handshake_uses_authenticated_install_identity_when_required() -> (
    None
):
    websocket = DummyWebSocket(
        json.dumps({"type": "handshake", "user_id": "claimed_user"}),
        headers={"authorization": "Bearer install-token-1"},
    )
    safe_ws = DummySafeWebSocket()
    install_auth_service = DummyInstallAuthService(
        AuthenticatedInstallIdentity(
            user_id="authenticated_user",
            install_id="install_123",
        )
    )

    assigned_user_id = await perform_handshake(
        websocket,
        safe_ws,
        install_auth_service=install_auth_service,
        require_install_auth=True,
    )

    assert assigned_user_id == "authenticated_user"
    assert install_auth_service.tokens == ["install-token-1"]
    assert getattr(safe_ws, "authenticated_user_id", None) == "authenticated_user"
    assert getattr(safe_ws, "authenticated_install_id", None) == "install_123"
    assert safe_ws.closed == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers, identity",
    [
        ({}, AuthenticatedInstallIdentity(user_id="user_1", install_id="install_1")),
        ({"authorization": "Bearer install-token-1"}, None),
    ],
    ids=["missing-token", "invalid-token"],
)
async def test_perform_handshake_rejects_missing_or_invalid_install_token(
    headers: dict[str, str],
    identity: AuthenticatedInstallIdentity | None,
) -> None:
    websocket = DummyWebSocket(
        json.dumps({"type": "handshake", "user_id": "claimed_user"}),
        headers=headers,
    )
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(
        websocket,
        safe_ws,
        install_auth_service=DummyInstallAuthService(identity),
        require_install_auth=True,
    )

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


@pytest.mark.asyncio
async def test_perform_handshake_small_payload_parses_inline(monkeypatch) -> None:
    websocket = DummyWebSocket(
        json.dumps({"type": "handshake", "user_id": "client_user"})
    )
    safe_ws = DummySafeWebSocket()

    monkeypatch.setattr(
        connection_module.asyncio,
        "get_running_loop",
        lambda: (_ for _ in ()).throw(RuntimeError("should not be used")),
    )

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert safe_ws.closed == []


@pytest.mark.asyncio
async def test_perform_handshake_large_payload_uses_executor(monkeypatch) -> None:
    websocket = DummyWebSocket(
        json.dumps({"type": "handshake", "user_id": "client_user"})
    )
    safe_ws = DummySafeWebSocket()

    monkeypatch.setattr(connection_module, "_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES", 1)
    called = {"executor": False}

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            called["executor"] = True
            return fn(data)

    monkeypatch.setattr(
        connection_module.asyncio, "get_running_loop", lambda: FakeLoop()
    )

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert safe_ws.closed == []
    assert called["executor"] is True


@pytest.mark.asyncio
async def test_perform_handshake_offload_threshold_uses_utf8_byte_size(
    monkeypatch,
) -> None:
    payload = json.dumps(
        {
            "type": "handshake",
            "user_id": "🙂" * 24,
        },
        ensure_ascii=False,
    )
    threshold = len(payload) + 1
    assert len(payload.encode("utf-8")) > threshold > len(payload)

    websocket = DummyWebSocket(payload)
    safe_ws = DummySafeWebSocket()
    monkeypatch.setattr(
        connection_module, "_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES", threshold
    )
    called = {"executor": False}

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            called["executor"] = True
            return fn(data)

    monkeypatch.setattr(
        connection_module.asyncio, "get_running_loop", lambda: FakeLoop()
    )
    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "🙂" * 24
    assert safe_ws.closed == []
    assert called["executor"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        "{not-json",
        json.dumps({"type": "handshake"}),
        json.dumps({"type": "handshake", "user_id": "   "}),
        json.dumps(["handshake", "client_user"]),
    ],
    ids=[
        "invalid-json",
        "missing-user-id",
        "blank-user-id",
        "non-object-payload",
    ],
)
async def test_perform_handshake_invalid_payloads_close_socket(payload: str) -> None:
    websocket = DummyWebSocket(payload)
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


@pytest.mark.asyncio
async def test_perform_handshake_parse_runtime_error_closes_socket(monkeypatch) -> None:
    websocket = DummyWebSocket(
        json.dumps({"type": "handshake", "user_id": "client_user"})
    )
    safe_ws = DummySafeWebSocket()

    async def fail_parse(*_args, **_kwargs):
        raise RuntimeError("parse failed")

    monkeypatch.setattr(connection_module, "parse_json_object_payload", fail_parse)

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


@pytest.mark.asyncio
async def test_perform_handshake_validation_failure_logs_warning(monkeypatch) -> None:
    websocket = DummyWebSocket(json.dumps({"type": "handshake"}))
    safe_ws = DummySafeWebSocket()
    warning_calls, error_calls = _capture_connection_logger_calls(monkeypatch)

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert len(warning_calls) == 1
    assert error_calls == []


@pytest.mark.asyncio
async def test_perform_handshake_json_decode_failure_logs_warning(monkeypatch) -> None:
    websocket = DummyWebSocket("{bad-json")
    safe_ws = DummySafeWebSocket()
    warning_calls, error_calls = _capture_connection_logger_calls(monkeypatch)

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert len(warning_calls) == 1
    assert error_calls == []


@pytest.mark.asyncio
async def test_perform_handshake_unexpected_failure_logs_error(monkeypatch) -> None:
    websocket = DummyWebSocket(
        json.dumps({"type": "handshake", "user_id": "client_user"})
    )
    safe_ws = DummySafeWebSocket()
    warning_calls, error_calls = _capture_connection_logger_calls(monkeypatch)

    async def fail_parse(*_args, **_kwargs):
        raise RuntimeError("parse blew up")

    monkeypatch.setattr(connection_module, "parse_json_object_payload", fail_parse)
    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert len(error_calls) == 1
    assert warning_calls == []


@pytest.mark.asyncio
async def test_perform_handshake_handles_unexpected_errors_and_close_failures() -> None:
    class ExplodingWebSocket:
        async def receive_text(self) -> str:
            raise RuntimeError("receive failed")

    assigned_user_id = await perform_handshake(
        ExplodingWebSocket(),
        ExplodingSafeWebSocket(),
    )

    assert assigned_user_id is None


@pytest.mark.asyncio
async def test_close_policy_violation_swallows_close_errors() -> None:
    await connection_module._close_policy_violation(
        ExplodingSafeWebSocket(),
        "test close failure",
    )


@pytest.mark.asyncio
async def test_close_policy_violation_closes_with_policy_code() -> None:
    safe_ws = DummySafeWebSocket()

    await connection_module._close_policy_violation(safe_ws, "policy check")

    assert safe_ws.closed == [(1008, None)]


@pytest.mark.asyncio
async def test_cleanup_connection_runs_task_and_session_cleanup() -> None:
    task_manager = DummyTaskManager()
    session_manager = DummySessionManager()

    await cleanup_connection(task_manager, session_manager, "user_123")

    assert task_manager.cleaned_user_ids == ["user_123"]
    assert session_manager.decremented_user_ids == ["user_123"]
    assert session_manager.ended_user_ids == ["user_123"]


@pytest.mark.asyncio
async def test_cleanup_connection_keeps_session_when_other_connections_remain() -> None:
    task_manager = DummyTaskManager()
    session_manager = DummySessionManager(remaining_connections=1)

    await cleanup_connection(task_manager, session_manager, "user_321")

    assert task_manager.cleaned_user_ids == ["user_321"]
    assert session_manager.decremented_user_ids == ["user_321"]
    assert session_manager.ended_user_ids == []


@pytest.mark.asyncio
async def test_cleanup_connection_swallows_session_cleanup_errors() -> None:
    task_manager = DummyTaskManager()
    session_manager = DummySessionManager(should_raise=True)

    await cleanup_connection(task_manager, session_manager, "user_456")

    assert task_manager.cleaned_user_ids == ["user_456"]
    assert session_manager.ended_user_ids == ["user_456"]


@pytest.mark.asyncio
async def test_cleanup_connection_continues_to_session_cleanup_when_task_cleanup_fails() -> (
    None
):
    task_manager = FailingTaskManager()
    session_manager = DummySessionManager()

    await cleanup_connection(task_manager, session_manager, "user_789")

    assert task_manager.cleaned_user_ids == ["user_789"]
    assert session_manager.ended_user_ids == ["user_789"]


@pytest.mark.asyncio
async def test_cleanup_connection_swallows_when_task_and_session_cleanup_both_fail() -> (
    None
):
    task_manager = FailingTaskManager()
    session_manager = DummySessionManager(should_raise=True)

    await cleanup_connection(task_manager, session_manager, "user_999")

    assert task_manager.cleaned_user_ids == ["user_999"]
    assert session_manager.ended_user_ids == ["user_999"]
