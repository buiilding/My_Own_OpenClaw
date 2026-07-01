"""Covers tool preparer behavior in the backend test suite."""

import pytest

from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    resolve_tool_with_coordinates,
    tool_call_has_manual_coordinates,
    tool_call_needs_coordinate_resolution,
)
from backend.src.agent.tools.preparation.preparer import ToolPreparer
from backend.src.agent.tools.preparation.types.resolved_tool_call import (
    ResolvedToolCall,
)
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall
from backend.src.tools.browser.shared_contract_loader import (
    load_shared_browser_contract,
)
from backend.src.tools.computer.schemas import (
    GroundedMouseActionArgs,
    GroundedScrollActionArgs,
    KeyboardControlArgs,
    MouseControlArgs,
)
from backend.src.tools.system.schemas import GetOpenWindowsArgs
from backend.src.tools.web_search.schemas import WebSearchArgs

BrowserControlArgs = load_shared_browser_contract().BrowserControlArgs


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


class NoScreenshotSession(DummySession):
    def __init__(self):
        super().__init__()
        self._screenshot = None
        self._screenshot_id = None
        self._capture_meta = None

    def get_current_capture_meta(self):
        return self._capture_meta


class _ArgsModelTool:
    def __init__(self, args_model, execution_target="local_runtime"):
        self.args_model = args_model
        self.execution_target = execution_target


class DummyToolRegistry:
    def __init__(self, mapping):
        self._mapping = mapping

    def get_tool(self, tool_name):
        return self._mapping.get(tool_name)


class DummyScreenshotManager:
    def __init__(self):
        self.sessions = []

    async def ensure_screenshot(self, session):
        self.sessions.append(session)


class DummyOcrCoordinator:
    def __init__(self, results=None):
        self.results = [] if results is None else results
        self.calls = []

    async def get_ocr_results(self, session, screenshot_data, screenshot_id):
        self.calls.append((session, screenshot_data, screenshot_id))
        return self.results


class DummyCoordinateResolver:
    def __init__(self, coordinates):
        self.coordinates = coordinates
        self.calls = []

    async def resolve(
        self,
        tool_call,
        screenshot_data,
        ocr_results,
        vision_service,
        *,
        screenshot_id=None,
    ):
        self.calls.append(
            (tool_call, screenshot_data, ocr_results, vision_service, screenshot_id)
        )
        return self.coordinates


async def _collect_preparation(preparer, tool_calls):
    result = await preparer.prepare(tool_calls, DummySession())
    return [], result


async def _collect_preparation_for_session(preparer, tool_calls, session):
    result = await preparer.prepare(tool_calls, session)
    return [], result


@pytest.mark.asyncio
async def test_prepare_empty_tool_batch_returns_empty_result():
    preparer = ToolPreparer(object(), object(), object())

    events, result = await _collect_preparation(preparer, [])

    assert events == []
    assert result.resolved_calls == []
    assert result.errors == []
    assert result.bundle_id is None


def _assert_single_result_with_coordinate_method(
    events, result, expected_method: str
) -> None:
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
    assert (
        result.resolved_calls[0].metadata["request_id"]
        == tool_call.metadata["request_id"]
    )


@pytest.mark.asyncio
async def test_prepare_local_runtime_tool_skips_backend_arg_validation():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "browser": _ArgsModelTool(
                    BrowserControlArgs,
                    execution_target="local_runtime",
                )
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="browser",
        parameters={"action": "click", "text": "Sign in"},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result.errors == []
    assert len(result.resolved_calls) == 1
    assert result.resolved_calls[0].parameters == {"action": "click", "text": "Sign in"}


@pytest.mark.asyncio
async def test_prepare_backend_tool_keeps_backend_arg_validation():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {"web_search": _ArgsModelTool(WebSearchArgs, execution_target="backend")}
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="web_search",
        parameters={},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert len(result.errors) == 1
    assert "web_search call is invalid" in result.errors[0][1]
    assert "before backend execution" in result.errors[0][1]


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
async def test_prepare_bundle_registers_resolved_steps_with_stable_ids():
    preparer = ToolPreparer(object(), object(), object())
    session = DummySession()
    calls = [
        ParsedToolCall(tool_name="read_file", parameters={}, raw_call="{}"),
        ParsedToolCall(tool_name="write_file", parameters={}, raw_call="{}"),
    ]

    result = await preparer.prepare(calls, session)

    assert result.errors == []
    assert result.bundle_id is not None
    assert list(session.resolved_calls) == [
        f"{result.bundle_id}:step:1",
        f"{result.bundle_id}:step:2",
    ]
    assert list(session.resolved_calls.values()) == result.resolved_calls
    for resolved in result.resolved_calls:
        assert resolved.metadata["bundle_id"] == result.bundle_id
        assert "request_id" not in resolved.metadata


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
        parameters={
            "action": "scroll_down",
            "find_coordinates_by": CoordinateFindingMethod.PREDICTION,
        },
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
async def test_prepare_grounded_mouse_action_rewrites_to_executor_tool(monkeypatch):
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="grounded_mouse_action",
        parameters={
            "action": "click",
            "ocr_text": "Submit",
            "explanation": "Click the submit button.",
        },
        raw_call="{}",
    )

    async def fake_resolver(*_args, **_kwargs):
        resolved_call = _args[1]
        resolved_call.parameters["x"] = 10
        resolved_call.parameters["y"] = 20
        resolved_call.tool_name = "mouse_control"
        resolved_call.parameters.pop("ocr_text", None)

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.preparer.resolve_tool_with_coordinates",
        fake_resolver,
    )

    events, result = await _collect_preparation(preparer, [tool_call])

    _assert_single_result_with_coordinate_method(events, result, "ocr")
    assert result.resolved_calls[0].tool_name == "mouse_control"


