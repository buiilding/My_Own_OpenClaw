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
