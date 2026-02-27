from dataclasses import dataclass, field

import pytest

import backend.src.api.processing.formatter as formatter_module
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.processing.formatters.base import EventFormatter


@dataclass
class DummyEvent:
    type: str = field(default="dummy", init=False)
    content: str = "hello"


class DummyFormatter(EventFormatter):
    def format(self, event, msg_id):
        if isinstance(event, dict):
            payload = {"content": event.get("content")}
        else:
            payload = {"content": getattr(event, "content", None)}
        return {"type": "dummy-out", "id": msg_id, "payload": payload}


class NoneFormatter(EventFormatter):
    def format(self, event, msg_id):
        return None


class SharedResponseFormatter(EventFormatter):
    def __init__(self):
        self.shared = {"type": "dummy-out", "id": None, "payload": {}}

    def format(self, event, msg_id):
        self.shared["id"] = msg_id
        if isinstance(event, dict):
            self.shared["payload"]["content"] = event.get("content")
        else:
            self.shared["payload"]["content"] = getattr(event, "content", None)
        return self.shared


def _set_specs(monkeypatch, specs):
    monkeypatch.setattr(formatter_module, "get_formatter_specs", lambda: specs)


def test_response_formatter_formats_typed_event_and_attaches_context(monkeypatch):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "dummy", DummyFormatter, "dummy-out"),
        ),
    )

    formatter = ResponseFormatter()
    result = formatter.format(
        DummyEvent(content="typed"),
        "msg-1",
        context={
            "session_id": "session-1",
            "user_id": "user-1",
            "conversation_ref": "conv-1",
            "turn_ref": "turn-1",
        },
    )

    assert result == {
        "type": "dummy-out",
        "id": "msg-1",
        "payload": {"content": "typed"},
        "session_id": "session-1",
        "user_id": "user-1",
        "conversation_ref": "conv-1",
        "turn_ref": "turn-1",
    }


def test_response_formatter_formats_dict_event_via_backward_compat_path(monkeypatch):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "dummy", DummyFormatter, "dummy-out"),
        ),
    )
    formatter = ResponseFormatter()

    result = formatter.format({"type": "dummy", "content": "legacy"}, "msg-2")

    assert result == {
        "type": "dummy-out",
        "id": "msg-2",
        "payload": {"content": "legacy"},
    }


def test_response_formatter_returns_none_for_unknown_event(monkeypatch):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "dummy", DummyFormatter, "dummy-out"),
        ),
    )
    formatter = ResponseFormatter()

    assert formatter.format({"type": "unknown"}, "msg-3") is None
    assert formatter.format(object(), "msg-4") is None


def test_response_formatter_keeps_none_when_formatter_skips_event(monkeypatch):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "dummy", NoneFormatter, "dummy-out"),
        ),
    )
    formatter = ResponseFormatter()

    assert formatter.format(DummyEvent(), "msg-5", context={"session_id": "s1"}) is None


def test_response_formatter_raises_for_duplicate_event_type_specs(monkeypatch):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "duplicate-type", DummyFormatter, "dummy-out"),
            (dict, "duplicate-type", DummyFormatter, "dummy-out"),
        ),
    )

    with pytest.raises(ValueError, match="Duplicate formatter registration for type"):
        ResponseFormatter()


def test_response_formatter_raises_for_duplicate_event_class_specs(monkeypatch):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "event-one", DummyFormatter, "dummy-out"),
            (DummyEvent, "event-two", DummyFormatter, "dummy-out"),
        ),
    )

    with pytest.raises(ValueError, match="Duplicate formatter registration for class"):
        ResponseFormatter()


def test_response_formatter_does_not_mutate_shared_formatter_response_when_attaching_context(
    monkeypatch,
):
    _set_specs(
        monkeypatch,
        (
            (DummyEvent, "dummy", SharedResponseFormatter, "dummy-out"),
        ),
    )
    formatter = ResponseFormatter()

    first = formatter.format(
        DummyEvent(content="first"),
        "msg-ctx",
        context={"session_id": "session-1"},
    )
    second = formatter.format(DummyEvent(content="second"), "msg-no-ctx")

    assert first is not None
    assert first["session_id"] == "session-1"
    assert second is not None
    assert second["id"] == "msg-no-ctx"
    assert second["payload"]["content"] == "second"
    assert "session_id" not in second
