"""Covers coordinate scaling behavior in the backend test suite."""

import pytest
from frontend.src.main.python.tools.schemas import (
    MouseControlArgs as LocalRuntimeMouseControlArgs,
)
from frontend.src.main.python.tools.schemas import (
    ScrollControlArgs as LocalRuntimeScrollControlArgs,
)

from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    normalize_manual_coordinates,
    resolve_tool_with_coordinates,
)
from backend.src.agent.tools.preparation.types.resolved_tool_call import (
    ResolvedToolCall,
)
from backend.src.agent.tools.preparation.validation import (
    sanitize_resolved_tool_call,
)
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall


class _StubScreenshotManager:
    async def ensure_screenshot(self, _session):
        return None


class _StubSession:
    def __init__(
        self, screenshot_b64: str, screenshot_id: str, capture_meta: dict | None
    ):
        self._screenshot_b64 = screenshot_b64
        self._screenshot_id = screenshot_id
        self._capture_meta = capture_meta

    def get_screenshot(self):
        return self._screenshot_b64

    def get_current_screenshot_id(self):
        return self._screenshot_id

    def get_current_capture_meta(self):
        return self._capture_meta


def _create_session_and_manager(
    *,
    screenshot_id: str = "shot-1",
    capture_meta: dict | None,
):
    return (
        _StubSession("fake-base64-image", screenshot_id, capture_meta),
        _StubScreenshotManager(),
    )


def _patch_coordinate_resolution(monkeypatch, x: int, y: int):
    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return x, y

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.grounded_source_preparation.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.mouse_drag_destination_preparation.resolve_coordinates",
        _fake_resolve_coordinates,
    )


def _patch_coordinate_resolution_sequence(
    monkeypatch, coordinates: list[tuple[int, int]]
):
    iterator = iter(coordinates)

    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return next(iterator)

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.grounded_source_preparation.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.mouse_drag_destination_preparation.resolve_coordinates",
        _fake_resolve_coordinates,
    )


def _build_mouse_call(
    *,
    method: CoordinateFindingMethod,
    **extra_parameters,
) -> tuple[ParsedToolCall, ResolvedToolCall]:
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "find_coordinates_by": method,
            "explanation": "Resolve coordinates for executor parity coverage.",
            **extra_parameters,
        },
        raw_call="{}",
    )
    return tool_call, ResolvedToolCall.from_parsed_call(tool_call)


def _build_scroll_call(
    *,
    method: CoordinateFindingMethod,
    action: str = "scroll_down",
    **extra_parameters,
) -> tuple[ParsedToolCall, ResolvedToolCall]:
    tool_call = ParsedToolCall(
        tool_name="scroll_control",
        parameters={
            "action": action,
            "find_coordinates_by": method,
            "explanation": "Resolve scroll coordinates for executor parity coverage.",
            **extra_parameters,
        },
        raw_call="{}",
    )
    return tool_call, ResolvedToolCall.from_parsed_call(tool_call)


async def _resolve_with_stubs(
    tool_call, resolved_call, session, screenshot_manager, context_id: str
):
    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id=context_id,
    )


def _sanitize_resolved_call_for_executor(resolved_call: ResolvedToolCall) -> None:
    sanitize_resolved_tool_call(
        resolved_call,
        enabled=True,
    )


def test_sanitize_resolved_call_only_strips_backend_grounding_fields():
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "find_coordinates_by": CoordinateFindingMethod.OCR,
            "ocr_text": "Submit",
            "x": 10,
            "y": 20,
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    sanitize_resolved_tool_call(
        resolved_call,
        enabled=True,
    )

    assert resolved_call.parameters == {"action": "click", "x": 10, "y": 20}


