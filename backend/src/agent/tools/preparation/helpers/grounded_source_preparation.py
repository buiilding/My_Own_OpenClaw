"""Shared grounded-source preparation helpers for computer-use tools."""

from __future__ import annotations

import logging
import math
import time
from typing import Optional, TYPE_CHECKING

from backend.src.agent.tools.preparation.helpers.coordinate_contract import (
    CoordinateContract,
    NormalizedCoordinates,
    build_contract_metadata,
    normalize_capture_meta,
    normalize_to_display_space,
)
from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import (
    resolve_coordinates,
)
from backend.src.agent.tools.preparation.helpers.source_coordinate_method import (
    infer_source_coordinate_method,
)
from backend.src.agent.tools.preparation.screenshot.manager import (
    NO_ACTIVE_GROUNDING_FRAME_ERROR,
)
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall
from backend.src.tools.computer.grounding_contract import supports_source_grounding

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
        CoordinateResolver,
    )
    from backend.src.agent.tools.preparation.ocr.coordinator import OcrCoordinator
    from backend.src.agent.tools.preparation.screenshot.manager import ScreenshotManager
    from backend.src.agent.tools.preparation.types.resolved_tool_call import (
        ResolvedToolCall,
    )
    from backend.src.core.interfaces.vision import IVisionProvider

logger = logging.getLogger(__name__)

COORDINATE_RESOLUTION_METHODS = (
    CoordinateFindingMethod.OCR,
    CoordinateFindingMethod.PREDICTION,
)
_EXECUTOR_TOOL_NAME_BY_GROUNDED_TOOL = {
    "grounded_mouse_action": "mouse_control",
    "grounded_scroll_action": "scroll_control",
}


def source_coordinate_method(tool_call: ParsedToolCall) -> str:
    return infer_source_coordinate_method(tool_call)


def tool_call_needs_source_coordinate_resolution(tool_call: ParsedToolCall) -> bool:
    if not supports_source_grounding(tool_call.tool_name):
        return False
    return source_coordinate_method(tool_call) in COORDINATE_RESOLUTION_METHODS


def _round_coordinate(value: float) -> int:
    if value >= 0:
        return int(math.floor(value + 0.5))
    return int(math.ceil(value - 0.5))


def _coerce_coordinate_value(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return _round_coordinate(value)
    return None


def coerce_manual_coordinate_pair(x: object, y: object) -> Optional[tuple[int, int]]:
    parsed_x = _coerce_coordinate_value(x)
    parsed_y = _coerce_coordinate_value(y)
    if parsed_x is None or parsed_y is None:
        return None
    return parsed_x, parsed_y


def tool_call_has_manual_coordinates(tool_call: ParsedToolCall) -> bool:
    if not supports_source_grounding(tool_call.tool_name):
        return False
    if source_coordinate_method(tool_call) != CoordinateFindingMethod.MANUAL.value:
        return False
    return (
        coerce_manual_coordinate_pair(
            tool_call.parameters.get("x"),
            tool_call.parameters.get("y"),
        )
        is not None
    )


def attach_source_coordinate_method_metadata(
    tool_call: ParsedToolCall,
    resolved_call: "ResolvedToolCall",
) -> None:
    if not supports_source_grounding(tool_call.tool_name):
        return
    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["coordinate_method"] = source_coordinate_method(tool_call)


def normalize_screenshot_id(value: object) -> Optional[str]:
    if isinstance(value, str):
        normalized = value.strip()
        if normalized:
            return normalized
    return None


def build_coordinate_contract(
    session: "AgentSession",
    *,
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


def normalize_coordinate_pair_for_session(
    *,
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    x: int,
    y: int,
) -> tuple[CoordinateContract, NormalizedCoordinates]:
    contract = build_coordinate_contract(
        session,
        screenshot_b64=screenshot_b64,
        screenshot_id=screenshot_id,
        x=x,
        y=y,
    )
    normalized = normalize_to_display_space(contract)
    return contract, normalized


def rewrite_resolved_call_source_to_manual(
    resolved_call: "ResolvedToolCall",
    *,
    x: int,
    y: int,
) -> None:
    resolved_call.tool_name = _EXECUTOR_TOOL_NAME_BY_GROUNDED_TOOL.get(
        resolved_call.tool_name,
        resolved_call.tool_name,
    )
    resolved_call.parameters["x"] = x
    resolved_call.parameters["y"] = y
    resolved_call.parameters.pop("find_coordinates_by", None)
    resolved_call.parameters.pop("model_name", None)


async def ensure_coordinate_resolution_screenshot(
    *,
    session: "AgentSession",
    screenshot_manager: "ScreenshotManager",
    context_id: str,
) -> tuple[str, str]:
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
        raise ValueError(NO_ACTIVE_GROUNDING_FRAME_ERROR)
    return screenshot_data, screenshot_id


async def resolve_grounded_source_coordinates(
    *,
    tool_call: ParsedToolCall,
    resolved_call: "ResolvedToolCall",
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    ocr_coordinator: "OcrCoordinator",
    coordinate_resolver: "CoordinateResolver",
    vision_service: Optional["IVisionProvider"],
    vision_service_provider,
    context_id: str,
) -> None:
    method = source_coordinate_method(tool_call)
    if method in COORDINATE_RESOLUTION_METHODS:
        source_x, source_y = await resolve_coordinates(
            tool_call,
            session,
            screenshot_b64,
            screenshot_id,
            ocr_coordinator,
            coordinate_resolver,
            vision_service,
            vision_service_provider,
            context_id,
        )
    else:
        source_pair = coerce_manual_coordinate_pair(
            tool_call.parameters.get("x"),
            tool_call.parameters.get("y"),
        )
        if source_pair is None:
            raise ValueError("Manual coordinates require numeric x and y values")
        source_x, source_y = source_pair

    contract, normalized = normalize_coordinate_pair_for_session(
        session=session,
        screenshot_b64=screenshot_b64,
        screenshot_id=screenshot_id,
        x=source_x,
        y=source_y,
    )
    rewrite_resolved_call_source_to_manual(
        resolved_call,
        x=normalized.x,
        y=normalized.y,
    )

    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["coordinate_resolution_screenshot_id"] = screenshot_id
    resolved_call.metadata["coordinate_contract"] = build_contract_metadata(
        contract,
        normalized,
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
