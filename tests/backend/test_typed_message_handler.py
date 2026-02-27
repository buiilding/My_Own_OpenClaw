from __future__ import annotations

import pytest

from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schema import QueryMessage, StopQueryMessage


def _build_query_message() -> QueryMessage:
    return QueryMessage(
        id="msg_typed_1",
        type="query",
        user_id="user_1",
        payload={
            "text": "hello",
            "conversation_ref": "conv_1",
        },
    )


def _build_stop_query_message() -> StopQueryMessage:
    return StopQueryMessage(
        id="msg_typed_2",
        type="stop-query",
        user_id="user_1",
        payload={},
    )


class RecordingTypedQueryHandler(TypedMessageHandler[QueryMessage]):
    message_model = QueryMessage

    def __init__(self) -> None:
        self.calls: list[tuple[QueryMessage, object, str]] = []

    async def handle_typed(
        self,
        message: QueryMessage,
        websocket,
        user_id: str,
    ) -> None:
        self.calls.append((message, websocket, user_id))


def test_typed_message_handler_validate_message_checks_declared_model() -> None:
    handler = RecordingTypedQueryHandler()

    assert handler.validate_message(_build_query_message()) is True
    assert handler.validate_message(_build_stop_query_message()) is False


@pytest.mark.asyncio
async def test_typed_message_handler_dispatches_to_handle_typed() -> None:
    handler = RecordingTypedQueryHandler()
    websocket = object()
    message = _build_query_message()

    await handler.handle(message, websocket, "user_1")

    assert handler.calls == [(message, websocket, "user_1")]


@pytest.mark.asyncio
async def test_typed_message_handler_rejects_wrong_message_type() -> None:
    handler = RecordingTypedQueryHandler()

    with pytest.raises(TypeError, match="Expected QueryMessage, got StopQueryMessage"):
        await handler.handle(_build_stop_query_message(), object(), "user_1")
