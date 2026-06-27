"""Covers websocket route behavior in the backend test suite."""

import asyncio
import importlib

import pytest
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

websocket_route_module = importlib.import_module(
    "backend.src.api.routes.websocket.router"
)

restore_route_deps_shim(_original_deps)


class DummyConfig:
    websocket_max_message_size = 1024 * 1024
    websocket_max_concurrent_tasks = 4
    websocket_receive_timeout = 0.5
    websocket_task_cancellation_timeout = 0.1


class DummySessionManager:
    def __init__(self):
        self.config = DummyConfig()
        self.client_operating_system_calls = []
        self.update_session_config_calls = []

    def set_client_operating_system(self, user_id: str, operating_system: str) -> None:
        self.client_operating_system_calls.append((user_id, operating_system))

    async def update_session_config(self, user_id: str, updates: dict) -> None:
        self.update_session_config_calls.append((user_id, updates))


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
        self.sent_json = []
        self.__class__.instances.append(self)

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload) -> None:
        self.sent_json.append(payload)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed.append((code, reason))


class ExplodingCloseSafeWebSocket(FakeSafeWebSocket):
    async def close(
        self, code: int = 1000, reason: str | None = None
    ) -> None:  # noqa: ARG002
        raise RuntimeError("close failed")


class ExplodingSendSafeWebSocket(FakeSafeWebSocket):
    async def send_json(self, payload) -> None:
        await super().send_json(payload)
        raise RuntimeError("startup send failed")


class FakeTaskManager:
    def __init__(self, max_concurrent_tasks: int, task_cancellation_timeout: float):
        self.max_concurrent_tasks = max_concurrent_tasks
        self.task_cancellation_timeout = task_cancellation_timeout

    async def create_task_if_under_limit(
        self, coro, user_id: str, metadata=None
    ):  # noqa: ARG002
        close = getattr(coro, "close", None)
        if callable(close):
            close()
        return True

    async def cleanup(self, user_id: str) -> None:  # noqa: ARG002
        return None


@pytest.mark.asyncio
async def test_websocket_endpoint_timeout_cleans_up_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeSafeWebSocket.instances = []
    cleanup_calls: list[str] = []

    async def fake_perform_handshake(
        websocket, safe_ws, **_kwargs
    ) -> str:  # noqa: ARG001
        return "user_timeout"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ) -> None:  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def forced_timeout(awaitable, timeout):  # noqa: ARG001
        close = getattr(awaitable, "close", None)
        if callable(close):
            close()
        raise asyncio.TimeoutError()

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
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

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return None

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ):  # noqa: ARG001
        cleanup_calls.append(user_id)

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )

    await websocket_route_module.websocket_endpoint(
        websocket=DummyWebSocket(),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert cleanup_calls == []
    assert len(FakeSafeWebSocket.instances) == 1
    assert FakeSafeWebSocket.instances[0].accepted is True


@pytest.mark.asyncio
async def test_websocket_endpoint_cleans_up_when_startup_send_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeSafeWebSocket.instances = []
    session_manager = DummySessionManager()
    increment_calls: list[str] = []
    decrement_calls: list[str] = []
    end_session_calls: list[str] = []

    def increment_connection_count(user_id: str) -> None:
        increment_calls.append(user_id)

    def decrement_connection_count(user_id: str) -> int:
        decrement_calls.append(user_id)
        return 0

    async def end_session(user_id: str) -> None:
        end_session_calls.append(user_id)

    session_manager.increment_connection_count = increment_connection_count
    session_manager.decrement_connection_count = decrement_connection_count
    session_manager.end_session = end_session

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_startup_send"

    monkeypatch.setattr(
        websocket_route_module, "SafeWebSocket", ExplodingSendSafeWebSocket
    )
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )

    with pytest.raises(RuntimeError, match="startup send failed"):
        await websocket_route_module.websocket_endpoint(
            websocket=DummyWebSocket(),
            session_manager=session_manager,
            handler_registry=object(),
        )

    assert increment_calls == ["user_startup_send"]
    assert decrement_calls == ["user_startup_send"]
    assert end_session_calls == ["user_startup_send"]
    assert len(FakeSafeWebSocket.instances) == 1
    assert FakeSafeWebSocket.instances[0].closed == [(1000, None)]


