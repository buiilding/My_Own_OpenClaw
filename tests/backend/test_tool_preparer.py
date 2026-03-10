import pytest

from backend.src.agent.tools.preparation.preparer import ToolPreparer
from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    tool_call_has_manual_coordinates,
    tool_call_needs_coordinate_resolution,
)
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.computer.schemas import KeyboardControlArgs, MouseControlArgs


class DummySession:
    def __init__(self):
        self.resolved_calls = {}
        self._screenshot = "fake-shot"
        self._screenshot_id = "shot-prepare"
        self._capture_meta = {
            "screenshot_id": "shot-prepare",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        }

    def register_resolved_tool_call(self, request_id, resolved_call):
        self.resolved_calls[request_id] = resolved_call

    def get_current_screenshot_id(self):
        return self._screenshot_id

    def get_screenshot(self):
        return self._screenshot

    def get_current_capture_meta(self):
        return dict(self._capture_meta)


class _ArgsModelTool:
    def __init__(self, args_model):
        self.args_model = args_model


class DummyToolRegistry:
    def __init__(self, mapping):
        self._mapping = mapping

    def get_tool(self, tool_name):
        return self._mapping.get(tool_name)


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
async def test_prepare_scroll_control_uses_coordinate_resolution(monkeypatch):
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="scroll_control",
        parameters={"action": "scroll_down", "find_coordinates_by": CoordinateFindingMethod.PREDICTION},
        raw_call="{}",
    )

    async def fake_resolver(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.preparer.resolve_tool_with_coordinates",
        fake_resolver,
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "prediction")


@pytest.mark.asyncio
async def test_prepare_mouse_control_manual_sets_coordinate_method_metadata():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "x": 100,
            "y": 200,
            "screenshot_id": "shot-prepare",
        },
        raw_call="{}",
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "manual")


@pytest.mark.asyncio
async def test_prepare_scroll_control_manual_sets_coordinate_method_metadata():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="scroll_control",
        parameters={"action": "scroll_down", "x": 100, "y": 200},
        raw_call="{}",
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "manual")


@pytest.mark.asyncio
async def test_prepare_mouse_control_manual_without_screenshot_id_uses_current_frame():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 100, "y": 200},
        raw_call="{}",
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "manual")


@pytest.mark.asyncio
async def test_prepare_single_invalid_computer_use_tool_returns_preparation_error():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="invalid_computer_use_tool",
        parameters={"action": "click", "x": 1, "y": 2},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.bundle_id is None
    assert result.resolved_calls == []
    assert len(result.errors) == 1
    failed_call, error_message = result.errors[0]
    assert failed_call is tool_call
    assert "computer_use call is invalid" in error_message
    assert "request_id" in tool_call.metadata


@pytest.mark.asyncio
async def test_prepare_bundle_invalid_computer_use_tool_returns_bundle_error_without_resolved_calls():
    preparer = ToolPreparer(object(), object(), object())
    first_call = ParsedToolCall(
        tool_name="invalid_computer_use_tool",
        parameters={"action": "click"},
        raw_call="{}",
    )
    second_call = ParsedToolCall(
        tool_name="read_file",
        parameters={"file_path": "/tmp/a"},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [first_call, second_call])

    assert result is not None
    assert result.bundle_id is not None
    assert result.resolved_calls == []
    assert len(result.errors) == 1
    failed_call, error_message = result.errors[0]
    assert failed_call is first_call
    assert "computer_use call is invalid" in error_message
    assert first_call.metadata["bundle_id"] == result.bundle_id


def test_tool_call_needs_coordinate_resolution_supports_grounded_mouse_and_scroll_tools():
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
                tool_name="scroll_control",
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


def test_tool_call_has_manual_coordinates_accepts_float_coordinates():
    assert (
        tool_call_has_manual_coordinates(
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"find_coordinates_by": "manual", "x": 100.0, "y": 200.0},
                raw_call="{}",
            )
        )
        is True
    )
    assert (
        tool_call_has_manual_coordinates(
            ParsedToolCall(
                tool_name="scroll_control",
                parameters={"find_coordinates_by": "manual", "x": 10.0, "y": 20.0},
                raw_call="{}",
            )
        )
        is True
    )


def test_tool_call_has_manual_coordinates_rejects_bool_coordinates():
    assert (
        tool_call_has_manual_coordinates(
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"find_coordinates_by": "manual", "x": True, "y": 20},
                raw_call="{}",
            )
        )
        is False
    )


@pytest.mark.asyncio
async def test_prepare_rejects_invalid_keyboard_tool_call_before_frontend_dispatch():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "keyboard_control": _ArgsModelTool(KeyboardControlArgs),
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="keyboard_control",
        parameters={},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.resolved_calls == []
    assert len(result.errors) == 1
    failed_call, error_message = result.errors[0]
    assert failed_call is tool_call
    assert "rejected before frontend execution" in error_message
    assert "action" in error_message.lower()


@pytest.mark.asyncio
async def test_prepare_validates_and_sanitizes_resolved_mouse_payload(monkeypatch):
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "mouse_control": _ArgsModelTool(MouseControlArgs),
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "find_coordinates_by": CoordinateFindingMethod.OCR,
            "ocr_text": "Submit",
        },
        raw_call="{}",
    )

    async def fake_resolver(*_args, **_kwargs):
        resolved_call = _args[1]
        resolved_call.parameters["x"] = 320
        resolved_call.parameters["y"] = 180

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.preparer.resolve_tool_with_coordinates",
        fake_resolver,
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.errors == []
    assert result.resolved_calls[0].parameters == {
        "action": "click",
        "x": 320,
        "y": 180,
    }
