import asyncio

import pytest
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

import backend.src.api.routes.websocket as websocket_route_module

restore_route_deps_shim(_original_deps)


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


class SequencedWebSocket:
    def __init__(self, events):
        self._events = list(events)
        self._index = 0

    async def receive_text(self) -> str:
        if self._index >= len(self._events):
            raise RuntimeError("no more events")
        current = self._events[self._index]
        self._index += 1
        if isinstance(current, Exception):
            raise current
        return current


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

    async def create_task_if_under_limit(self, coro, user_id: str):  # noqa: ARG002
        close = getattr(coro, "close", None)
        if callable(close):
            close()
        return None, False


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


@pytest.mark.asyncio
async def test_websocket_endpoint_returns_early_when_handshake_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeSafeWebSocket.instances = []
    cleanup_calls: list[str] = []

    async def fake_perform_handshake(websocket, safe_ws):  # noqa: ARG001
        return None

    async def fake_cleanup_connection(task_manager, session_manager, user_id: str):  # noqa: ARG001
        cleanup_calls.append(user_id)

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(websocket_route_module, "perform_handshake", fake_perform_handshake)
    monkeypatch.setattr(websocket_route_module, "cleanup_connection", fake_cleanup_connection)

    await websocket_route_module.websocket_endpoint(
        websocket=DummyWebSocket(),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert cleanup_calls == []
    assert len(FakeSafeWebSocket.instances) == 1
    assert FakeSafeWebSocket.instances[0].accepted is True


@pytest.mark.asyncio
async def test_websocket_endpoint_sends_parse_errors_and_continues_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []
    send_error_calls: list[tuple[object, str | None, str | None]] = []
    parse_calls: list[tuple[str, str, int]] = []

    class FakeTaskManagerNoOp(FakeTaskManager):
        async def create_task_if_under_limit(self, coro, user_id: str):  # noqa: ARG002
            raise AssertionError("task manager should not be called for invalid messages")

    async def fake_perform_handshake(websocket, safe_ws):  # noqa: ARG001
        return "user_parse_error"

    async def fake_cleanup_connection(task_manager, session_manager, user_id: str):  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(data, user_id, max_message_size):
        parse_calls.append((data, user_id, max_message_size))
        return None, "Malformed JSON"

    async def fake_send_error(websocket, msg_id, message=None, exception=None):  # noqa: ARG001
        send_error_calls.append((websocket, msg_id, message))

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManagerNoOp)
    monkeypatch.setattr(websocket_route_module, "perform_handshake", fake_perform_handshake)
    monkeypatch.setattr(websocket_route_module, "cleanup_connection", fake_cleanup_connection)
    monkeypatch.setattr(websocket_route_module, "parse_and_validate_message", fake_parse_and_validate_message)
    monkeypatch.setattr(websocket_route_module, "send_error", fake_send_error)
    monkeypatch.setattr(websocket_route_module.asyncio, "wait_for", passthrough_wait_for)

    await websocket_route_module.websocket_endpoint(
        websocket=SequencedWebSocket(
            [
                "{\"bad\":true}",
                websocket_route_module.WebSocketDisconnect(code=1000),
            ]
        ),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert parse_calls == [("{\"bad\":true}", "user_parse_error", 1024 * 1024)]
    assert len(send_error_calls) == 1
    assert send_error_calls[0][1] is None
    assert send_error_calls[0][2] == "Malformed JSON"
    assert cleanup_calls == ["user_parse_error"]


@pytest.mark.asyncio
async def test_websocket_endpoint_sends_limit_exceeded_error_with_message_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []
    send_error_calls: list[tuple[str | None, str | None]] = []
    created_task_payloads: list[tuple[object, str]] = []

    class FakeTaskManagerLimitExceeded(FakeTaskManager):
        async def create_task_if_under_limit(self, coro, user_id: str):
            created_task_payloads.append((coro, user_id))
            close = getattr(coro, "close", None)
            if callable(close):
                close()
            return None, True

    async def fake_perform_handshake(websocket, safe_ws):  # noqa: ARG001
        return "user_limited"

    async def fake_cleanup_connection(task_manager, session_manager, user_id: str):  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(data, user_id, max_message_size):  # noqa: ARG001
        return type("Msg", (), {"id": "msg_limit_1"})(), None

    async def fake_send_error(websocket, msg_id, message=None, exception=None):  # noqa: ARG001
        send_error_calls.append((msg_id, message))

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManagerLimitExceeded)
    monkeypatch.setattr(websocket_route_module, "perform_handshake", fake_perform_handshake)
    monkeypatch.setattr(websocket_route_module, "cleanup_connection", fake_cleanup_connection)
    monkeypatch.setattr(websocket_route_module, "parse_and_validate_message", fake_parse_and_validate_message)
    monkeypatch.setattr(websocket_route_module, "send_error", fake_send_error)
    monkeypatch.setattr(websocket_route_module.asyncio, "wait_for", passthrough_wait_for)

    await websocket_route_module.websocket_endpoint(
        websocket=SequencedWebSocket(
            [
                "{\"id\":\"msg_limit_1\"}",
                websocket_route_module.WebSocketDisconnect(code=1000),
            ]
        ),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert len(created_task_payloads) == 1
    assert created_task_payloads[0][1] == "user_limited"
    assert send_error_calls == [
        ("msg_limit_1", "Too many concurrent requests. Please wait."),
    ]
    assert cleanup_calls == ["user_limited"]
