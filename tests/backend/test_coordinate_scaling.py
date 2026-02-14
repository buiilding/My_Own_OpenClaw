import base64
import struct

import pytest

from backend.src.agent.tools.preparation.helpers.preparation_helper import resolve_tool_with_coordinates
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


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_scales_to_screen_resolution(monkeypatch):
    # Screenshot is physical pixels, but frontend mouse coords are logical pixels.
    screenshot_w, screenshot_h = 3840, 2160
    screen_w, screen_h = 1920, 1080

    screenshot_b64 = base64.b64encode(_fake_jpeg_bytes(screenshot_w, screenshot_h)).decode("ascii")
    session = _StubSession(screenshot_b64, {"screen_resolution": f"{screen_w}x{screen_h}"})
    screenshot_manager = _StubScreenshotManager()

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": CoordinateFindingMethod.OCR, "ocr_text": "Submit"},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return 1000, 1000

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id="bundle-id",
    )

    assert resolved_call.parameters["x"] == 500
    assert resolved_call.parameters["y"] == 500
    assert resolved_call.parameters["ocr_text"] == "Submit"
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "ocr"
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["coordinate_space"] == "screenshot_px"
    assert contract["source_image_size"] == {"width": screenshot_w, "height": screenshot_h}
    assert contract["target_display_size"] == {"width": screen_w, "height": screen_h}
    assert contract["normalized_coordinates"] == {"x": 500, "y": 500}
    assert contract["normalized_space"] == "display_px"
    assert contract["normalization_status"] == "scaled_to_display"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_keeps_contract_when_target_missing(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    screenshot_b64 = base64.b64encode(_fake_jpeg_bytes(screenshot_w, screenshot_h)).decode("ascii")
    session = _StubSession(screenshot_b64, {})
    screenshot_manager = _StubScreenshotManager()

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": CoordinateFindingMethod.OCR, "ocr_text": "Submit"},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return 1000, 600

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id="single-id",
    )

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
    screenshot_b64 = base64.b64encode(_fake_jpeg_bytes(screenshot_w, screenshot_h)).decode("ascii")
    session = _StubSession(screenshot_b64, {"screen_resolution": "1920x1080"})
    screenshot_manager = _StubScreenshotManager()

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": CoordinateFindingMethod.OCR, "ocr_text": "Submit"},
        raw_call="{}",
    )

    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return 1000, 1000

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    first = ResolvedToolCall.from_parsed_call(tool_call)
    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=first,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id="first",
    )

    session.set_current_system_state({"screen_resolution": "2560x1440"})
    second = ResolvedToolCall.from_parsed_call(tool_call)
    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=second,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id="second",
    )

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
async def test_resolve_tool_with_coordinates_disables_scaling_on_linux(monkeypatch):
    screenshot_w, screenshot_h = 3840, 2160
    screen_w, screen_h = 1920, 1080

    screenshot_b64 = base64.b64encode(_fake_jpeg_bytes(screenshot_w, screenshot_h)).decode("ascii")
    session = _StubSession(screenshot_b64, {"screen_resolution": f"{screen_w}x{screen_h}"})
    screenshot_manager = _StubScreenshotManager()

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": CoordinateFindingMethod.OCR, "ocr_text": "Submit"},
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return 1000, 1000

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Linux",
    )

    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id="linux-id",
    )

    assert resolved_call.parameters["x"] == 1000
    assert resolved_call.parameters["y"] == 1000
    contract = resolved_call.metadata["coordinate_contract"]
    assert contract["source_image_size"] == {"width": screenshot_w, "height": screenshot_h}
    assert contract["target_display_size"] == {"width": screen_w, "height": screen_h}
    assert contract["normalized_coordinates"] == {"x": 1000, "y": 1000}
    assert contract["normalization_status"] == "disabled_on_linux"


@pytest.mark.asyncio
async def test_resolve_tool_with_coordinates_preserves_prediction_description(monkeypatch):
    screenshot_w, screenshot_h = 1920, 1080
    screenshot_b64 = base64.b64encode(_fake_jpeg_bytes(screenshot_w, screenshot_h)).decode("ascii")
    session = _StubSession(screenshot_b64, {"screen_resolution": "1920x1080"})
    screenshot_manager = _StubScreenshotManager()

    tool_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "find_coordinates_by": CoordinateFindingMethod.PREDICTION,
            "description": "the cheapest shoe listing card",
        },
        raw_call="{}",
    )
    resolved_call = ResolvedToolCall.from_parsed_call(tool_call)

    async def _fake_resolve_coordinates(*_args, **_kwargs):
        return 743, 873

    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.resolve_coordinates",
        _fake_resolve_coordinates,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.helpers.preparation_helper.platform.system",
        lambda: "Windows",
    )

    await resolve_tool_with_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_manager=screenshot_manager,
        ocr_coordinator=object(),
        coordinate_resolver=object(),
        vision_service=None,
        vision_service_provider=lambda _s: None,
        context_id="prediction-id",
    )

    assert resolved_call.parameters["x"] == 743
    assert resolved_call.parameters["y"] == 873
    assert (
        resolved_call.parameters["description"]
        == "the cheapest shoe listing card"
    )
    assert "find_coordinates_by" not in resolved_call.parameters
    assert resolved_call.metadata["coordinate_method"] == "prediction"
