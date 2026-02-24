import json
import sys
import types
from types import SimpleNamespace

import pytest

def _install_route_deps_shim():
    # Test-only shim: avoid pulling full app container deps during route import.
    original_deps = sys.modules.get("backend.src.api.deps")
    fake_deps = types.ModuleType("backend.src.api.deps")
    fake_deps.ContainerDep = object
    fake_deps.SessionManagerDep = object
    fake_deps.HandlerRegistryDep = object
    sys.modules["backend.src.api.deps"] = fake_deps
    return original_deps


_original_deps = _install_route_deps_shim()

from backend.src.api.routes.websocket import message_handler as mh
from backend.src.api.schema import QueryMessage, ToolBundleResultMessage

if _original_deps is not None:
    sys.modules["backend.src.api.deps"] = _original_deps
else:
    sys.modules.pop("backend.src.api.deps", None)


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
        payload={"text": "test", "conversation_ref": "conv_test"},
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

    async def fake_send_error_response(ws, msg_id, message, exception=None):
        captured["ws"] = ws
        captured["msg_id"] = msg_id
        captured["message"] = message
        captured["exception"] = exception

    monkeypatch.setattr(mh, "send_error_response", fake_send_error_response)
    return captured


@pytest.mark.asyncio
async def test_parse_and_validate_message_success() -> None:
    payload = json.dumps(
        {
            "id": "msg_1",
            "type": "query",
            "payload": {"text": "hello", "conversation_ref": "conv_test"},
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
async def test_parse_and_validate_message_rejects_oversized_payload() -> None:
    data = "x" * 20

    message, error = await mh.parse_and_validate_message(
        data, user_id="user_1", max_message_size=5
    )

    assert message is None
    assert "Message too large" in error


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
async def test_parse_and_validate_message_handles_unexpected_parse_errors(monkeypatch) -> None:
    async def raise_unexpected(*_args, **_kwargs):
        raise RuntimeError("decoder exploded")

    monkeypatch.setattr(mh, "parse_json_object_payload", raise_unexpected)

    message, error = await mh.parse_and_validate_message(
        '{"id":"msg_unexpected","type":"query","payload":{"text":"hello"}}',
        user_id="user_1",
        max_message_size=2048,
    )

    assert message is None
    assert error == "An internal error occurred"


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
async def test_parse_and_validate_message_rejects_non_object_json_root() -> None:
    payload = json.dumps(["not", "an", "object"])

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert message is None
    assert error == "Invalid message format: root must be an object, got list"


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_query_screenshot_url_field() -> None:
    payload = json.dumps(
        {
            "id": "msg_query_screenshot_url",
            "type": "query",
            "payload": {
                "text": "hello",
                "conversation_ref": "conv_test",
                "screenshot_url": "http://127.0.0.1:8765/api/artifacts/shot.jpg",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert message is None
    assert error is not None
    assert "screenshot_url" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_rejects_tool_bundle_screenshot_url_field() -> None:
    payload = json.dumps(
        {
            "id": "msg_bundle_screenshot_url",
            "type": "tool-bundle-result",
            "payload": {
                "bundle_id": "bundle-1",
                "status": "success",
                "step_results": [],
                "screenshot_url": "http://127.0.0.1:8765/api/artifacts/shot.jpg",
            },
        }
    )

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert message is None
    assert error is not None
    assert "screenshot_url" in error


@pytest.mark.asyncio
async def test_parse_and_validate_message_accepts_structured_bundle_step_output() -> None:
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
async def test_parse_and_validate_message_small_payload_parses_inline(monkeypatch) -> None:
    payload = json.dumps(
        {
            "id": "msg_inline",
            "type": "query",
            "payload": {"text": "hello", "conversation_ref": "conv_test"},
        }
    )
    monkeypatch.setattr(mh.asyncio, "get_running_loop", lambda: (_ for _ in ()).throw(RuntimeError("should not be used")))

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, QueryMessage)


@pytest.mark.asyncio
async def test_parse_and_validate_message_large_payload_uses_executor(monkeypatch) -> None:
    payload = json.dumps(
        {
            "id": "msg_large",
            "type": "query",
            "payload": {"text": "hello", "conversation_ref": "conv_test"},
        }
    )
    monkeypatch.setattr(mh, "_JSON_PARSE_OFFLOAD_BYTES", 1)

    called = {"executor": False}

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            called["executor"] = True
            return fn(data)

    monkeypatch.setattr(mh.asyncio, "get_running_loop", lambda: FakeLoop())

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=4096
    )

    assert error is None
    assert isinstance(message, QueryMessage)
    assert called["executor"] is True


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
    assert sent_errors[0][2] == "An internal error occurred"


@pytest.mark.asyncio
async def test_send_error_delegates_to_send_error_response(monkeypatch) -> None:
    websocket = SimpleNamespace()
    captured = _capture_send_error_response(monkeypatch)

    await mh.send_error(websocket, "msg_300", "boom")

    assert captured["ws"] is websocket
    assert captured["msg_id"] == "msg_300"
    assert captured["message"] == "boom"


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
