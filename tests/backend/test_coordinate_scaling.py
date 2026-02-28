import pytest

from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    normalize_manual_coordinates,
    resolve_tool_with_coordinates,
)
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall


class _StubScreenshotManager:
    async def ensure_screenshot(self, _session):
        return None


class _StubSession:
    def __init__(self, screenshot_b64: str, screenshot_id: str, capture_meta: dict | None):
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
    return _StubSession("fake-base64-image", screenshot_id, capture_meta), _StubScreenshotManager()


def _patch_coordinate_resolution(monkeypatch, x: int, y: int):
    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return x, y

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )


def _build_mouse_call(
    *,
    method: CoordinateFindingMethod,
    **extra_parameters,
) -> tuple[ParsedToolCall, ResolvedToolCall]:
    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": method, **extra_parameters},
        raw_call="{}",
    )
    return tool_call, ResolvedToolCall.from_parsed_call(tool_call)


async def _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, context_id: str):
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
    await _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, "bundle-id")

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
async def test_resolve_tool_with_coordinates_uses_raw_coordinates_when_capture_meta_missing(monkeypatch):
    session, screenshot_manager = _create_session_and_manager(
        screenshot_id="shot-missing-meta",
        capture_meta=None,
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        ocr_text="Submit",
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 600)
    await _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, "single-id")

    assert resolved_call.parameters["x"] == 1000
    assert resolved_call.parameters["y"] == 600
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["normalization_status"] == "missing_capture_meta"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_preserves_prediction_description(monkeypatch):
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
        description="the cheapest shoe listing card",
    )

    _patch_coordinate_resolution(monkeypatch, 743, 873)
    await _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, "prediction-id")

    assert resolved_call.parameters["x"] == 743
    assert resolved_call.parameters["y"] == 873
    assert resolved_call.parameters["description"] == "the cheapest shoe listing card"
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "prediction"


def test_normalize_manual_coordinates_requires_screenshot_id():
    session, _ = _create_session_and_manager(
        screenshot_id="shot-manual",
        capture_meta={
            "screenshot_id": "shot-manual",
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

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 700, "y": 300},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    with pytest.raises(ValueError, match="Manual mouse coordinates require screenshot_id"):
        normalize_manual_coordinates(
            resolved_call=resolved_call,
            session=session,
            context_id="manual-no-screenshot-id",
        )


def test_normalize_manual_coordinates_rejects_stale_screenshot_id():
    session, _ = _create_session_and_manager(
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

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 700, "y": 300, "screenshot_id": "shot-old"},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    with pytest.raises(ValueError, match="frame changed, re-ground required"):
        normalize_manual_coordinates(
            resolved_call=resolved_call,
            session=session,
            context_id="manual-stale",
        )


def test_normalize_manual_coordinates_scales_to_desktop_space():
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
            "action": "click",
            "x": 1000,
            "y": 600,
            "screenshot_id": "shot-manual-scale",
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    normalize_manual_coordinates(
        resolved_call=resolved_call,
        session=session,
        context_id="manual-scale",
    )

    assert resolved_call.parameters["x"] == 500
    assert resolved_call.parameters["y"] == 300
    assert resolved_call.metadata["coordinate_resolution_screenshot_id"] == "shot-manual-scale"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["source_coordinates"] == {"x": 1000, "y": 600}
    assert contract["capture_crop"] == {"x": 0, "y": 0, "width": 1920, "height": 1080}
    assert contract["normalization_status"] == "scaled_to_desktop"


def test_normalize_manual_coordinates_clamps_out_of_bounds_values():
    session, _ = _create_session_and_manager(
        screenshot_id="shot-manual-clamp",
        capture_meta={
            "screenshot_id": "shot-manual-clamp",
            "source_w": 100,
            "source_h": 50,
            "crop_x": 10,
            "crop_y": 20,
            "crop_w": 200,
            "crop_h": 100,
            "desktop_virtual_bounds": {"x": 10, "y": 20, "width": 200, "height": 100},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "x": 1000.0,
            "y": -2.0,
            "screenshot_id": "shot-manual-clamp",
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    normalize_manual_coordinates(
        resolved_call=resolved_call,
        session=session,
        context_id="manual-clamp",
    )

    assert resolved_call.parameters["x"] == 208
    assert resolved_call.parameters["y"] == 20
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["clamped_source_coordinates"] == {"x": 99, "y": 0}
    assert contract["normalization_status"] == "scaled_to_desktop_clamped"
