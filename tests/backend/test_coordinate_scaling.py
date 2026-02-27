import base64
import struct

import pytest

from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    normalize_manual_coordinates,
    resolve_tool_with_coordinates,
)
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall


def _fake_jpeg_bytes(width: int, height: int) -> bytes:
    # Minimal byte stream sufficient for our JPEG dimension parser.
    soi = b"\xff\xd8"
    app0 = (
        b"\xff\xe0"
        + struct.pack(">H", 16)
        + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    )
    sof0 = (
        b"\xff\xc0"
        + struct.pack(">H", 17)
        + b"\x08"
        + struct.pack(">H", height)
        + struct.pack(">H", width)
        + b"\x03"
        + b"\x01\x11\x00"
        + b"\x02\x11\x00"
        + b"\x03\x11\x00"
    )
    eoi = b"\xff\xd9"
    return soi + app0 + sof0 + eoi


class _StubScreenshotManager:
    async def ensure_screenshot(self, _session):
        return None


class _StubSession:
    def __init__(self, screenshot_b64: str, system_state: dict):
        self._screenshot_b64 = screenshot_b64
        self._screenshot_id = "deadbeef"
        self._system_state = system_state

    def get_screenshot(self):
        return self._screenshot_b64

    def get_current_screenshot_id(self):
        return self._screenshot_id

    def get_current_system_state(self):
        return dict(self._system_state)

    def set_current_system_state(self, system_state: dict):
        self._system_state = dict(system_state)


def _create_session_and_manager(
    screenshot_w: int, screenshot_h: int, screen_resolution: str | None = None
):
    screenshot_b64 = base64.b64encode(_fake_jpeg_bytes(screenshot_w, screenshot_h)).decode("ascii")
    system_state = {"screen_resolution": screen_resolution} if screen_resolution is not None else {}
    return _StubSession(screenshot_b64, system_state), _StubScreenshotManager()


