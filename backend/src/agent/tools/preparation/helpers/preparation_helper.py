"""
Tool resolution helper for coordinate resolution workflow.

Extracts shared logic for resolving a tool call that requires coordinate resolution.
Pure infrastructure code - no side effects beyond tool resolution.
"""
import copy
import logging
import math
import time
from typing import Optional, TYPE_CHECKING

from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.agent.tools.preparation.helpers.coordinate_contract import (
    CoordinateContract,
    NormalizedCoordinates,
    build_contract_metadata,
    normalize_capture_meta,
    normalize_to_display_space,
)
from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import resolve_coordinates
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
    from backend.src.agent.tools.preparation.ocr import OcrCoordinator
    from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
    from backend.src.core.interfaces.vision import IVisionService

logger = logging.getLogger(__name__)

_COORDINATE_RESOLUTION_METHODS = (
    CoordinateFindingMethod.OCR,
    CoordinateFindingMethod.PREDICTION,
)


def tool_call_needs_coordinate_resolution(tool_call: ParsedToolCall) -> bool:
    """Return whether a tool call should run OCR/prediction coordinate resolution."""
    if tool_call.tool_name != "mouse_control":
        return False
    source_method = normalize_coordinate_method(
        tool_call.parameters.get("find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
    if source_method in _COORDINATE_RESOLUTION_METHODS:
        return True
    return _drag_destination_method(tool_call) in _COORDINATE_RESOLUTION_METHODS


def _round_coordinate(value: float) -> int:
    """
    Round one numeric coordinate to the nearest pixel.

    Uses half-away-from-zero behavior for deterministic 0.5 handling.
    """
    if value >= 0:
        return int(math.floor(value + 0.5))
    return int(math.ceil(value - 0.5))


def _coerce_coordinate_value(value: object) -> Optional[int]:
    """Convert one coordinate value to an integer pixel when possible."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return _round_coordinate(value)
    return None


def _coerce_manual_coordinate_pair(x: object, y: object) -> Optional[tuple[int, int]]:
    """Convert manual x/y values to integer pixels or return None if invalid."""
    parsed_x = _coerce_coordinate_value(x)
    parsed_y = _coerce_coordinate_value(y)
    if parsed_x is None or parsed_y is None:
        return None
    return parsed_x, parsed_y


def _normalize_coordinate_pair_for_session(
    *,
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    x: int,
    y: int,
) -> tuple[CoordinateContract, NormalizedCoordinates]:
    contract = _build_coordinate_contract(
        session,
        screenshot_b64=screenshot_b64,
        screenshot_id=screenshot_id,
        x=x,
        y=y,
    )
    normalized = normalize_to_display_space(contract)
    return contract, normalized


def _normalize_screenshot_id(value: object) -> Optional[str]:
    if isinstance(value, str):
        normalized = value.strip()
        if normalized:
            return normalized
    return None


def tool_call_has_manual_coordinates(tool_call: ParsedToolCall) -> bool:
    """
    Return whether a mouse tool call uses manual coordinates with x/y payload.

    Manual calls skip OCR/vision resolution and are transformed against the
    current captured frame.
    """
    if tool_call.tool_name != "mouse_control":
        return False
    method = normalize_coordinate_method(
        tool_call.parameters.get("find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
    if method != CoordinateFindingMethod.MANUAL.value:
        return False

    return (
        _coerce_manual_coordinate_pair(
            tool_call.parameters.get("x"),
            tool_call.parameters.get("y"),
        )
        is not None
    )


def _drag_destination_method(tool_call: ParsedToolCall) -> str:
    if tool_call.tool_name != "mouse_control":
        return CoordinateFindingMethod.MANUAL.value
    if tool_call.parameters.get("action") != "drag":
        return CoordinateFindingMethod.MANUAL.value
    return normalize_coordinate_method(
        tool_call.parameters.get("drag_to_find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )


def _build_destination_resolution_call(tool_call: ParsedToolCall) -> ParsedToolCall:
    return ParsedToolCall(
        tool_name=tool_call.tool_name,
        parameters={
            "find_coordinates_by": _drag_destination_method(tool_call),
            "x": tool_call.parameters.get("drag_to_x"),
            "y": tool_call.parameters.get("drag_to_y"),
            "ocr_text": tool_call.parameters.get("drag_to_ocr_text"),
            "candidate_id": tool_call.parameters.get("drag_to_candidate_id"),
            "description": tool_call.parameters.get("drag_to_description"),
            "model_name": tool_call.parameters.get("drag_to_model_name"),
        },
        raw_call=tool_call.raw_call,
        confidence=tool_call.confidence,
        metadata=copy.deepcopy(tool_call.metadata) if tool_call.metadata else None,
    )


def attach_coordinate_method_metadata(
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
) -> None:
    """
    Persist the mouse coordinate method in metadata for tool-call transparency.

    We rewrite mouse calls to manual x/y before execution, so we must keep the
    original resolution method (`manual|ocr|prediction`) separately in metadata.
    """
    if tool_call.tool_name != "mouse_control":
        return

    if not resolved_call.metadata:
        resolved_call.metadata = {}

    method = normalize_coordinate_method(
        tool_call.parameters.get("find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
    resolved_call.metadata["coordinate_method"] = method
    if tool_call.parameters.get("action") == "drag":
        resolved_call.metadata["drag_destination_coordinate_method"] = _drag_destination_method(
            tool_call
        )


async def resolve_tool_with_coordinates(
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
    session: "AgentSession",
    screenshot_manager: "ScreenshotManager",
    ocr_coordinator: "OcrCoordinator",
    coordinate_resolver: "CoordinateResolver",
    vision_service: Optional["IVisionService"],
    vision_service_provider,
    context_id: str,  # bundle_id or request_id for logging
) -> None:
    """
    Resolve a tool call that requires coordinate resolution.

    Raises:
        ValueError: If screenshot/capture metadata is unavailable
        Exception: If coordinate resolution fails
    """
    attach_coordinate_method_metadata(tool_call, resolved_call)

    screenshot_start_time = time.perf_counter()
    await screenshot_manager.ensure_screenshot(session)
    screenshot_time = time.perf_counter() - screenshot_start_time
    if screenshot_time > 0.001:
        logger.info(
            "[Timing] Screenshot acquisition took %.3fs (context_id=%s)",
            screenshot_time,
            short_id(context_id),
        )

    screenshot_data = session.get_screenshot()
    screenshot_id = session.get_current_screenshot_id()
    if not screenshot_data or not screenshot_id:
        raise ValueError("No screenshot data available for coordinate resolution")

    source_method = normalize_coordinate_method(
        tool_call.parameters.get("find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
    if source_method in _COORDINATE_RESOLUTION_METHODS:
        source_x, source_y = await resolve_coordinates(
            tool_call,
            session,
            screenshot_data,
            screenshot_id,
            ocr_coordinator,
            coordinate_resolver,
            vision_service,
            vision_service_provider,
            context_id,
        )
    else:
        source_pair = _coerce_manual_coordinate_pair(
            tool_call.parameters.get("x"),
            tool_call.parameters.get("y"),
        )
        if source_pair is None:
            raise ValueError("Manual coordinates require numeric x and y values")
        source_x, source_y = source_pair

    contract, normalized = _normalize_coordinate_pair_for_session(
        session=session,
        screenshot_b64=screenshot_data,
        screenshot_id=screenshot_id,
        x=source_x,
        y=source_y,
    )

    _rewrite_to_manual(resolved_call, normalized.x, normalized.y)
    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["coordinate_resolution_screenshot_id"] = screenshot_id
    resolved_call.metadata["coordinate_contract"] = build_contract_metadata(
        contract,
        normalized,
    )
    await _resolve_drag_destination_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_b64=screenshot_data,
        screenshot_id=screenshot_id,
        ocr_coordinator=ocr_coordinator,
        coordinate_resolver=coordinate_resolver,
        vision_service=vision_service,
        vision_service_provider=vision_service_provider,
        context_id=context_id,
    )

    logger.info(
        "[context_id=%s] Resolved coordinates for %s: source=(%s,%s) desktop=(%s,%s) "
        "status=%s screenshot=%s",
        short_id(context_id),
        tool_call.tool_name,
        source_x,
        source_y,
        normalized.x,
        normalized.y,
        normalized.status,
        screenshot_id[:8],
    )


def normalize_manual_coordinates(
    *,
    resolved_call: ResolvedToolCall,
    session: "AgentSession",
    context_id: str,
) -> None:
    """
    Normalize manual mouse coordinates from screenshot pixel space to desktop space.

    Manual coordinates are interpreted in screenshot pixel space and normalized to
    desktop space using the current session frame.
    """
    if resolved_call.tool_name != "mouse_control":
        return

    coordinate_pair = _coerce_manual_coordinate_pair(
        resolved_call.parameters.get("x"),
        resolved_call.parameters.get("y"),
    )
    if coordinate_pair is None:
        raise ValueError("Manual coordinates require numeric x and y values")
    source_x, source_y = coordinate_pair

    current_screenshot_id = _normalize_screenshot_id(session.get_current_screenshot_id())
    if not current_screenshot_id:
        raise ValueError("No active screenshot frame available for manual grounding")
    effective_screenshot_id = current_screenshot_id

    screenshot_data = session.get_screenshot()
    if not isinstance(screenshot_data, str) or not screenshot_data.strip():
        raise ValueError("No active screenshot data available for manual grounding")

    contract, normalized = _normalize_coordinate_pair_for_session(
        session=session,
        screenshot_b64=screenshot_data,
        screenshot_id=effective_screenshot_id,
        x=source_x,
        y=source_y,
    )

    resolved_call.parameters["x"] = normalized.x
    resolved_call.parameters["y"] = normalized.y

    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["coordinate_resolution_screenshot_id"] = effective_screenshot_id
    resolved_call.metadata["coordinate_contract"] = build_contract_metadata(
        contract,
        normalized,
    )
    destination_method = normalize_coordinate_method(
        resolved_call.parameters.get("drag_to_find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
    if (
        resolved_call.parameters.get("action") == "drag"
        and destination_method in _COORDINATE_RESOLUTION_METHODS
    ):
        raise ValueError(
            "Drag destination OCR/prediction grounding requires coordinate resolution preparation"
        )
    _normalize_drag_destination_coordinates(
        resolved_call=resolved_call,
        session=session,
        screenshot_b64=screenshot_data,
        screenshot_id=effective_screenshot_id,
        context_id=context_id,
    )

    logger.info(
        "[context_id=%s] Normalized manual coordinates source=(%s,%s) desktop=(%s,%s) "
        "status=%s screenshot=%s",
        short_id(context_id),
        source_x,
        source_y,
        normalized.x,
        normalized.y,
        normalized.status,
        effective_screenshot_id[:8],
    )


def _build_coordinate_contract(
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    x: int,
    y: int,
) -> CoordinateContract:
    get_capture_meta = getattr(session, "get_current_capture_meta", None)
    raw_capture_meta = get_capture_meta() if callable(get_capture_meta) else None
    capture_meta = normalize_capture_meta(
        raw_capture_meta,
        screenshot_id=screenshot_id,
        fallback_screenshot_b64=screenshot_b64,
    )
    return CoordinateContract(
        x=x,
        y=y,
        coordinate_space="screenshot_px",
        screenshot_id=screenshot_id,
        capture_meta=capture_meta,
    )


async def _resolve_drag_destination_coordinates(
    *,
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    ocr_coordinator: "OcrCoordinator",
    coordinate_resolver: "CoordinateResolver",
    vision_service: Optional["IVisionService"],
    vision_service_provider,
    context_id: str,
) -> None:
    if resolved_call.tool_name != "mouse_control":
        return
    if resolved_call.parameters.get("action") != "drag":
        return

    destination_method = _drag_destination_method(tool_call)
    if destination_method in _COORDINATE_RESOLUTION_METHODS:
        destination_x, destination_y = await resolve_coordinates(
            _build_destination_resolution_call(tool_call),
            session,
            screenshot_b64,
            screenshot_id,
            ocr_coordinator,
            coordinate_resolver,
            vision_service,
            vision_service_provider,
            context_id,
        )
        resolved_call.parameters.pop("drag_to_find_coordinates_by", None)
        resolved_call.parameters.pop("drag_to_model_name", None)
    else:
        _normalize_drag_destination_coordinates(
            resolved_call=resolved_call,
            session=session,
            screenshot_b64=screenshot_b64,
            screenshot_id=screenshot_id,
            context_id=context_id,
        )
        return

    contract, normalized = _normalize_coordinate_pair_for_session(
        session=session,
        screenshot_b64=screenshot_b64,
        screenshot_id=screenshot_id,
        x=destination_x,
        y=destination_y,
    )
    resolved_call.parameters["drag_to_x"] = normalized.x
    resolved_call.parameters["drag_to_y"] = normalized.y
    resolved_call.parameters.pop("drag_to_find_coordinates_by", None)
    resolved_call.parameters.pop("drag_to_model_name", None)

    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["drag_destination_coordinate_method"] = destination_method
    resolved_call.metadata["drag_destination_coordinate_contract"] = build_contract_metadata(
        contract,
        normalized,
    )

    logger.info(
        "[context_id=%s] Resolved drag destination source=(%s,%s) desktop=(%s,%s) "
        "status=%s screenshot=%s",
        short_id(context_id),
        destination_x,
        destination_y,
        normalized.x,
        normalized.y,
        normalized.status,
        screenshot_id[:8],
    )


def _normalize_drag_destination_coordinates(
    *,
    resolved_call: ResolvedToolCall,
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    context_id: str,
) -> None:
    if resolved_call.tool_name != "mouse_control":
        return
    if resolved_call.parameters.get("action") != "drag":
        return

    destination_pair = _coerce_manual_coordinate_pair(
        resolved_call.parameters.get("drag_to_x"),
        resolved_call.parameters.get("drag_to_y"),
    )
    if destination_pair is None:
        raise ValueError("Drag action requires numeric drag_to_x and drag_to_y values")

    destination_x, destination_y = destination_pair
    contract, normalized = _normalize_coordinate_pair_for_session(
        session=session,
        screenshot_b64=screenshot_b64,
        screenshot_id=screenshot_id,
        x=destination_x,
        y=destination_y,
    )

    resolved_call.parameters["drag_to_x"] = normalized.x
    resolved_call.parameters["drag_to_y"] = normalized.y

    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["drag_destination_coordinate_contract"] = build_contract_metadata(
        contract,
        normalized,
    )

    logger.info(
        "[context_id=%s] Normalized drag destination source=(%s,%s) desktop=(%s,%s) "
        "status=%s screenshot=%s",
        short_id(context_id),
        destination_x,
        destination_y,
        normalized.x,
        normalized.y,
        normalized.status,
        screenshot_id[:8],
    )


def _rewrite_to_manual(resolved_call: ResolvedToolCall, x: int, y: int):
    """
    Rewrite the resolved tool call parameters to use manual coordinates.

    Modifies the resolved call's parameters (immutable - original ParsedToolCall unchanged).
    Removes backend-only routing fields while preserving model-generated OCR/prediction
    target text for transparency in the emitted tool-call payload.
    """
    resolved_call.parameters["x"] = x
    resolved_call.parameters["y"] = y

    # Remove backend-only routing fields.
    # Keep ocr_text/description/candidate_id for transparency in emitted tool-call payload.
    resolved_call.parameters.pop("find_coordinates_by", None)
    resolved_call.parameters.pop("model_name", None)
