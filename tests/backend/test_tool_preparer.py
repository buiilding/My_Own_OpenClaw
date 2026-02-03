import pytest

from backend.src.agent.tools.preparation.preparer import ToolPreparer
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall


class DummySession:
    pass


async def _collect_preparation(preparer, tool_calls):
    events = []
    result = None
    async for event, final in preparer.prepare_tools(tool_calls, DummySession()):
        if event is not None:
            events.append(event)
        if final is not None:
            result = final
    return events, result


@pytest.mark.asyncio
async def test_prepare_single_tool_assigns_request_id():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(tool_name="read_file", parameters={}, raw_call="{}")

    events, result = await _collect_preparation(preparer, [tool_call])

    assert events == []
    assert result is not None
    assert result.bundle_id is None
    assert "request_id" in tool_call.metadata
    assert result.resolved_calls[0].metadata["request_id"] == tool_call.metadata["request_id"]


@pytest.mark.asyncio
async def test_prepare_bundle_assigns_bundle_id():
    preparer = ToolPreparer(object(), object(), object())
    calls = [
        ParsedToolCall(tool_name="read_file", parameters={}, raw_call="{}"),
        ParsedToolCall(tool_name="write_file", parameters={}, raw_call="{}"),
    ]

    _events, result = await _collect_preparation(preparer, calls)

    assert result is not None
    assert result.bundle_id is not None
    for call in calls:
        assert call.metadata["bundle_id"] == result.bundle_id
    for resolved in result.resolved_calls:
        assert resolved.metadata["bundle_id"] == result.bundle_id


@pytest.mark.asyncio
async def test_prepare_mouse_control_uses_coordinate_resolution(monkeypatch):
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": CoordinateFindingMethod.OCR},
        raw_call="{}",
    )

    async def fake_resolver(*_args, **_kwargs):
        yield "event"

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.preparer.resolve_tool_with_coordinates",
        fake_resolver,
    )

    events, result = await _collect_preparation(preparer, [tool_call])

    assert events == ["event"]
    assert result is not None
    assert result.resolved_calls
