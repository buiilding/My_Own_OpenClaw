import json
import sys
import types

import pytest

# Test-only shim: avoid pulling full app container deps during route import.
_original_deps = sys.modules.get("backend.src.api.deps")
fake_deps = types.ModuleType("backend.src.api.deps")
fake_deps.ContainerDep = object
fake_deps.SessionManagerDep = object
fake_deps.HandlerRegistryDep = object
sys.modules["backend.src.api.deps"] = fake_deps

from backend.src.api.routes.websocket.connection import cleanup_connection, perform_handshake

if _original_deps is not None:
    sys.modules["backend.src.api.deps"] = _original_deps
else:
    sys.modules.pop("backend.src.api.deps", None)


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


@pytest.mark.asyncio
async def test_perform_handshake_returns_client_user_id() -> None:
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "client_user"}))
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id == "client_user"
    assert safe_ws.closed == []


@pytest.mark.asyncio
async def test_perform_handshake_invalid_json_closes_socket() -> None:
    websocket = DummyWebSocket("{not-json")
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


@pytest.mark.asyncio
async def test_perform_handshake_invalid_payload_closes_socket() -> None:
    websocket = DummyWebSocket(json.dumps({"type": "handshake"}))
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


@pytest.mark.asyncio
async def test_perform_handshake_invalid_user_id_closes_socket() -> None:
    websocket = DummyWebSocket(json.dumps({"type": "handshake", "user_id": "   "}))
    safe_ws = DummySafeWebSocket()

    assigned_user_id = await perform_handshake(websocket, safe_ws)

    assert assigned_user_id is None
    assert safe_ws.closed
    assert safe_ws.closed[0][0] == 1008


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
