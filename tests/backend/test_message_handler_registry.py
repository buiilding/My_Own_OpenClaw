from __future__ import annotations

import asyncio

import pytest

from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.schema import QueryMessage


def _build_query_message() -> QueryMessage:
    return QueryMessage(
        id="msg_registry_1",
        type="query",
        user_id="user_1",
        payload={
            "text": "hello",
            "conversation_ref": "conv_1",
        },
    )


class RecordingHandler(MessageHandler):
    def __init__(self) -> None:
        self.calls = []

    async def handle(self, message, websocket, user_id: str) -> None:
        self.calls.append(
            {
                "message": message,
                "websocket": websocket,
                "user_id": user_id,
            }
        )


class RejectingHandler(RecordingHandler):
    def validate_message(self, message) -> bool:  # noqa: ARG002
        return False


class FailingHandler(RecordingHandler):
    async def handle(self, message, websocket, user_id: str) -> None:  # noqa: ARG002
        raise RuntimeError("handler boom")


@pytest.mark.asyncio
async def test_registry_awaits_async_callable_object_middleware() -> None:
    registry = MessageHandlerRegistry()
    handler = RecordingHandler()
    registry.register("query", handler)

    events: list[str] = []

    class AsyncCallableMiddleware:
        async def __call__(self, message, websocket):  # noqa: ARG002
            events.append(f"middleware:{message.id}")

    registry.add_middleware(AsyncCallableMiddleware())

    message = _build_query_message()
    websocket = object()
    await registry.handle("query", message, websocket, "user_1")

    assert events == ["middleware:msg_registry_1"]
    assert len(handler.calls) == 1


@pytest.mark.asyncio
async def test_registry_awaits_sync_middleware_returned_awaitable() -> None:
    registry = MessageHandlerRegistry()
    handler = RecordingHandler()
    registry.register("query", handler)

    state = {"awaited": False}

    async def mark_awaited() -> None:
        await asyncio.sleep(0)
        state["awaited"] = True

    def sync_middleware(message, websocket):  # noqa: ARG001
        return mark_awaited()

    registry.add_middleware(sync_middleware)

    await registry.handle("query", _build_query_message(), object(), "user_1")

    assert state["awaited"] is True
    assert len(handler.calls) == 1


@pytest.mark.asyncio
async def test_registry_fail_closed_on_middleware_exception() -> None:
    registry = MessageHandlerRegistry()
    handler = RecordingHandler()
    registry.register("query", handler)

    def failing_middleware(message, websocket):  # noqa: ARG001
        raise RuntimeError("middleware boom")

    registry.add_middleware(failing_middleware)

    with pytest.raises(RuntimeError, match="middleware boom"):
        await registry.handle("query", _build_query_message(), object(), "user_1")

    assert handler.calls == []


def test_registry_register_overwrites_existing_handler_for_same_message_type() -> None:
    registry = MessageHandlerRegistry()
    first = RecordingHandler()
    second = RecordingHandler()

    registry.register("query", first)
    registry.register("query", second)

    assert registry.get_handler("query") is second
    assert registry.list_handlers() == ["query"]


def test_registry_unregister_returns_status_and_removes_handler() -> None:
    registry = MessageHandlerRegistry()
    registry.register("query", RecordingHandler())

    assert registry.unregister("query") is True
    assert registry.get_handler("query") is None
    assert registry.unregister("query") is False


def test_registry_list_handlers_preserves_registration_order() -> None:
    registry = MessageHandlerRegistry()
    registry.register("query", RecordingHandler())
    registry.register("tool-result", RecordingHandler())
    registry.register("update-settings", RecordingHandler())

    assert registry.list_handlers() == ["query", "tool-result", "update-settings"]


@pytest.mark.asyncio
async def test_registry_handle_raises_for_missing_handler() -> None:
    registry = MessageHandlerRegistry()

    with pytest.raises(ValueError, match="No handler registered for message type: query"):
        await registry.handle("query", _build_query_message(), object(), "user_1")


@pytest.mark.asyncio
async def test_registry_handle_raises_when_validation_fails() -> None:
    registry = MessageHandlerRegistry()
    handler = RejectingHandler()
    registry.register("query", handler)

    with pytest.raises(ValueError, match="Invalid message data for type: query"):
        await registry.handle("query", _build_query_message(), object(), "user_1")

    assert handler.calls == []


@pytest.mark.asyncio
async def test_registry_handle_propagates_handler_exceptions() -> None:
    registry = MessageHandlerRegistry()
    registry.register("query", FailingHandler())

    with pytest.raises(RuntimeError, match="handler boom"):
        await registry.handle("query", _build_query_message(), object(), "user_1")