@pytest.mark.asyncio
async def test_prepare_grounded_scroll_action_rewrites_to_executor_tool(monkeypatch):
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="grounded_scroll_action",
        parameters={
            "action": "scroll_down",
            "source_description": "the main feed",
            "explanation": "Scroll the feed.",
        },
        raw_call="{}",
    )

    async def fake_resolver(*_args, **_kwargs):
        resolved_call = _args[1]
        resolved_call.parameters["x"] = 10
        resolved_call.parameters["y"] = 20
        resolved_call.tool_name = "scroll_control"
        resolved_call.parameters.pop("source_description", None)

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.preparer.resolve_tool_with_coordinates",
        fake_resolver,
    )

    events, result = await _collect_preparation(preparer, [tool_call])

    _assert_single_result_with_coordinate_method(events, result, "prediction")
    assert result.resolved_calls[0].tool_name == "scroll_control"


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
async def test_prepare_mouse_control_manual_preserves_coordinate_method_metadata():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 100, "y": 200},
        raw_call="{}",
    )

    events, result = await _collect_preparation(preparer, [tool_call])
    _assert_single_result_with_coordinate_method(events, result, "manual")


@pytest.mark.asyncio
async def test_prepare_mouse_control_manual_without_frame_passes_coordinates_through():
    preparer = ToolPreparer(object(), object(), object())
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 100, "y": 200},
        raw_call="{}",
    )
    session = NoScreenshotSession()

    _events, result = await _collect_preparation_for_session(
        preparer,
        [tool_call],
        session,
    )

    assert result.errors == []
    assert len(result.resolved_calls) == 1
    resolved_call = result.resolved_calls[0]
    assert resolved_call.parameters == {"action": "click", "x": 100, "y": 200}
    assert resolved_call.metadata["coordinate_method"] == "manual"
    assert "coordinate_resolution_screenshot_id" not in resolved_call.metadata
    assert "coordinate_contract" not in resolved_call.metadata


@pytest.mark.asyncio
async def test_prepare_bundle_manual_mouse_without_frame_does_not_block_keyboard_tool():
    preparer = ToolPreparer(object(), object(), object())
    mouse_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 100, "y": 200},
        raw_call="{}",
    )
    keyboard_call = ParsedToolCall(
        tool_name="keyboard_control",
        parameters={"action": "press", "key": "enter"},
        raw_call="{}",
    )
    session = NoScreenshotSession()

    _events, result = await _collect_preparation_for_session(
        preparer,
        [mouse_call, keyboard_call],
        session,
    )

    assert result.errors == []
    assert result.bundle_id is not None
    assert [call.tool_name for call in result.resolved_calls] == [
        "mouse_control",
        "keyboard_control",
    ]
    assert result.resolved_calls[0].parameters == {
        "action": "click",
        "x": 100,
        "y": 200,
    }
    assert result.resolved_calls[1].parameters == {
        "action": "press",
        "key": "enter",
    }


@pytest.mark.parametrize(
    ("method", "parameters"),
    [
        (
            CoordinateFindingMethod.OCR,
            {"ocr_text": "Submit"},
        ),
        (
            CoordinateFindingMethod.PREDICTION,
            {"source_description": "Submit button"},
        ),
    ],
)
@pytest.mark.asyncio
async def test_prepare_mouse_control_image_grounding_without_frame_returns_grounding_frame_error(
    method,
    parameters,
):
    preparer = ToolPreparer(
        DummyScreenshotManager(),
        DummyCoordinateResolver(coordinates=(100, 200)),
        DummyOcrCoordinator(results=[{"text": "Submit"}]),
    )
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "find_coordinates_by": method,
            **parameters,
        },
        raw_call="{}",
    )
    session = NoScreenshotSession()

    _events, result = await _collect_preparation_for_session(
        preparer,
        [tool_call],
        session,
    )

    assert result.resolved_calls == []
    assert len(result.errors) == 1
    assert result.errors[0][1] == "No active grounding frame"


