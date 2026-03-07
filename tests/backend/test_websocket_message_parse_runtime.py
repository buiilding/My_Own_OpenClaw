from __future__ import annotations

import json
import logging

import pytest

from backend.src.api.routes.websocket.message_parse_runtime import (
    parse_and_validate_message_runtime,
)
from backend.src.api.routes.websocket.json_parse import JsonRootTypeError


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


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_forwards_parser_dependencies() -> None:
    captured: dict[str, object] = {}

    async def fake_parse_json_object_payload(
        data: str,
        *,
        offload_threshold_bytes: int,
        loop_getter,
    ):
        captured["data"] = data
        captured["offload_threshold_bytes"] = offload_threshold_bytes
        captured["loop_getter"] = loop_getter
        return {
            "id": "msg-forwarded",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv-forwarded",
            },
        }

    fake_loop_getter = lambda: None

    message, error = await parse_and_validate_message_runtime(
        data='{"id":"msg-forwarded","type":"query","payload":{"text":"hello","conversation_ref":"conv-forwarded"}}',
        user_id="connection-user",
        max_message_size=1024 * 1024,
        json_parse_offload_bytes=12345,
        parse_json_object_payload_fn=fake_parse_json_object_payload,
        loop_getter=fake_loop_getter,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )

    assert error is None
    assert message is not None
    assert message.id == "msg-forwarded"
    assert captured["offload_threshold_bytes"] == 12345
    assert captured["loop_getter"] is fake_loop_getter


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_maps_json_decode_error() -> None:
    async def raise_json_decode_error(*_args, **_kwargs):
        raise json.JSONDecodeError("bad-json", doc="{bad", pos=1)

    message, error = await parse_and_validate_message_runtime(
        data="{bad-json",
        user_id="user-1",
        max_message_size=1024 * 1024,
        json_parse_offload_bytes=64 * 1024,
        parse_json_object_payload_fn=raise_json_decode_error,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )

    assert message is None
    assert error == "Malformed JSON"


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_maps_non_object_json_root() -> None:
    async def raise_root_type_error(*_args, **_kwargs):
        raise JsonRootTypeError(payload_type="list")

    message, error = await parse_and_validate_message_runtime(
        data='["not","an","object"]',
        user_id="user-1",
        max_message_size=1024 * 1024,
        json_parse_offload_bytes=64 * 1024,
        parse_json_object_payload_fn=raise_root_type_error,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )

    assert message is None
    assert error == "Invalid message format: root must be an object, got list"


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_maps_unexpected_errors_to_internal_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def raise_unexpected(*_args, **_kwargs):
        raise RuntimeError("decoder exploded")

    logger = logging.getLogger("test.websocket.message_parse_runtime")
    with caplog.at_level(logging.ERROR):
        message, error = await parse_and_validate_message_runtime(
            data='{"id":"msg-unexpected","type":"query","payload":{"text":"hello"}}',
            user_id="user-1",
            max_message_size=1024 * 1024,
            json_parse_offload_bytes=64 * 1024,
            parse_json_object_payload_fn=raise_unexpected,
            logger=logger,
        )

    assert message is None
    assert error == "An internal error occurred"
    assert any("Unexpected error parsing message" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_rejects_tool_result_missing_request_id() -> None:
    payload = json.dumps(
        {
            "id": "msg-tool-result-missing-request-id",
            "type": "tool-result",
            "payload": {
                "success": True,
                "data": {"llm_content": "ok"},
            },
        }
    )

    message, error = await parse_and_validate_message_runtime(
        data=payload,
        user_id="user-1",
        max_message_size=1024 * 1024,
        json_parse_offload_bytes=64 * 1024,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )

    assert message is None
    assert error is not None
    assert "Invalid message format:" in error
    assert "payload.request_id" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_runtime_rejects_tool_bundle_result_non_list_step_results() -> None:
    payload = json.dumps(
        {
            "id": "msg-tool-bundle-invalid-step-results",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-1",
                "status": "success",
                "step_results": {"tool": "read_file"},
            },
        }
    )

    message, error = await parse_and_validate_message_runtime(
        data=payload,
        user_id="user-1",
        max_message_size=1024 * 1024,
        json_parse_offload_bytes=64 * 1024,
        logger=logging.getLogger("test.websocket.message_parse_runtime"),
    )

    assert message is None
    assert error is not None
    assert "Invalid message format:" in error
    assert "payload.step_results" in error
