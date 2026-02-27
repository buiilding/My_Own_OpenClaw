import json

import pytest
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.websocket import connection as connection_module
from backend.src.api.routes.websocket.connection import cleanup_connection, perform_handshake

restore_route_deps_shim(_original_deps)


class DummyWebSocket:
    def __init__(self, payload: str):
        self._payload = payload

    async def receive_text(self) -> str:
        return self._payload


class DummySafeWebSocket:
    def __init__(self):
        self.closed = []

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed.append((code, reason))


class ExplodingSafeWebSocket(DummySafeWebSocket):
    async def close(self, code: int = 1000, reason: str | None = None) -> None:  # noqa: ARG002
        raise RuntimeError("socket close failed")


class DummyTaskManager:
    def __init__(self):
        self.cleaned_user_ids = []

    async def cleanup(self, user_id: str) -> None:
        self.cleaned_user_ids.append(user_id)


class DummySessionManager:
    def __init__(self, should_raise: bool = False):
        self.ended_user_ids = []
        self.should_raise = should_raise

    async def end_session(self, user_id: str) -> None:
        self.ended_user_ids.append(user_id)
        if self.should_raise:
            raise RuntimeError("session cleanup failed")


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
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "client_user"}))
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert safe_ws.closed == []


@pytest.mark.asyncio
async def test_perform_handshake_small_payload_parses_inline(monkeypatch) -> None:
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "client_user"}))
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
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "client_user"}))
    safe_ws = DummySafeWebSocket()

    monkeypatch.setattr(connection_module, "_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES", 1)
    called = {"executor": False}

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            called["executor"] = True
            return fn(data)

    monkeypatch.setattr(connection_module.asyncio, "get_running_loop", lambda: FakeLoop())

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert safe_ws.closed == []
    assert called["executor"] is True


@pytest.mark.asyncio
async def test_perform_handshake_offload_threshold_uses_utf8_byte_size(monkeypatch) -> None:
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
    monkeypatch.setattr(connection_module, "_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES", threshold)
    called = {"executor": False}

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            called["executor"] = True
            return fn(data)

    monkeypatch.setattr(connection_module.asyncio, "get_running_loop", lambda: FakeLoop())
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
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "client_user"}))
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
async def test_perform_handshake_unexpected_failure_logs_error(monkeypatch) -> None:
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "client_user"}))
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
    assert session_manager.ended_user_ids == ["user_123"]


@pytest.mark.asyncio
async def test_cleanup_connection_swallows_session_cleanup_errors() -> None:
    task_manager = DummyTaskManager()
    session_manager = DummySessionManager(should_raise=True)

    await cleanup_connection(task_manager, session_manager, "user_456")

    assert task_manager.cleaned_user_ids == ["user_456"]
    assert session_manager.ended_user_ids == ["user_456"]