@pytest.mark.asyncio
async def test_prepare_single_local_runtime_mouse_control_shape_is_left_to_local_runtime_validation():
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
        parameters={"x": 1, "y": 2},
        metadata={
            "model_facing_tool_call": {
                "name": "mouse_control",
                "arguments": {"x": 1, "y": 2},
            }
        },
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.bundle_id is None
    assert result.errors == []
    assert len(result.resolved_calls) == 1
    assert result.resolved_calls[0].parameters == {"x": 1, "y": 2}
    assert "request_id" in tool_call.metadata


@pytest.mark.asyncio
async def test_prepare_invalid_grounded_mouse_tool_returns_preparation_error():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "grounded_mouse_action": _ArgsModelTool(
                    GroundedMouseActionArgs,
                    execution_target="backend",
                ),
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="grounded_mouse_action",
        parameters={"action": "click", "explanation": "Click the button."},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.resolved_calls == []
    assert len(result.errors) == 1
    failed_call, error_message = result.errors[0]
    assert failed_call is tool_call
    assert "grounded_mouse_action call is invalid" in error_message


@pytest.mark.asyncio
async def test_prepare_invalid_grounded_scroll_tool_returns_preparation_error():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "grounded_scroll_action": _ArgsModelTool(
                    GroundedScrollActionArgs,
                    execution_target="backend",
                ),
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="grounded_scroll_action",
        parameters={"action": "scroll_down", "explanation": "Scroll."},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.resolved_calls == []
    assert len(result.errors) == 1
    failed_call, error_message = result.errors[0]
    assert failed_call is tool_call
    assert "grounded_scroll_action call is invalid" in error_message


@pytest.mark.asyncio
async def test_prepare_bundle_local_runtime_mouse_control_shape_is_left_to_local_runtime_validation():
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
    first_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"x": 10, "y": 20},
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
    assert result.errors == []
    assert len(result.resolved_calls) == 2
    assert result.resolved_calls[0].parameters == {"x": 10, "y": 20}
    assert first_call.metadata["bundle_id"] == result.bundle_id
    assert second_call.metadata["bundle_id"] == result.bundle_id


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


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_allows_drag_destination_without_source_coordinates():
    session = DummySession()
    screenshot_manager = DummyScreenshotManager()
    ocr_coordinator = DummyOcrCoordinator(results=[{"text": "Drop here"}])
    coordinate_resolver = DummyCoordinateResolver(coordinates=(300, 400))
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "drag",
            "explanation": "Drag to the drop target.",
            "drag_to_find_coordinates_by": CoordinateFindingMethod.OCR,
            "drag_to_ocr_text": "Drop here",
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=ocr_coordinator,
        coordinate_resolver=coordinate_resolver,
        vision_service=None,
        vision_service_provider=lambda _session: None,
        context_id="request-drag-destination",
    )

    assert screenshot_manager.sessions == [session]
    assert ocr_coordinator.calls == [(session, "fake-shot", "shot-prepare")]
    assert len(coordinate_resolver.calls) == 1
    destination_call = coordinate_resolver.calls[0][0]
    assert destination_call.parameters["find_coordinates_by"] == "ocr"
    assert destination_call.parameters["ocr_text"] == "Drop here"
    assert "x" not in resolved_call.parameters
    assert "y" not in resolved_call.parameters
    assert resolved_call.parameters["drag_to_x"] == 300
    assert resolved_call.parameters["drag_to_y"] == 400
    assert (
        resolved_call.metadata["drag_destination_coordinate_method"]
        == CoordinateFindingMethod.OCR.value
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
async def test_prepare_allows_local_runtime_keyboard_tool_shape_for_local_runtime_validation():
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
    assert result.errors == []
    assert len(result.resolved_calls) == 1
    assert result.resolved_calls[0].parameters == {}


@pytest.mark.asyncio
async def test_prepare_allows_local_runtime_system_tool_shape_for_local_runtime_validation():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "get_open_windows": _ArgsModelTool(GetOpenWindowsArgs),
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="get_open_windows",
        parameters={
            "filter_text": "Settings",
        },
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.errors == []
    assert len(result.resolved_calls) == 1
    assert result.resolved_calls[0].parameters == {"filter_text": "Settings"}


@pytest.mark.asyncio
async def test_prepare_allows_local_runtime_browser_tool_shape_for_local_runtime_validation():
    preparer = ToolPreparer(
        object(),
        object(),
        object(),
        tool_registry=DummyToolRegistry(
            {
                "browser": _ArgsModelTool(BrowserControlArgs),
            }
        ),
    )
    tool_call = ParsedToolCall(
        tool_name="browser",
        parameters={},
        raw_call="{}",
    )

    _events, result = await _collect_preparation(preparer, [tool_call])

    assert result is not None
    assert result.errors == []
    assert len(result.resolved_calls) == 1
    assert result.resolved_calls[0].parameters == {}


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
            "explanation": "Click the submit control.",
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
        "explanation": "Click the submit control.",
        "x": 320,
        "y": 180,
    }