def test_sanitize_resolved_call_rejects_unsupported_screenshot_id():
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "x": 10,
            "y": 20,
            "screenshot_id": "old-shot",
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    with pytest.raises(ValueError, match="no longer accepts screenshot_id"):
        sanitize_resolved_tool_call(
            resolved_call,
            enabled=True,
        )


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_scales_using_capture_meta(monkeypatch):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-scale",
        capture_meta={
            "screenshot_id": "shot-scale",
            "source_w": 3840,
            "source_h": 2160,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        ocr_text="Submit",
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 1000)
    await _resolve_with_stubs(
        tool_call, resolved_call, session, screenshot_manager, "bundle-id"
    )

    assert resolved_call.parameters["x"] == 500
    assert resolved_call.parameters["y"] == 500
    assert resolved_call.parameters["ocr_text"] == "Submit"
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "ocr"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["coordinate_space"] == "screenshot_px"
    assert contract["screenshot_id"] == "shot-scale"
    assert contract["source_image_size"] == {"width": 3840, "height": 2160}
    assert contract["capture_crop"] == {"x": 0, "y": 0, "width": 1920, "height": 1080}
    assert contract["normalized_coordinates"] == {"x": 500, "y": 500}
    assert contract["normalized_space"] == "desktop_px"
    assert contract["normalization_status"] == "scaled_to_desktop"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_uses_raw_coordinates_when_capture_meta_missing(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-missing-meta",
        capture_meta=None,
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        ocr_text="Submit",
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 600)
    await _resolve_with_stubs(
        tool_call, resolved_call, session, screenshot_manager, "single-id"
    )

    assert resolved_call.parameters["x"] == 1000
    assert resolved_call.parameters["y"] == 600
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["normalization_status"] == "missing_capture_meta"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_preserves_prediction_description(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-pred",
        capture_meta={
            "screenshot_id": "shot-pred",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.PREDICTION,
        source_description="the cheapest shoe listing card",
    )

    _patch_coordinate_resolution(monkeypatch, 743, 873)
    await _resolve_with_stubs(
        tool_call, resolved_call, session, screenshot_manager, "prediction-id"
    )

    assert resolved_call.parameters["x"] == 743
    assert resolved_call.parameters["y"] == 873
    assert (
        resolved_call.parameters["source_description"]
        == "the cheapest shoe listing card"
    )
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "prediction"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_supports_scroll_control_prediction(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-scroll-pred",
        capture_meta={
            "screenshot_id": "shot-scroll-pred",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_scroll_call(
        method=CoordinateFindingMethod.PREDICTION,
        source_description="the left sidebar list area",
        clicks=6,
    )

    _patch_coordinate_resolution(monkeypatch, 120, 420)
    await _resolve_with_stubs(
        tool_call, resolved_call, session, screenshot_manager, "scroll-pred-id"
    )

    assert resolved_call.parameters["x"] == 120
    assert resolved_call.parameters["y"] == 420
    assert (
        resolved_call.parameters["source_description"] == "the left sidebar list area"
    )
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "prediction"


@pytest.mark.asyncio
async def test_resolved_mouse_drag_payload_is_valid_local_runtime_input(monkeypatch):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-drag-parity",
        capture_meta={
            "screenshot_id": "shot-drag-parity",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.PREDICTION,
        action="drag",
        source_description="the black circle in the upper-left area of the slide",
        drag_to_find_coordinates_by=CoordinateFindingMethod.PREDICTION,
        destination_description="the black rounded square in the lower-right area of the slide",
    )

    _patch_coordinate_resolution_sequence(monkeypatch, [(837, 515), (1381, 751)])
    await _resolve_with_stubs(
        tool_call,
        resolved_call,
        session,
        screenshot_manager,
        "drag-local-runtime-parity",
    )

    _sanitize_resolved_call_for_executor(resolved_call)
    local_runtime_args = LocalRuntimeMouseControlArgs.model_validate(
        resolved_call.parameters
    )
    assert local_runtime_args.action == "drag"
    assert local_runtime_args.x == 837
    assert local_runtime_args.y == 515
    assert local_runtime_args.drag_to_x == 1381
    assert local_runtime_args.drag_to_y == 751


@pytest.mark.asyncio
async def test_resolved_scroll_prediction_payload_is_valid_local_runtime_input(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-scroll-parity",
        capture_meta={
            "screenshot_id": "shot-scroll-parity",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_scroll_call(
        method=CoordinateFindingMethod.PREDICTION,
        action="scroll_down",
        source_description="the left sidebar list area",
        clicks=6,
        wait=0.4,
    )

    _patch_coordinate_resolution(monkeypatch, 320, 480)
    await _resolve_with_stubs(
        tool_call,
        resolved_call,
        session,
        screenshot_manager,
        "scroll-local-runtime-parity",
    )

    _sanitize_resolved_call_for_executor(resolved_call)
    local_runtime_args = LocalRuntimeScrollControlArgs.model_validate(
        resolved_call.parameters
    )
    assert local_runtime_args.action == "scroll_down"
    assert local_runtime_args.x == 320
    assert local_runtime_args.y == 480
    assert local_runtime_args.clicks == 6
    assert local_runtime_args.wait == 0.4
    assert (
        resolved_call.metadata["coordinate_contract"]["screenshot_id"]
        == "shot-scroll-parity"
    )


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_normalizes_drag_destination(monkeypatch):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-drag-scale",
        capture_meta={
            "screenshot_id": "shot-drag-scale",
            "source_w": 3840,
            "source_h": 2160,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.PREDICTION,
        action="drag",
        source_description="gray circle",
        drag_to_x=2000,
        drag_to_y=500,
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 1000)
    await _resolve_with_stubs(
        tool_call, resolved_call, session, screenshot_manager, "drag-scale-id"
    )

    assert resolved_call.parameters["x"] == 500
    assert resolved_call.parameters["y"] == 500
    assert resolved_call.parameters["drag_to_x"] == 1000
    assert resolved_call.parameters["drag_to_y"] == 250
    destination_contract = resolved_call.metadata[
        "drag_destination_coordinate_contract"
    ]
    assert destination_contract["source_coordinates"] == {"x": 2000, "y": 500}
    assert destination_contract["normalized_coordinates"] == {"x": 1000, "y": 250}
    assert destination_contract["normalization_status"] == "scaled_to_desktop"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_resolves_prediction_destination_from_same_screenshot(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-drag-destination-prediction",
        capture_meta={
            "screenshot_id": "shot-drag-destination-prediction",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.MANUAL,
        action="drag",
        x=620,
        y=540,
        drag_to_find_coordinates_by=CoordinateFindingMethod.PREDICTION,
        destination_description="black rounded square",
    )

    _patch_coordinate_resolution_sequence(monkeypatch, [(620, 320)])
    await _resolve_with_stubs(
        tool_call,
        resolved_call,
        session,
        screenshot_manager,
        "drag-destination-prediction",
    )

    assert resolved_call.parameters["x"] == 620
    assert resolved_call.parameters["y"] == 540
    assert resolved_call.parameters["drag_to_x"] == 620
    assert resolved_call.parameters["drag_to_y"] == 320
    assert "drag_to_find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.parameters["destination_description"] == "black rounded square"
    assert "coordinate_resolution_screenshot_id" not in resolved_call.metadata
    assert resolved_call.metadata["drag_destination_coordinate_method"] == "prediction"
    destination_contract = resolved_call.metadata[
        "drag_destination_coordinate_contract"
    ]
    assert destination_contract["screenshot_id"] == "shot-drag-destination-prediction"
    assert destination_contract["source_coordinates"] == {"x": 620, "y": 320}


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_resolves_source_and_destination_against_same_screenshot(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-drag-shared-frame",
        capture_meta={
            "screenshot_id": "shot-drag-shared-frame",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        action="drag",
        ocr_text="gray circle",
        drag_to_find_coordinates_by=CoordinateFindingMethod.OCR,
        drag_to_ocr_text="black rounded square",
    )

    _patch_coordinate_resolution_sequence(monkeypatch, [(620, 540), (620, 320)])
    await _resolve_with_stubs(
        tool_call,
        resolved_call,
        session,
        screenshot_manager,
        "drag-shared-frame",
    )

    assert resolved_call.parameters["x"] == 620
    assert resolved_call.parameters["y"] == 540
    assert resolved_call.parameters["drag_to_x"] == 620
    assert resolved_call.parameters["drag_to_y"] == 320
    assert (
        resolved_call.metadata["coordinate_resolution_screenshot_id"]
        == "shot-drag-shared-frame"
    )
    assert (
        resolved_call.metadata["coordinate_contract"]["screenshot_id"]
        == "shot-drag-shared-frame"
    )
    assert (
        resolved_call.metadata["drag_destination_coordinate_contract"]["screenshot_id"]
        == "shot-drag-shared-frame"
    )


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_allows_ocr_candidate_with_implicit_latest_frame(
    monkeypatch,
):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-current",
        capture_meta={
            "screenshot_id": "shot-current",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        candidate_id="ocr_deadbeef0000",
    )
    _patch_coordinate_resolution(monkeypatch, 640, 360)

    await _resolve_with_stubs(
        tool_call,
        resolved_call,
        session,
        screenshot_manager,
        "ocr-candidate-latest-frame",
    )
    assert resolved_call.parameters["x"] == 640
    assert resolved_call.parameters["y"] == 360


def test_normalize_manual_coordinates_preserves_direct_mouse_coordinates():
    session, _ = _create_session_and_manager(
        screenshot_id="shot-manual-scale",
        capture_meta={
            "screenshot_id": "shot-manual-scale",
            "source_w": 3840,
            "source_h": 2160,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "drag",
            "x": 1000,
            "y": 600,
            "drag_to_x": 2000,
            "drag_to_y": 800,
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    normalize_manual_coordinates(
        resolved_call=resolved_call,
        session=session,
        context_id="manual-passthrough",
    )

    assert resolved_call.parameters == {
        "action": "drag",
        "x": 1000,
        "y": 600,
        "drag_to_x": 2000,
        "drag_to_y": 800,
    }
    metadata = resolved_call.metadata or {}
    assert "coordinate_resolution_screenshot_id" not in metadata
    assert "coordinate_contract" not in metadata
    assert "drag_destination_coordinate_contract" not in metadata


def test_normalize_manual_coordinates_preserves_direct_scroll_coordinates():
    session, _ = _create_session_and_manager(
        screenshot_id="shot-scroll-manual-scale",
        capture_meta={
            "screenshot_id": "shot-scroll-manual-scale",
            "source_w": 3840,
            "source_h": 2160,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )
    tool_call = ParsedToolCall(
        tool_name="scroll_control",
        parameters={
            "action": "scroll_down",
            "x": 1000,
            "y": 600,
            "clicks": 6,
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    normalize_manual_coordinates(
        resolved_call=resolved_call,
        session=session,
        context_id="scroll-manual-passthrough",
    )

    assert resolved_call.parameters == {
        "action": "scroll_down",
        "x": 1000,
        "y": 600,
        "clicks": 6,
    }
    metadata = resolved_call.metadata or {}
    assert "coordinate_resolution_screenshot_id" not in metadata
    assert "coordinate_contract" not in metadata