def _patch_coordinate_resolution(monkeypatch, x: int, y: int, os_name: str):
    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return x, y

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: os_name,
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
@pytest.mark.parametrize(
    ("os_name", "expected_x", "expected_y", "expected_status"),
    [
        ("Windows", 500, 500, "scaled_to_display"),
        ("Linux", 1000, 1000, "disabled_on_linux"),
    ],
    ids=["windows-scales", "linux-no-scale"],
)
async def test_resolve_tool_with_coordinates_scales_or_disables_by_os(
    monkeypatch,
    os_name: str,
    expected_x: int,
    expected_y: int,
    expected_status: str,
):
    # Screenshot is physical pixels, but frontend mouse coords are logical pixels.
    screenshot_w, screenshot_h = 3840, 2160
    screen_w, screen_h = 1920, 1080

    session, screenshot_manager = _create_session_and_manager(
        screenshot_w, screenshot_h, f"{screen_w}x{screen_h}"
    )

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        ocr_text="Submit",
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 1000, os_name)
    await _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, "bundle-id")

    assert resolved_call.parameters["x"] == expected_x
    assert resolved_call.parameters["y"] == expected_y
    assert resolved_call.parameters["ocr_text"] == "Submit"
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "ocr"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["coordinate_space"] == "screenshot_px"
    assert contract["source_image_size"] == {"width": screenshot_w, "height": screenshot_h}
    assert contract["target_display_size"] == {"width": screen_w, "height": screen_h}
    assert contract["normalized_coordinates"] == {"x": expected_x, "y": expected_y}
    assert contract["normalized_space"] == "display_px"
    assert contract["normalization_status"] == expected_status


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_keeps_contract_when_target_missing(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    session, screenshot_manager = _create_session_and_manager(screenshot_w, screenshot_h)

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        ocr_text="Submit",
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 600, "Windows")
    await _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, "single-id")

    assert resolved_call.parameters["x"] == 1000
    assert resolved_call.parameters["y"] == 600
    assert resolved_call.metadata["coordinate_method"] == "ocr"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["source_image_size"] == {"width": screenshot_w, "height": screenshot_h}
    assert contract["target_display_size"] is None
    assert contract["normalization_status"] == "missing_target_display_size"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_uses_latest_system_resolution_each_time(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    session, screenshot_manager = _create_session_and_manager(screenshot_w, screenshot_h, "1920x1080")

    tool_call, _ = _build_mouse_call(
        method=CoordinateFindingMethod.OCR,
        ocr_text="Submit",
    )

    _patch_coordinate_resolution(monkeypatch, 1000, 1000, "Windows")

    first = ResolvedToolCall.from_parsed_call(tool_call)
    await _resolve_with_stubs(tool_call, first, session, screenshot_manager, "first")

    session.set_current_system_state({"screen_resolution": "2560x1440"})
    second = ResolvedToolCall.from_parsed_call(tool_call)
    await _resolve_with_stubs(tool_call, second, session, screenshot_manager, "second")

    assert first.parameters["x"] == 500
    assert first.parameters["y"] == 500
    assert second.parameters["x"] == 667
    assert second.parameters["y"] == 667
    assert first.metadata["coordinate_method"] == "ocr"
    assert second.metadata["coordinate_method"] == "ocr"
    assert first.metadata["coordinate_contract"]["target_display_size"] == {
        "width": 1920,
        "height": 1080,
    }
    assert second.metadata["coordinate_contract"]["target_display_size"] == {
        "width": 2560,
        "height": 1440,
    }


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_preserves_prediction_description(monkeypatch):
    screenshot_w, screenshot_h = 1920, 1080
    session, screenshot_manager = _create_session_and_manager(screenshot_w, screenshot_h, "1920x1080")

    tool_call, resolved_call = _build_mouse_call(
        method=CoordinateFindingMethod.PREDICTION,
        description="the cheapest shoe listing card",
    )

    _patch_coordinate_resolution(monkeypatch, 743, 873, "Windows")
    await _resolve_with_stubs(tool_call, resolved_call, session, screenshot_manager, "prediction-id")

    assert resolved_call.parameters["x"] == 743
    assert resolved_call.parameters["y"] == 873
    assert (
        resolved_call.parameters["description"]
        == "the cheapest shoe listing card"
    )
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "prediction"


def test_normalize_manual_coordinates_scales_to_display(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    screen_w, screen_h = 1920, 1080
    session, _ = _create_session_and_manager(
        screenshot_w,
        screenshot_h,
        f"{screen_w}x{screen_h}",
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 1000, "y": 600},
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
    assert resolved_call.metadata["coordinate_resolution_screenshot_id"] == "deadbeef"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["coordinate_space"] == "screenshot_px"
    assert contract["source_image_size"] == {"width": screenshot_w, "height": screenshot_h}
    assert contract["target_display_size"] == {"width": screen_w, "height": screen_h}
    assert contract["normalization_status"] == "scaled_to_display"


def test_normalize_manual_coordinates_scales_float_inputs(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    screen_w, screen_h = 1920, 1080
    session, _ = _create_session_and_manager(
        screenshot_w,
        screenshot_h,
        f"{screen_w}x{screen_h}",
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 1000.0, "y": 600.0},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    normalize_manual_coordinates(
        resolved_call=resolved_call,
        session=session,
        context_id="manual-float-scale",
    )

    assert resolved_call.parameters["x"] == 500
    assert resolved_call.parameters["y"] == 300
    assert resolved_call.metadata["coordinate_resolution_screenshot_id"] == "deadbeef"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["source_coordinates"] == {"x": 1000, "y": 600}
    assert contract["source_image_size"] == {"width": screenshot_w, "height": screenshot_h}
    assert contract["target_display_size"] == {"width": screen_w, "height": screen_h}
    assert contract["normalization_status"] == "scaled_to_display"


def test_normalize_manual_coordinates_skips_without_screenshot(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    session, _ = _create_session_and_manager(
        screenshot_w,
        screenshot_h,
        "1920x1080",
    )
    session._screenshot_b64 = None
    session._screenshot_id = None
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 700, "y": 300},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    normalize_manual_coordinates(
        resolved_call=resolved_call,
        session=session,
        context_id="manual-no-screenshot",
    )

    assert resolved_call.parameters["x"] == 700
    assert resolved_call.parameters["y"] == 300
    assert not resolved_call.metadata or "coordinate_contract" not in resolved_call.metadata
