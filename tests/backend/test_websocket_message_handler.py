"""Covers websocket message handler behavior in the backend test suite."""

import json
from types import SimpleNamespace

import pytest
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.websocket import message_handler as mh
from backend.src.api.schemas.incoming import (
    QueryMessage,
    ToolBundleResultMessage,
    ToolResultMessage,
)
from backend.src.core.infrastructure.user_facing_errors import (
    INTERNAL_SERVER_ERROR_MESSAGE,
)

restore_route_deps_shim(_original_deps)


class DummyRegistry:
    def __init__(self, exc: Exception | None = None):
        self.exc = exc
        self.calls = []

    async def handle(self, msg_type, message, websocket, user_id):
        self.calls.append((msg_type, message, websocket, user_id))
        if self.exc:
            raise self.exc


def _query_message(message_id: str) -> QueryMessage:
    return QueryMessage(
        id=message_id,
        type="query",
        user_id="user_1",
        payload={
            "text": "test",
            "conversation_ref": "conv_test",
            "content": "<user_query>\ntest\n</user_query>",
        },
    )


def _capture_logger_calls(monkeypatch):
    warning_calls = []
    error_calls = []
    monkeypatch.setattr(
        mh.logger,
        "warning",
        lambda *args, **kwargs: warning_calls.append((args, kwargs)),
    )
    monkeypatch.setattr(
        mh.logger,
        "error",
        lambda *args, **kwargs: error_calls.append((args, kwargs)),
    )
    return warning_calls, error_calls


def _capture_send_error_calls(monkeypatch):
    sent_errors = []

    async def fake_send_error(ws, msg_id, error_message):
        sent_errors.append((ws, msg_id, error_message))

    monkeypatch.setattr(mh, "send_error", fake_send_error)
    return sent_errors


def _capture_send_error_response(monkeypatch):
    captured = {}

    async def fake_send_error_response(
        ws,
        msg_id,
        message,
        exception=None,
        user_facing=False,
    ):
        captured["ws"] = ws
        captured["msg_id"] = msg_id
        captured["message"] = message
        captured["exception"] = exception
        captured["user_facing"] = user_facing

    monkeypatch.setattr(mh, "send_error_response", fake_send_error_response)
    return captured