@pytest.mark.asyncio
async def test_websocket_endpoint_applies_handshake_operating_system_to_session_manager(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_manager = DummySessionManager()

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        setattr(safe_ws, "client_operating_system", "Windows")
        return "user_os"

    async def forced_disconnect(awaitable, timeout):  # noqa: ARG001
        close = getattr(awaitable, "close", None)
        if callable(close):
            close()
        raise websocket_route_module.WebSocketDisconnect(code=1000)

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(websocket_route_module.asyncio, "wait_for", forced_disconnect)

    await websocket_route_module.websocket_endpoint(
        websocket=DummyWebSocket(),
        session_manager=session_manager,
        handler_registry=object(),
    )

    assert session_manager.client_operating_system_calls == [("user_os", "Windows")]


@pytest.mark.asyncio
async def test_websocket_endpoint_applies_handshake_agent_capabilities(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_manager = DummySessionManager()

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        setattr(
            safe_ws,
            "agent_capability_overrides",
            {
                "agent_available_tools": ["read_file"],
                "agent_tool_profile": "coding",
            },
        )
        return "user_capabilities"

    async def forced_disconnect(awaitable, timeout):  # noqa: ARG001
        close = getattr(awaitable, "close", None)
        if callable(close):
            close()
        raise websocket_route_module.WebSocketDisconnect(code=1000)

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(websocket_route_module.asyncio, "wait_for", forced_disconnect)

    await websocket_route_module.websocket_endpoint(
        websocket=DummyWebSocket(),
        session_manager=session_manager,
        handler_registry=object(),
    )

    assert session_manager.update_session_config_calls == [
        (
            "user_capabilities",
            {
                "agent_available_tools": ["read_file"],
                "agent_tool_profile": "coding",
            },
        )
    ]


@pytest.mark.asyncio
async def test_websocket_endpoint_sends_parse_errors_and_continues_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeSafeWebSocket.instances = []
    cleanup_calls: list[str] = []
    send_error_calls: list[tuple[object, str | None, str | None]] = []
    parse_calls: list[tuple[str, str, int]] = []

    class FakeTaskManagerNoOp(FakeTaskManager):
        async def create_task_if_under_limit(
            self, coro, user_id: str, metadata=None
        ):  # noqa: ARG002
            raise AssertionError(
                "task manager should not be called for invalid messages"
            )

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_parse_error"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ):  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(data, user_id, max_message_size):
        parse_calls.append((data, user_id, max_message_size))
        return None, "Malformed JSON"

    async def fake_send_error(
        websocket, msg_id, message=None, exception=None
    ):  # noqa: ARG001
        send_error_calls.append((websocket, msg_id, message))

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManagerNoOp)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
    monkeypatch.setattr(
        websocket_route_module,
        "parse_and_validate_message",
        fake_parse_and_validate_message,
    )
    monkeypatch.setattr(websocket_route_module, "send_error", fake_send_error)
    monkeypatch.setattr(
        websocket_route_module.asyncio, "wait_for", passthrough_wait_for
    )

    await websocket_route_module.websocket_endpoint(
        websocket=SequencedWebSocket(
            [
                '{"bad":true}',
                websocket_route_module.WebSocketDisconnect(code=1000),
            ]
        ),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert parse_calls == [('{"bad":true}', "user_parse_error", 1024 * 1024)]
    assert len(send_error_calls) == 1
    assert send_error_calls[0][1] is None
    assert send_error_calls[0][2] == "Malformed JSON"
    assert cleanup_calls == ["user_parse_error"]
    assert FakeSafeWebSocket.instances[0].closed == [(1000, None)]


@pytest.mark.asyncio
async def test_websocket_endpoint_recovers_after_parse_error_and_dispatches_next_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []
    send_error_calls: list[tuple[str | None, str | None]] = []
    handled_messages: list[tuple[str, str]] = []
    parse_call_count = {"value": 0}

    class FakeTaskManagerDispatch(FakeTaskManager):
        async def create_task_if_under_limit(self, coro, user_id: str, metadata=None):
            asyncio.create_task(coro)
            return True

    class DummyValidatedMessage:
        id = "msg_valid_after_error"
        type = "query"

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_recovery"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ):  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(
        data, user_id, max_message_size
    ):  # noqa: ARG001
        parse_call_count["value"] += 1
        if parse_call_count["value"] == 1:
            return None, "Malformed JSON"
        return DummyValidatedMessage(), None

    async def fake_send_error(
        websocket, msg_id, message=None, exception=None
    ):  # noqa: ARG001
        send_error_calls.append((msg_id, message))

    async def fake_handle_message(
        websocket, validated_msg, handler_registry, user_id
    ):  # noqa: ARG001
        handled_messages.append((validated_msg.id, user_id))

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManagerDispatch)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
    monkeypatch.setattr(
        websocket_route_module,
        "parse_and_validate_message",
        fake_parse_and_validate_message,
    )
    monkeypatch.setattr(websocket_route_module, "send_error", fake_send_error)
    monkeypatch.setattr(websocket_route_module, "handle_message", fake_handle_message)
    monkeypatch.setattr(
        websocket_route_module.asyncio, "wait_for", passthrough_wait_for
    )

    await websocket_route_module.websocket_endpoint(
        websocket=SequencedWebSocket(
            [
                '{"bad":true}',
                '{"id":"msg_valid_after_error"}',
                websocket_route_module.WebSocketDisconnect(code=1000),
            ]
        ),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    await asyncio.sleep(0)

    assert parse_call_count["value"] == 2
    assert send_error_calls == [(None, "Malformed JSON")]
    assert handled_messages == [("msg_valid_after_error", "user_recovery")]
    assert cleanup_calls == ["user_recovery"]


@pytest.mark.asyncio
async def test_websocket_endpoint_dispatches_sequential_control_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []
    parse_calls = {"value": 0}
    handled_messages: list[tuple[str, str, str]] = []

    class FakeTaskManagerSyncDispatch(FakeTaskManager):
        async def create_task_if_under_limit(
            self, coro, user_id: str, metadata=None
        ):  # noqa: ARG002
            await coro
            return True

    class DummyValidatedMessage:
        def __init__(self, msg_id: str, msg_type: str):
            self.id = msg_id
            self.type = msg_type

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_control_flow"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ):  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(
        data, user_id, max_message_size
    ):  # noqa: ARG001
        parse_calls["value"] += 1
        if parse_calls["value"] == 1:
            return DummyValidatedMessage("msg_stop_1", "stop-query"), None
        return DummyValidatedMessage("msg_rehydrate_1", "rehydrate-conversation"), None

    async def fake_handle_message(
        websocket, validated_msg, handler_registry, user_id
    ):  # noqa: ARG001
        handled_messages.append((validated_msg.id, validated_msg.type, user_id))

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(
        websocket_route_module, "TaskManager", FakeTaskManagerSyncDispatch
    )
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
    monkeypatch.setattr(
        websocket_route_module,
        "parse_and_validate_message",
        fake_parse_and_validate_message,
    )
    monkeypatch.setattr(websocket_route_module, "handle_message", fake_handle_message)
    monkeypatch.setattr(
        websocket_route_module.asyncio, "wait_for", passthrough_wait_for
    )

    await websocket_route_module.websocket_endpoint(
        websocket=SequencedWebSocket(
            [
                '{"id":"msg_stop_1","type":"stop-query"}',
                '{"id":"msg_rehydrate_1","type":"rehydrate-conversation"}',
                websocket_route_module.WebSocketDisconnect(code=1000),
            ]
        ),
        session_manager=DummySessionManager(),
        handler_registry=object(),
    )

    assert parse_calls["value"] == 2
    assert handled_messages == [
        ("msg_stop_1", "stop-query", "user_control_flow"),
        ("msg_rehydrate_1", "rehydrate-conversation", "user_control_flow"),
    ]
    assert cleanup_calls == ["user_control_flow"]


