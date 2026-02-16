import asyncio
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

import backend.src.api.routes.websocket as websocket_route_module

if _original_deps is not None:
    sys.modules["backend.src.api.deps"] = _original_deps
else:
    sys.modules.pop("backend.src.api.deps", None)


class DummyConfig:
    websocket_max_message_size = 1024 * 1024
    websocket_max_concurrent_tasks = 4
    websocket_receive_timeout = 0.5
    websocket_task_cancellation_timeout = 0.1


class DummySessionManager:
    def __init__(self):
        self.config = DummyConfig()


class DummyWebSocket:
    async def receive_text(self) -> str:
        return "unused"


class FakeSafeWebSocket:
    instances = []

    def __init__(self, websocket):
        self.websocket = websocket
        self.accepted = False
        self.closed = []
        self.__class__.instances.append(self)

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed.append((code, reason))


class FakeTaskManager:
    def __init__(self, max_concurrent_tasks: int, task_cancellation_timeout: float):
        self.max_concurrent_tasks = max_concurrent_tasks
        self.task_cancellation_timeout = task_cancellation_timeout


@pytest.mark.asyncio
async def test_websocket_endpoint_timeout_cleans_up_once(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSafeWebSocket.instances = []
    cleanup_calls: list[str] = []

    async def fake_perform_handshake(websocket, safe_ws) -> str:  # noqa: ARG001
        return "user_timeout"

    async def fake_cleanup_connection(task_manager, session_manager, user_id: str) -> None:  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def forced_timeout(awaitable, timeout):  # noqa: ARG001
        close = getattr(awaitable, "close", None)
        if callable(close):
            close()
        raise asyncio.TimeoutError()

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(websocket_route_module, "perform_handshake", fake_perform_handshake)
    monkeypatch.setattr(websocket_route_module, "cleanup_connection", fake_cleanup_connection)
    monkeypatch.setattr(websocket_route_module.asyncio, "wait_for", forced_timeout)

    await websocket_route_module.websocket_endpoint(
        websocket=DummyWebSocket(),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert cleanup_calls == ["user_timeout"]
    assert len(FakeSafeWebSocket.instances) == 1
    assert FakeSafeWebSocket.instances[0].accepted is True
    assert FakeSafeWebSocket.instances[0].closed == [
        (1008, "Connection timeout - no data received")
    ]