@pytest.mark.asyncio
async def test_parse_and_validate_message_success() -> None:
    payload = json.dumps(
        {
            "id": "msg_1",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>\nhello\n</user_query>",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert error is None
    assert isinstance(message, QueryMessage)
    assert message.user_id == "user_1"
    assert message.payload.text == "hello"


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_missing_prepared_content() -> None:
    payload = json.dumps(
        {
            "id": "msg_missing_content",
            "type": "query",
            "payload": {"text": "hello", "conversation_ref": "conv_test"},
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert message is None
    assert error is not None
    assert "payload.content" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_query_payload_turn_ref() -> None:
    payload = json.dumps(
        {
            "id": "turn_1",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>\nhello\n</user_query>",
                "turn_ref": " turn_1 ",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert message is None
    assert error is not None
    assert "payload.turn_ref" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_sdk_prepared_content() -> None:
    payload = json.dumps(
        {
            "id": "transport_1",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>\nhello\n</user_query>",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert error is None
    assert isinstance(message, QueryMessage)
    assert message.payload.content == "<user_query>\nhello\n</user_query>"


@pytest.mark.asyncio
async def test_parse_and_validate_message_overrides_client_user_id_with_connection_user_id() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_user_override",
            "type": "query",
            "user_id": "attacker_user",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>\nhello\n</user_query>",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="trusted_user", max_message_size=1024
    )

    assert error is None
    assert isinstance(message, QueryMessage)
    assert message.user_id == "trusted_user"


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_oversized_payload() -> None:
    data = "x" * 20

    message, error = await mh.parse_and_validate_message(
        data, user_id="user_1", max_message_size=5
    )

    assert message is None
    assert "Message too large" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_enforces_utf8_byte_size_limit() -> None:
    payload = json.dumps(
        {
            "id": "msg_unicode_size",
            "type": "query",
            "payload": {
                "text": "🙂" * 30,
                "conversation_ref": "conv_test",
            },
        },
        ensure_ascii=False,
    )
    max_message_size = len(payload)
    assert len(payload.encode("utf-8")) > max_message_size

    message, error = await mh.parse_and_validate_message(
        payload,
        user_id="user_1",
        max_message_size=max_message_size,
    )

    assert message is None
    assert error is not None
    assert "Message too large" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_payload_at_exact_utf8_byte_limit() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_unicode_exact",
            "type": "query",
            "payload": {
                "text": "🙂" * 10,
                "conversation_ref": "conv_test",
                "content": "<user_query>hello</user_query>",
            },
        },
        ensure_ascii=False,
    )
    max_message_size = len(payload.encode("utf-8"))

    message, error = await mh.parse_and_validate_message(
        payload,
        user_id="user_1",
        max_message_size=max_message_size,
    )

    assert error is None
    assert isinstance(message, QueryMessage)


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_payload_at_exact_size_limit() -> None:
    payload = json.dumps(
        {
            "id": "msg_exact_size",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>hello</user_query>",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload,
        user_id="user_1",
        max_message_size=len(payload),
    )

    assert error is None
    assert isinstance(message, QueryMessage)


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_malformed_json() -> None:
    message, error = await mh.parse_and_validate_message(
        "{bad-json",
        user_id="user_1",
        max_message_size=2048,
    )

    assert message is None
    assert error == "Malformed JSON"


@pytest.mark.asyncio
async def test_parse_and_validate_message_returns_multiple_validation_details() -> None:
    payload = json.dumps({"type": "query", "payload": {}})

    message, error = await mh.parse_and_validate_message(
        payload,
        user_id="user_1",
        max_message_size=1024,
    )

    assert message is None
    assert error is not None
    assert "Invalid message format:" in error
    assert "id" in error
    assert "payload.text" in error
    assert ";" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_includes_indexed_nested_validation_paths() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_nested_invalid",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-1",
                "status": "success",
                "step_results": [{}],
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload,
        user_id="user_1",
        max_message_size=2048,
    )

    assert message is None
    assert error is not None
    assert "Invalid message format:" in error
    assert "payload.step_results.0.tool" in error
    assert "payload.step_results.0.status" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_delegates_to_runtime_parser(
    monkeypatch,
) -> None:
    captured = {}

    async def fake_parse_runtime(
        *,
        data: str,
        user_id: str,
        max_message_size: int,
        json_parse_offload_bytes: int,
        parse_json_object_payload_fn,
        loop_getter,
        logger,
    ):
        captured["data"] = data
        captured["user_id"] = user_id
        captured["max_message_size"] = max_message_size
        captured["json_parse_offload_bytes"] = json_parse_offload_bytes
        captured["parse_json_object_payload_fn"] = parse_json_object_payload_fn
        captured["loop_getter"] = loop_getter
        captured["logger"] = logger
        return None, INTERNAL_SERVER_ERROR_MESSAGE

    monkeypatch.setattr(mh, "parse_and_validate_message_runtime", fake_parse_runtime)

    message, error = await mh.parse_and_validate_message(
        '{"id":"msg_delegate","type":"query","payload":{"text":"hello"}}',
        user_id="user_1",
        max_message_size=2048,
    )

    assert message is None
    assert error == INTERNAL_SERVER_ERROR_MESSAGE
    assert captured["user_id"] == "user_1"
    assert captured["max_message_size"] == 2048
    assert captured["json_parse_offload_bytes"] == mh._JSON_PARSE_OFFLOAD_BYTES
    assert callable(captured["parse_json_object_payload_fn"])
    assert callable(captured["loop_getter"])
    assert captured["logger"] is mh.logger


@pytest.mark.asyncio
async def test_parse_and_validate_message_returns_validation_error() -> None:
    payload = json.dumps({"type": "query", "payload": {"text": "hello"}})

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert message is None
    assert error is not None
    assert "Invalid message format" in error


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {
            "id": "msg_query_whitespace_conversation",
            "type": "query",
            "payload": {"text": "hello", "conversation_ref": "   "},
        },
        {
            "id": "msg_rehydrate_whitespace_conversation",
            "type": "rehydrate-conversation",
            "payload": {
                "conversation_ref": " \t ",
                "messages": [
                    {
                        "role": "user",
                        "content": "hi",
                    }
                ],
                "rehydrate_mode": "replace",
            },
        },
    ],
    ids=["query", "rehydrate-conversation"],
)
async def test_parse_and_validate_message_rejects_whitespace_conversation_ref(
    payload: dict,
) -> None:
    message, error = await mh.parse_and_validate_message(
        json.dumps(payload),
        user_id="user_1",
        max_message_size=4096,
    )

    assert message is None
    assert error is not None
    assert "conversation_ref" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_non_object_json_root() -> None:
    payload = json.dumps(["not", "an", "object"])

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert message is None
    assert error == "Invalid message format: root must be an object, got list"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {
            "id": "msg_query_screenshot_url",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>hello</user_query>",
                "screenshot_url": "http://127.0.0.1:8765/api/artifacts/shot.jpg",
            },
        },
        {
            "id": "msg_query_inline_screenshot",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "content": "<user_query>hello</user_query>",
                "screenshot": "inline-base64",
            },
        },
        {
            "id": "msg_rehydrate_inline_screenshot",
            "type": "rehydrate-conversation",
            "payload": {
                "conversation_ref": "conv_test",
                "rehydrate_mode": "replace",
                "messages": [
                    {
                        "role": "user",
                        "content": "hello",
                        "message_type": "user_query",
                        "screenshot": "inline-base64",
                    }
                ],
            },
        },
        {
            "id": "msg_rehydrate_image_data",
            "type": "rehydrate-conversation",
            "payload": {
                "conversation_ref": "conv_test",
                "rehydrate_mode": "replace",
                "messages": [
                    {
                        "role": "user",
                        "content": "hello",
                        "message_type": "user_query",
                        "image_data": "inline-base64",
                    }
                ],
            },
        },
        {
            "id": "msg_bundle_screenshot_url",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-1",
                "status": "success",
                "step_results": [],
                "screenshot_url": "http://127.0.0.1:8765/api/artifacts/shot.jpg",
            },
        },
    ],
    ids=[
        "query-screenshot-url",
        "query-inline-screenshot",
        "rehydrate-inline-screenshot",
        "rehydrate-image-data",
        "tool-bundle-result",
    ],
)
async def test_parse_and_validate_message_rejects_removed_screenshot_fields(
    payload: dict,
) -> None:
    message, error = await mh.parse_and_validate_message(
        json.dumps(payload),
        user_id="user_1",
        max_message_size=4096,
    )

    assert message is None
    assert error is not None
    assert "screenshot" in error or "image_data" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_structured_bundle_step_output() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_bundle_output",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-structured-1",
                "status": "success",
                "step_results": [
                    {
                        "tool": "run_shell_command",
                        "status": "ok",
                        "output": {"stdout": "line-1", "exit_code": 0},
                        "debug_trace": "trace-1",
                    }
                ],
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, ToolBundleResultMessage)
    assert message.payload.bundle_id == "bundle-structured-1"
    serialized_step = message.payload.step_results[0].model_dump()
    assert serialized_step["output"] == {"stdout": "line-1", "exit_code": 0}
    assert serialized_step["debug_trace"] == "trace-1"


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_tool_result_contract_payload() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_tool_result_contract",
            "type": "tool-result",
            "payload": {
                "request_id": "req-tool-1",
                "success": True,
                "data": {
                    "output": "ok",
                    "system_state": {
                        "active_window": "Terminal",
                        "mouse_position": "(10, 20)",
                    },
                    "capture_meta": {
                        "source_w": 1920,
                        "source_h": 1080,
                        "crop_x": 0,
                        "crop_y": 0,
                        "crop_w": 1920,
                        "crop_h": 1080,
                        "timestamp": 1700000000000,
                        "capture_engine": "linux_gnome_screenshot_include_pointer",
                    },
                    "screenshot_ref": "artifact-1.png",
                    "output": "ok",
                },
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, ToolResultMessage)
    serialized = message.payload.data.model_dump()
    assert serialized["system_state"] == {
        "active_window": "Terminal",
        "mouse_position": "(10, 20)",
    }
    assert serialized["capture_meta"]["capture_engine"] == (
        "linux_gnome_screenshot_include_pointer"
    )
    assert serialized["screenshot_ref"] == "artifact-1.png"
    assert serialized["output"] == "ok"


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_sdk_failed_tool_result_payload() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_sdk_failed_tool_result",
            "type": "tool-result",
            "payload": {
                "request_id": "req-sdk-failed-1",
                "success": False,
                "data": {
                    "output": "Tool execution failed: denied by local policy",
                },
                "error": "denied by local policy",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, ToolResultMessage)
    assert message.payload.request_id == "req-sdk-failed-1"
    assert message.payload.success is False
    assert message.payload.error == "denied by local policy"
    assert message.payload.data.output == (
        "Tool execution failed: denied by local policy"
    )


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_sdk_bundle_result_payload() -> None:
    payload = json.dumps(
        {
            "id": "msg_sdk_bundle_result",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-sdk-1",
                "status": "partial_failure",
                "step_results": [
                    {
                        "tool": "read_file",
                        "status": "ok",
                        "output": {"output": "read ok"},
                    },
                    {
                        "tool": "run_shell_command",
                        "status": "error",
                        "output": {"error": "exit code 1"},
                    },
                ],
                "error": "1 bundled tool step(s) failed",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, ToolBundleResultMessage)
    assert message.payload.bundle_id == "bundle-sdk-1"
    assert message.payload.status == "partial_failure"
    assert [step.status for step in message.payload.step_results] == ["ok", "error"]
    assert message.payload.step_results[1].output == {"error": "exit code 1"}
    assert message.payload.error == "1 bundled tool step(s) failed"


@pytest.mark.asyncio
async def test_parse_and_validate_message_trims_tool_result_request_id() -> None:
    payload = json.dumps(
        {
            "id": "msg_tool_result_trimmed_request_id",
            "type": "tool-result",
            "payload": {
                "request_id": "  req-tool-trimmed  ",
                "success": True,
                "data": {
                    "output": "ok",
                },
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, ToolResultMessage)
    assert message.payload.request_id == "req-tool-trimmed"


@pytest.mark.asyncio
async def test_parse_and_validate_message_trims_tool_bundle_result_bundle_id() -> None:
    payload = json.dumps(
        {
            "id": "msg_tool_bundle_result_trimmed_bundle_id",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "  bundle-trimmed  ",
                "status": "success",
                "step_results": [],
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, ToolBundleResultMessage)
    assert message.payload.bundle_id == "bundle-trimmed"


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_tool_result_system_state_without_mouse_position() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_tool_result_bad_state",
            "type": "tool-result",
            "payload": {
                "request_id": "req-tool-2",
                "success": True,
                "data": {
                    "output": "ok",
                    "system_state": {
                        "active_window": "Terminal",
                    },
                },
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert message is None
    assert error is not None
    assert "payload.data.system_state.mouse_position" in error


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload, expected_field",
    [
        (
            {
                "id": "msg_tool_result_whitespace_request_id",
                "type": "tool-result",
                "payload": {
                    "request_id": " \t ",
                    "success": True,
                    "data": {"output": "ok"},
                },
            },
            "payload.request_id",
        ),
        (
            {
                "id": "msg_tool_bundle_result_whitespace_bundle_id",
                "type": "tool-bundle-result",
                "payload": {
                    "bundle_id": " \n ",
                    "status": "success",
                    "step_results": [],
                },
            },
            "payload.bundle_id",
        ),
    ],
    ids=["tool-result", "tool-bundle-result"],
)
async def test_parse_and_validate_message_rejects_whitespace_tool_result_correlation_ids(
    payload: dict,
    expected_field: str,
) -> None:
    message, error = await mh.parse_and_validate_message(
        json.dumps(payload),
        user_id="user_1",
        max_message_size=4096,
    )

    assert message is None
    assert error is not None
    assert expected_field in error


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload, expected_field",
    [
        (
            {
                "id": "msg_tool_result_non_string_request_id",
                "type": "tool-result",
                "payload": {
                    "request_id": 123,
                    "success": True,
                    "data": {"output": "ok"},
                },
            },
            "payload.request_id",
        ),
        (
            {
                "id": "msg_tool_bundle_result_non_string_bundle_id",
                "type": "tool-bundle-result",
                "payload": {
                    "bundle_id": 456,
                    "status": "success",
                    "step_results": [],
                },
            },
            "payload.bundle_id",
        ),
    ],
    ids=["tool-result", "tool-bundle-result"],
)
async def test_parse_and_validate_message_rejects_non_string_tool_result_correlation_ids(
    payload: dict,
    expected_field: str,
) -> None:
    message, error = await mh.parse_and_validate_message(
        json.dumps(payload),
        user_id="user_1",
        max_message_size=4096,
    )

    assert message is None
    assert error is not None
    assert expected_field in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_tool_bundle_result_missing_step_results() -> (
    None
):
    payload = json.dumps(
        {
            "id": "msg_tool_bundle_result_missing_step_results",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-missing-steps",
                "status": "success",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload,
        user_id="user_1",
        max_message_size=4096,
    )

    assert message is None
    assert error is not None
    assert "payload.step_results" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_passes_default_offload_threshold_to_runtime(
    monkeypatch,
) -> None:
    captured = {}

    async def fake_parse_runtime(
        *,
        data: str,
        user_id: str,
        max_message_size: int,
        json_parse_offload_bytes: int,
        parse_json_object_payload_fn,
        loop_getter,
        logger,
    ):
        captured["json_parse_offload_bytes"] = json_parse_offload_bytes
        return _query_message("msg_inline"), None

    monkeypatch.setattr(mh, "parse_and_validate_message_runtime", fake_parse_runtime)

    message, error = await mh.parse_and_validate_message(
        '{"id":"msg_inline","type":"query","payload":{"text":"hello","conversation_ref":"conv_test"}}',
        user_id="user_1",
        max_message_size=4096,
    )

    assert error is None
    assert isinstance(message, QueryMessage)
    assert captured["json_parse_offload_bytes"] == mh._JSON_PARSE_OFFLOAD_BYTES


@pytest.mark.asyncio
async def test_parse_and_validate_message_passes_overridden_offload_threshold_to_runtime(
    monkeypatch,
) -> None:
    monkeypatch.setattr(mh, "_JSON_PARSE_OFFLOAD_BYTES", 1)
    captured = {}

    async def fake_parse_runtime(
        *,
        data: str,
        user_id: str,
        max_message_size: int,
        json_parse_offload_bytes: int,
        parse_json_object_payload_fn,
        loop_getter,
        logger,
    ):
        captured["json_parse_offload_bytes"] = json_parse_offload_bytes
        return _query_message("msg_large"), None

    monkeypatch.setattr(mh, "parse_and_validate_message_runtime", fake_parse_runtime)

    message, error = await mh.parse_and_validate_message(
        '{"id":"msg_large","type":"query","payload":{"text":"hello","conversation_ref":"conv_test"}}',
        user_id="user_1",
        max_message_size=4096,
    )

    assert error is None
    assert isinstance(message, QueryMessage)
    assert captured["json_parse_offload_bytes"] == 1


@pytest.mark.asyncio
async def test_handle_message_routes_to_registry() -> None:
    registry = DummyRegistry()
    websocket = SimpleNamespace()
    message = _query_message("msg_100")

    await mh.handle_message(websocket, message, registry, "user_1")

    assert len(registry.calls) == 1
    assert registry.calls[0][0] == "query"


@pytest.mark.asyncio
async def test_handle_message_sends_value_error_message(monkeypatch) -> None:
    registry = DummyRegistry(exc=ValueError("bad request"))
    websocket = SimpleNamespace()
    message = _query_message("msg_101")
    sent_errors = _capture_send_error_calls(monkeypatch)

    await mh.handle_message(websocket, message, registry, "user_1")

    assert sent_errors == [(websocket, "msg_101", "bad request")]


@pytest.mark.asyncio
async def test_handle_message_sends_sanitized_unexpected_error(monkeypatch) -> None:
    registry = DummyRegistry(exc=RuntimeError("sensitive stack details"))
    websocket = SimpleNamespace()
    message = _query_message("msg_102")
    sent_errors = _capture_send_error_calls(monkeypatch)

    await mh.handle_message(websocket, message, registry, "user_1")

    assert len(sent_errors) == 1
    assert sent_errors[0][1] == "msg_102"
    assert sent_errors[0][2] == INTERNAL_SERVER_ERROR_MESSAGE


@pytest.mark.asyncio
async def test_send_error_delegates_to_send_error_response(monkeypatch) -> None:
    websocket = SimpleNamespace()
    captured = _capture_send_error_response(monkeypatch)

    await mh.send_error(websocket, "msg_300", "boom")

    assert captured["ws"] is websocket
    assert captured["msg_id"] == "msg_300"
    assert captured["message"] == "boom"
    assert captured["user_facing"] is True


@pytest.mark.asyncio
async def test_send_error_forwards_exception_when_provided(monkeypatch) -> None:
    websocket = SimpleNamespace()
    captured = _capture_send_error_response(monkeypatch)
    error = RuntimeError("sensitive")

    await mh.send_error(websocket, "msg_301", "ignored message", exception=error)

    assert captured["ws"] is websocket
    assert captured["msg_id"] == "msg_301"
    assert captured["message"] == "ignored message"
    assert captured["exception"] is error
    assert captured["user_facing"] is False


@pytest.mark.asyncio
async def test_send_error_defaults_to_empty_message_when_none(monkeypatch) -> None:
    websocket = SimpleNamespace()
    captured = _capture_send_error_response(monkeypatch)

    await mh.send_error(websocket, "msg_302", None)

    assert captured["message"] == ""
    assert captured["exception"] is None
    assert captured["user_facing"] is True


@pytest.mark.asyncio
async def test_handle_message_uses_sanitize_error_message_result(monkeypatch) -> None:
    registry = DummyRegistry(exc=RuntimeError("raw exception"))
    websocket = SimpleNamespace()
    message = _query_message("msg_105")
    sent_errors = _capture_send_error_calls(monkeypatch)
    monkeypatch.setattr(mh, "sanitize_error_message", lambda _e: "sanitized")

    await mh.handle_message(websocket, message, registry, "user_1")

    assert sent_errors == [(websocket, "msg_105", "sanitized")]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("message_id", "registry_error", "expected_warning_count", "expected_error_count"),
    [
        ("msg_103", ValueError("bad request"), 1, 0),
        ("msg_104", RuntimeError("unexpected"), 0, 1),
    ],
)
async def test_handle_message_does_not_raise_if_send_error_fails(
    monkeypatch,
    message_id: str,
    registry_error: Exception,
    expected_warning_count: int,
    expected_error_count: int,
) -> None:
    registry = DummyRegistry(exc=registry_error)
    websocket = SimpleNamespace()
    message = _query_message(message_id)

    async def failing_send_error(_ws, _msg_id, _error_message):
        raise RuntimeError("socket already closed")

    monkeypatch.setattr(mh, "send_error", failing_send_error)
    warning_calls, error_calls = _capture_logger_calls(monkeypatch)

    # Should swallow send_error failure and not raise.
    await mh.handle_message(websocket, message, registry, "user_1")
    assert len(warning_calls) == expected_warning_count
    assert len(error_calls) == expected_error_count


@pytest.mark.asyncio
async def test_send_error_with_fallback_logging_uses_warning_for_non_critical_failures(
    monkeypatch,
) -> None:
    warning_calls, _error_calls = _capture_logger_calls(monkeypatch)

    async def failing_send_error(_ws, _msg_id, _error_message):
        raise RuntimeError("socket already closed")

    monkeypatch.setattr(mh, "send_error", failing_send_error)

    await mh._send_error_with_fallback_logging(
        websocket=SimpleNamespace(),
        msg_id="msg_warn",
        user_id="user_1",
        message="validation failed",
        critical=False,
    )

    assert len(warning_calls) == 1
    assert (
        "Failed to send %serror response to user %s (msg_id=%s): %s"
        in warning_calls[0][0][0]
    )


@pytest.mark.asyncio
async def test_send_error_with_fallback_logging_uses_error_for_critical_failures(
    monkeypatch,
) -> None:
    _warning_calls, error_calls = _capture_logger_calls(monkeypatch)

    async def failing_send_error(_ws, _msg_id, _error_message):
        raise RuntimeError("socket already closed")

    monkeypatch.setattr(mh, "send_error", failing_send_error)

    await mh._send_error_with_fallback_logging(
        websocket=SimpleNamespace(),
        msg_id="msg_crit",
        user_id="user_1",
        message="internal error",
        critical=True,
    )

    assert len(error_calls) == 1
    assert (
        "Failed to send %serror response to user %s (msg_id=%s): %s"
        in error_calls[0][0][0]
    )
