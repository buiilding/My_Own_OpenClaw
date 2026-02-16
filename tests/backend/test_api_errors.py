from __future__ import annotations

from typing import Any, Optional

import pytest

from backend.src.api.infrastructure.errors import (
    sanitize_error_message,
    send_error_response,
    send_success_response,
)
from backend.src.core.validation.validators import ValidationError


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        self.sent.append(data)

    async def send_text(self, data: str) -> None:  # noqa: ARG002
        return None

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:  # noqa: ARG002
        return None


class FailingWebSocket(FakeWebSocket):
    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        raise ConnectionError("closed")


def test_sanitize_error_message_returns_validation_error_message() -> None:
    exc = ValidationError("Invalid model_mode value")
    assert sanitize_error_message(exc) == "Invalid model_mode value"


@pytest.mark.asyncio
async def test_send_error_response_sanitizes_internal_exception() -> None:
    websocket = FakeWebSocket()

    await send_error_response(
        websocket=websocket,
        msg_id="msg_err_1",
        message="raw message should be ignored",
        exception=RuntimeError("internal details"),
    )

    assert websocket.sent == [
        {
            "type": "error",
            "id": "msg_err_1",
            "payload": {"message": "An internal error occurred"},
        }
    ]


@pytest.mark.asyncio
async def test_send_success_response_attaches_context_fields() -> None:
    websocket = FakeWebSocket()

    await send_success_response(
        websocket=websocket,
        msg_id="msg_ok_1",
        response_type="settings-updated",
        payload={"updated_keys": ["model_provider"]},
        context={
            "user_id": "user_1",
            "session_id": "session_1",
            "conversation_ref": "conv_1",
            "turn_ref": "turn_1",
        },
    )

    assert websocket.sent == [
        {
            "type": "settings-updated",
            "id": "msg_ok_1",
            "payload": {"updated_keys": ["model_provider"]},
            "user_id": "user_1",
            "session_id": "session_1",
            "conversation_ref": "conv_1",
            "turn_ref": "turn_1",
        }
    ]


@pytest.mark.asyncio
async def test_send_helpers_swallow_closed_connection_errors() -> None:
    websocket = FailingWebSocket()

    await send_error_response(
        websocket=websocket,
        msg_id="msg_err_closed",
        message="safe error",
    )
    await send_success_response(
        websocket=websocket,
        msg_id="msg_ok_closed",
        response_type="settings-loaded",
        payload={"config": {}},
    )
