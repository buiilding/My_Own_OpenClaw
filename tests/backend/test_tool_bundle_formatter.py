from backend.src.api.processing.formatters.tool_bundle import ToolBundleEventFormatter
from backend.src.core.events.streaming_events import ToolBundleEvent


def test_tool_bundle_formatter_from_event():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="b1", tools=[{"name": "read_file"}])

    result = formatter.format(event, "msg-1")

    assert result["type"] == "tool-bundle"
    assert result["id"] == "msg-1"
    assert result["payload"]["bundle_id"] == "b1"
    assert result["payload"]["tools"] == [{"name": "read_file"}]


def test_tool_bundle_formatter_from_dict():
    formatter = ToolBundleEventFormatter()
    event = {"bundle_id": "b2", "tools": ["x"]}

    result = formatter.format(event, "msg-2")

    assert result["payload"]["bundle_id"] == "b2"
    assert result["payload"]["tools"] == ["x"]


def test_tool_bundle_formatter_dict_defaults_when_fields_missing():
    formatter = ToolBundleEventFormatter()

    result = formatter.format({}, "msg-3")

    assert result == {
        "type": "tool-bundle",
        "id": "msg-3",
        "payload": {
            "bundle_id": "",
            "tools": [],
        },
    }


def test_tool_bundle_formatter_typed_event_with_empty_tools():
    formatter = ToolBundleEventFormatter()
    event = ToolBundleEvent(bundle_id="bundle-empty", tools=[])

    result = formatter.format(event, "msg-4")

    assert result["payload"]["bundle_id"] == "bundle-empty"
    assert result["payload"]["tools"] == []


def test_tool_bundle_formatter_dict_preserves_explicit_none_tools():
    formatter = ToolBundleEventFormatter()
    event = {"bundle_id": "b-none", "tools": None}

    result = formatter.format(event, "msg-5")

    assert result["payload"]["bundle_id"] == "b-none"
    assert result["payload"]["tools"] is None
