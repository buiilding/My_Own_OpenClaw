"""Covers tool bundle formatter behavior in the backend test suite."""

from backend.src.api.processing.formatters.tool_bundle import ToolBundleEventFormatter
from backend.src.api.schemas.outgoing import ToolBundleMessage
from backend.src.core.events.streaming_events import ToolBundleEvent


def test_tool_bundle_formatter_from_event():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="b1", tools=[{"name": "read_file", "args": {}}])

    result = formatter.format(event, "msg-1")

    assert result["type"] == "tool-bundle"
    assert result["id"] == "msg-1"
    assert result["payload"]["bundle_id"] == "b1"
    assert result["payload"]["tools"] == [{"name": "read_file", "args": {}}]
    parsed = ToolBundleMessage.model_validate({**result, "user_id": "user-1"})
    assert parsed.payload.bundle_id == "b1"


def test_tool_bundle_formatter_from_event_with_tools():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="b2", tools=[{"name": "read_file", "args": {}}])

    result = formatter.format(event, "msg-2")

    assert result["payload"]["bundle_id"] == "b2"
    assert result["payload"]["tools"] == [{"name": "read_file", "args": {}}]


def test_tool_bundle_formatter_skips_when_fields_missing():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id=None, tools=[])

    result = formatter.format(event, "msg-3")

    assert result is None


def test_tool_bundle_formatter_typed_event_with_empty_tools():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="bundle-empty", tools=[])

    result = formatter.format(event, "msg-4")

    assert result["payload"]["bundle_id"] == "bundle-empty"
    assert result["payload"]["tools"] == []


def test_tool_bundle_formatter_skips_explicit_none_tools():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="b-none", tools=None)

    result = formatter.format(event, "msg-5")

    assert result is None


def test_tool_bundle_formatter_skips_non_list_tools():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="b-string", tools="not-a-list")

    result = formatter.format(event, "msg-6")

    assert result is None


def test_tool_bundle_formatter_skips_invalid_tool_items():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="b-invalid-item", tools=["read_file"])

    result = formatter.format(event, "msg-7")

    assert result is None
