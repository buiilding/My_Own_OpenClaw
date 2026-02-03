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
