from __future__ import annotations

import json
import logging

import pytest

from backend.src.api.routes.websocket.message_parse_runtime import (
    parse_and_validate_message_runtime,
)


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_rejects_oversized_payload() -> None:
    payload = json.dumps({"id": "msg-1", "type": "query", "payload": {"text": "hello"}})
    message, error = await parse_and_validate_message_runtime(
        data=payload,
        user_id="user-1",
        max_message_size=8,
        json_parse_offload_bytes=64 * 1024,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )
    assert message is None
    assert error is not None
    assert "Message too large" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_injects_connection_user_id() -> None:
    payload = json.dumps(
        {
            "id": "msg-1",
            "type": "query",
            "payload": {"text": "hello", "conversation_ref": "conv-1"},
        }
    )
    message, error = await parse_and_validate_message_runtime(
        data=payload,
        user_id="connection-user",
        max_message_size=1024 * 1024,
        json_parse_offload_bytes=64 * 1024,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )
    assert error is None
    assert message is not None
    assert message.user_id == "connection-user"
