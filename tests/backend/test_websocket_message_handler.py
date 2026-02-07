import json
import sys
import types
from types import SimpleNamespace

import pytest

# Test-only shim: avoid pulling full app container deps during route import.
_original_deps = sys.modules.get("backend.src.api.deps")
fake_deps = types.ModuleType("backend.src.api.deps")
fake_deps.ContainerDep = object
fake_deps.SessionManagerDep = object
fake_deps.HandlerRegistryDep = object
sys.modules["backend.src.api.deps"] = fake_deps

from backend.src.api.routes.websocket import message_handler as mh
from backend.src.api.schema import QueryMessage

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


@pytest.mark.asyncio
async def test_parse_and_validate_message_success() -> None:
    payload = json.dumps(
        {
            "id": "msg_1",
            "type": "query",
            "payload": {"text": "hello"},
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
async def test_parse_and_validate_message_returns_validation_error() -> None:
    payload = json.dumps({"type": "query", "payload": {"text": "hello"}})

    message, error = await mh.parse_and_validate_message(
        payload, user_id="user_1", max_message_size=1024
    )

    assert message is None
    assert error is not None
    assert "Invalid message format" in error


@pytest.mark.asyncio
async def test_handle_message_routes_to_registry() -> None:
    registry = DummyRegistry()
    websocket = SimpleNamespace()
    message = QueryMessage(
        id="msg_100",
        type="query",
        user_id="user_1",
        payload={"text": "test"},
    )

    await mh.handle_message(websocket, message, registry, "user_1")

    assert len(registry.calls) == 1
    assert registry.calls[0][0] == "query"


@pytest.mark.asyncio
async def test_handle_message_sends_value_error_message(monkeypatch) -> None:
    registry = DummyRegistry(exc=ValueError("bad request"))
    websocket = SimpleNamespace()
    message = QueryMessage(
        id="msg_101",
        type="query",
        user_id="user_1",
        payload={"text": "test"},
    )
    sent_errors = []

    async def fake_send_error(ws, msg_id, error_message):
        sent_errors.append((ws, msg_id, error_message))

    monkeypatch.setattr(mh, "send_error", fake_send_error)

    await mh.handle_message(websocket, message, registry, "user_1")

    assert sent_errors == [(websocket, "msg_101", "bad request")]


@pytest.mark.asyncio
async def test_handle_message_sends_sanitized_unexpected_error(monkeypatch) -> None:
    registry = DummyRegistry(exc=RuntimeError("sensitive stack details"))
    websocket = SimpleNamespace()
    message = QueryMessage(
        id="msg_102",
        type="query",
        user_id="user_1",
        payload={"text": "test"},
    )
    sent_errors = []

    async def fake_send_error(ws, msg_id, error_message):
        sent_errors.append((ws, msg_id, error_message))

    monkeypatch.setattr(mh, "send_error", fake_send_error)

    await mh.handle_message(websocket, message, registry, "user_1")

    assert len(sent_errors) == 1
    assert sent_errors[0][1] == "msg_102"
    assert sent_errors[0][2] == "An internal error occurred"


@pytest.mark.asyncio
async def test_send_error_delegates_to_send_error_response(monkeypatch) -> None:
    websocket = SimpleNamespace()
    captured = {}

    async def fake_send_error_response(ws, msg_id, message, exception=None):
        captured["ws"] = ws
        captured["msg_id"] = msg_id
        captured["message"] = message
        captured["exception"] = exception

    monkeypatch.setattr(mh, "send_error_response", fake_send_error_response)

    await mh.send_error(websocket, "msg_300", "boom")

    assert captured["ws"] is websocket
    assert captured["msg_id"] == "msg_300"
    assert captured["message"] == "boom"


@pytest.mark.asyncio
async def test_handle_message_does_not_raise_if_send_error_fails_for_value_error(monkeypatch) -> None:
    registry = DummyRegistry(exc=ValueError("bad request"))
    websocket = SimpleNamespace()
    message = QueryMessage(
        id="msg_103",
        type="query",
        user_id="user_1",
        payload={"text": "test"},
    )

    async def failing_send_error(_ws, _msg_id, _error_message):
        raise RuntimeError("socket already closed")

    monkeypatch.setattr(mh, "send_error", failing_send_error)

    # Should swallow send_error failure and not raise.
    await mh.handle_message(websocket, message, registry, "user_1")


@pytest.mark.asyncio
async def test_handle_message_does_not_raise_if_send_error_fails_for_unexpected_error(monkeypatch) -> None:
    registry = DummyRegistry(exc=RuntimeError("unexpected"))
    websocket = SimpleNamespace()
    message = QueryMessage(
        id="msg_104",
        type="query",
        user_id="user_1",
        payload={"text": "test"},
    )

    async def failing_send_error(_ws, _msg_id, _error_message):
        raise RuntimeError("socket already closed")

    monkeypatch.setattr(mh, "send_error", failing_send_error)

    # Should swallow send_error failure and not raise.
    await mh.handle_message(websocket, message, registry, "user_1")
