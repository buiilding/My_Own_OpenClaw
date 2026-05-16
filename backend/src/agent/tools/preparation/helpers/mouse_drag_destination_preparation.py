"""Mouse drag destination grounding helpers."""

from __future__ import annotations

import copy
import logging
from typing import Optional, TYPE_CHECKING

from backend.src.agent.tools.preparation.helpers.coordinate_contract import (
    build_contract_metadata,
)
from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import resolve_coordinates
from backend.src.agent.tools.preparation.helpers.grounded_source_preparation import (
    COORDINATE_RESOLUTION_METHODS,
    coerce_manual_coordinate_pair,
    normalize_coordinate_pair_for_session,
)
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.llm.parser_types import ParsedToolCall
from backend.src.tools.computer.grounding_contract import supports_drag_destination_grounding

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
    from backend.src.agent.tools.preparation.ocr import OcrCoordinator
    from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
    from backend.src.core.interfaces.vision import IVisionProvider

logger = logging.getLogger(__name__)
_OPENAI_GROUNDED_MOUSE_TOOL_NAME = "grounded_mouse_action"


def drag_destination_method(tool_call: ParsedToolCall) -> str:
    if not supports_drag_destination_grounding(tool_call.tool_name):
        return CoordinateFindingMethod.MANUAL.value
    if tool_call.parameters.get("action") != "drag":
        return CoordinateFindingMethod.MANUAL.value
    if tool_call.tool_name == _OPENAI_GROUNDED_MOUSE_TOOL_NAME:
        if tool_call.parameters.get("drag_to_ocr_text") or tool_call.parameters.get(
            "drag_to_candidate_id"
        ):
            return CoordinateFindingMethod.OCR.value
        return CoordinateFindingMethod.PREDICTION.value
    return normalize_coordinate_method(
        tool_call.parameters.get("drag_to_find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )


def tool_call_needs_drag_destination_resolution(tool_call: ParsedToolCall) -> bool:
    return drag_destination_method(tool_call) in COORDINATE_RESOLUTION_METHODS


def attach_drag_destination_coordinate_method_metadata(
    tool_call: ParsedToolCall,
    resolved_call: "ResolvedToolCall",
) -> None:
    if not supports_drag_destination_grounding(tool_call.tool_name):
        return
    if tool_call.parameters.get("action") != "drag":
        return
    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["drag_destination_coordinate_method"] = drag_destination_method(
        tool_call
    )


def build_destination_resolution_call(tool_call: ParsedToolCall) -> ParsedToolCall:
    return ParsedToolCall(
        tool_name=tool_call.tool_name,
        parameters={
            "find_coordinates_by": drag_destination_method(tool_call),
            "x": tool_call.parameters.get("drag_to_x"),
            "y": tool_call.parameters.get("drag_to_y"),
            "ocr_text": tool_call.parameters.get("drag_to_ocr_text"),
            "candidate_id": tool_call.parameters.get("drag_to_candidate_id"),
            "source_description": tool_call.parameters.get("destination_description"),
            "model_name": tool_call.parameters.get("drag_to_model_name"),
        },
        raw_call=tool_call.raw_call,
        confidence=tool_call.confidence,
        metadata=copy.deepcopy(tool_call.metadata) if tool_call.metadata else None,
    )


async def resolve_mouse_drag_destination_coordinates(
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
    if not supports_drag_destination_grounding(resolved_call.tool_name):
        return
    if resolved_call.parameters.get("action") != "drag":
        return

    destination_method = drag_destination_method(tool_call)
    if destination_method in COORDINATE_RESOLUTION_METHODS:
        destination_x, destination_y = await resolve_coordinates(
            build_destination_resolution_call(tool_call),
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
        normalize_manual_drag_destination_coordinates(
            resolved_call=resolved_call,
            session=session,
            screenshot_b64=screenshot_b64,
            screenshot_id=screenshot_id,
            context_id=context_id,
        )
        return

    contract, normalized = normalize_coordinate_pair_for_session(
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


def normalize_manual_drag_destination_coordinates(
    *,
    resolved_call: "ResolvedToolCall",
    session: "AgentSession",
    screenshot_b64: str,
    screenshot_id: str,
    context_id: str,
) -> None:
    if not supports_drag_destination_grounding(resolved_call.tool_name):
        return
    if resolved_call.parameters.get("action") != "drag":
        return

    destination_pair = coerce_manual_coordinate_pair(
        resolved_call.parameters.get("drag_to_x"),
        resolved_call.parameters.get("drag_to_y"),
    )
    if destination_pair is None:
        raise ValueError("Drag action requires numeric drag_to_x and drag_to_y values")

    destination_x, destination_y = destination_pair
    contract, normalized = normalize_coordinate_pair_for_session(
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
