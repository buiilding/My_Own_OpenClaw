from __future__ import annotations

from typing import Any, Optional

import pytest
from fastapi import WebSocketDisconnect

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


class RuntimeFailingWebSocket(FakeWebSocket):
    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        raise RuntimeError("socket write failed")


class DisconnectingWebSocket(FakeWebSocket):
    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        raise WebSocketDisconnect(code=1001)


def test_sanitize_error_message_returns_validation_error_message() -> None:
    exc = ValidationError("Invalid model_mode value")
    assert sanitize_error_message(exc) == "Invalid model_mode value"


def test_sanitize_error_message_exposes_safe_value_error_keywords() -> None:
    exc = ValueError("Invalid payload format")
    assert sanitize_error_message(exc) == "Invalid payload format"


def test_sanitize_error_message_exposes_safe_key_error_keywords() -> None:
    exc = KeyError("missing required key: user_id")
    assert sanitize_error_message(exc) == "'missing required key: user_id'"


def test_sanitize_error_message_hides_unsafe_value_error_details() -> None:
    exc = ValueError("database DSN password leaked")
    assert sanitize_error_message(exc) == "An internal error occurred"


def test_sanitize_error_message_exposes_not_allowed_keyword_case_insensitive() -> None:
    exc = ValueError("Operation Not Allowed for this user")
    assert sanitize_error_message(exc) == "Operation Not Allowed for this user"


def test_sanitize_error_message_applies_context_for_internal_errors() -> None:
    exc = RuntimeError("traceback details")
    assert sanitize_error_message(exc, context="registry") == "registry: An internal error occurred"


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
async def test_send_error_response_uses_provided_message_when_no_exception() -> None:
    websocket = FakeWebSocket()

    await send_error_response(
        websocket=websocket,
        msg_id="msg_err_2",
        message="safe validation error",
    )

    assert websocket.sent == [
        {
            "type": "error",
            "id": "msg_err_2",
            "payload": {"message": "safe validation error"},
        }
    ]


@pytest.mark.asyncio
async def test_send_error_response_respects_custom_error_type() -> None:
    websocket = FakeWebSocket()

    await send_error_response(
        websocket=websocket,
        msg_id="msg_err_custom",
        message="validation failed",
        error_type="validation-error",
    )

    assert websocket.sent == [
        {
            "type": "validation-error",
            "id": "msg_err_custom",
            "payload": {"message": "validation failed"},
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
async def test_send_success_response_without_context_uses_base_envelope() -> None:
    websocket = FakeWebSocket()

    await send_success_response(
        websocket=websocket,
        msg_id="msg_ok_2",
        response_type="settings-loaded",
        payload={"config": {"theme": "dark"}},
    )

    assert websocket.sent == [
        {
            "type": "settings-loaded",
            "id": "msg_ok_2",
            "payload": {"config": {"theme": "dark"}},
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


@pytest.mark.asyncio
async def test_send_helpers_swallow_runtime_send_failures() -> None:
    websocket = RuntimeFailingWebSocket()

    await send_error_response(
        websocket=websocket,
        msg_id="msg_err_runtime",
        message="safe error",
    )
    await send_success_response(
        websocket=websocket,
        msg_id="msg_ok_runtime",
        response_type="settings-loaded",
        payload={"config": {}},
    )


@pytest.mark.asyncio
async def test_send_helpers_swallow_websocket_disconnect() -> None:
    websocket = DisconnectingWebSocket()

    await send_error_response(
        websocket=websocket,
        msg_id="msg_err_disconnect",
        message="safe error",
    )
    await send_success_response(
        websocket=websocket,
        msg_id="msg_ok_disconnect",
        response_type="settings-loaded",
        payload={"config": {}},
    )
