import pytest

from backend.src.agent.tools.preparation.preparer import ToolPreparer
from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    tool_call_needs_coordinate_resolution,
)
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall


class DummySession:
    def __init__(self):
        self.resolved_calls = {}

    def register_resolved_tool_call(self, request_id, resolved_call):
        self.resolved_calls[request_id] = resolved_call


async def _collect_preparation(preparer, tool_calls):
    result = await preparer.prepare(tool_calls, DummySession())
    return [], result


def _assert_single_result_with_coordinate_method(events, result, expected_method: str) -> None:
    assert events == []
    assert result is not None
    assert result.resolved_calls
    assert result.resolved_calls[0].metadata["coordinate_method"] == expected_method


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
        return None

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.preparer.resolve_tool_with_coordinates",
        fake_resolver,
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "ocr")


@pytest.mark.asyncio
async def test_prepare_mouse_control_manual_sets_coordinate_method_metadata():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 100, "y": 200},
        raw_call="{}",
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "manual")


def test_tool_call_needs_coordinate_resolution_requires_mouse_control_and_supported_method():
    assert (
        tool_call_needs_coordinate_resolution(
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"find_coordinates_by": CoordinateFindingMethod.OCR},
                raw_call="{}",
            )
        )
        is True
    )
    assert (
        tool_call_needs_coordinate_resolution(
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"find_coordinates_by": CoordinateFindingMethod.PREDICTION},
                raw_call="{}",
            )
        )
        is True
    )
    assert (
        tool_call_needs_coordinate_resolution(
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"find_coordinates_by": CoordinateFindingMethod.MANUAL},
                raw_call="{}",
            )
        )
        is False
    )
    assert (
        tool_call_needs_coordinate_resolution(
            ParsedToolCall(
                tool_name="read_file",
                parameters={"find_coordinates_by": CoordinateFindingMethod.OCR},
                raw_call="{}",
            )
        )
        is False
    )