@pytest.mark.asyncio
async def test_websocket_endpoint_sends_limit_exceeded_error_with_message_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []
    send_error_calls: list[tuple[str | None, str | None]] = []
    created_task_payloads: list[tuple[object, str]] = []

    class FakeTaskManagerLimitExceeded(FakeTaskManager):
        async def create_task_if_under_limit(self, coro, user_id: str, metadata=None):
            created_task_payloads.append((coro, user_id))
            close = getattr(coro, "close", None)
            if callable(close):
                close()
            return False

        async def active_task_diagnostics(self):
            return {
                "active_count": 4,
                "max_concurrent_tasks": 4,
                "by_type": {"query": 4},
                "oldest": [],
            }

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_limited"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ):  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(
        data, user_id, max_message_size
    ):  # noqa: ARG001
        return type("Msg", (), {"id": "msg_limit_1"})(), None

    async def fake_send_error(
        websocket, msg_id, message=None, exception=None
    ):  # noqa: ARG001
        send_error_calls.append((msg_id, message))

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(
        websocket_route_module, "TaskManager", FakeTaskManagerLimitExceeded
    )
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
    monkeypatch.setattr(
        websocket_route_module,
        "parse_and_validate_message",
        fake_parse_and_validate_message,
    )
    monkeypatch.setattr(websocket_route_module, "send_error", fake_send_error)
    monkeypatch.setattr(
        websocket_route_module.asyncio, "wait_for", passthrough_wait_for
    )

    await websocket_route_module.websocket_endpoint(
        websocket=SequencedWebSocket(
            [
                '{"id":"msg_limit_1"}',
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


@pytest.mark.asyncio
async def test_websocket_endpoint_reraises_unexpected_loop_error_after_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_loop_error"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ) -> None:  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
    monkeypatch.setattr(
        websocket_route_module.asyncio, "wait_for", passthrough_wait_for
    )

    with pytest.raises(RuntimeError, match="receive exploded"):
        await websocket_route_module.websocket_endpoint(
            websocket=SequencedWebSocket([RuntimeError("receive exploded")]),
            session_manager=DummySessionManager(),
            handler_registry=object(),
        )

    assert cleanup_calls == ["user_loop_error"]


@pytest.mark.asyncio
async def test_websocket_endpoint_reraises_parse_error_send_failures_after_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []

    async def fake_perform_handshake(websocket, safe_ws, **_kwargs):  # noqa: ARG001
        return "user_send_error_fail"

    async def fake_cleanup_connection(
        task_manager, session_manager, user_id: str
    ) -> None:  # noqa: ARG001
        cleanup_calls.append(user_id)

    async def fake_parse_and_validate_message(
        data, user_id, max_message_size
    ):  # noqa: ARG001
        return None, "Malformed JSON"

    async def failing_send_error(
        websocket, msg_id, message=None, exception=None
    ):  # noqa: ARG001
        raise RuntimeError("send failed")

    async def passthrough_wait_for(awaitable, timeout):  # noqa: ARG001
        return await awaitable

    monkeypatch.setattr(websocket_route_module, "SafeWebSocket", FakeSafeWebSocket)
    monkeypatch.setattr(websocket_route_module, "TaskManager", FakeTaskManager)
    monkeypatch.setattr(
        websocket_route_module, "perform_handshake", fake_perform_handshake
    )
    monkeypatch.setattr(
        websocket_route_module, "cleanup_connection", fake_cleanup_connection
    )
    monkeypatch.setattr(
        websocket_route_module,
        "parse_and_validate_message",
        fake_parse_and_validate_message,
    )
    monkeypatch.setattr(websocket_route_module, "send_error", failing_send_error)
    monkeypatch.setattr(
        websocket_route_module.asyncio, "wait_for", passthrough_wait_for
    )

    with pytest.raises(RuntimeError, match="send failed"):
        await websocket_route_module.websocket_endpoint(
            websocket=SequencedWebSocket(['{"bad":true}']),
            session_manager=DummySessionManager(),
            handler_registry=object(),
        )

    assert cleanup_calls == ["user_send_error_fail"]
