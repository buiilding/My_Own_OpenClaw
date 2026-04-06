"""Shared source-grounding method inference for computer-use tools."""

from __future__ import annotations

from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.llm.parser_types import ParsedToolCall
from backend.src.tools.computer.grounding_contract import supports_source_grounding

_OPENAI_GROUNDED_TOOL_NAMES = frozenset(
    {"grounded_mouse_action", "grounded_scroll_action"}
)


def infer_source_coordinate_method(tool_call: ParsedToolCall) -> str:
    """Resolve the effective source-grounding method for a tool call."""
    tool_name = getattr(tool_call, "tool_name", None)
    if not isinstance(tool_name, str) or not tool_name:
        return normalize_coordinate_method(
            tool_call.parameters.get("find_coordinates_by"),
            default=CoordinateFindingMethod.MANUAL.value,
        )
    if not supports_source_grounding(tool_name):
        return CoordinateFindingMethod.MANUAL.value
    if tool_name in _OPENAI_GROUNDED_TOOL_NAMES:
        if tool_call.parameters.get("ocr_text") or tool_call.parameters.get("candidate_id"):
            return CoordinateFindingMethod.OCR.value
        return CoordinateFindingMethod.PREDICTION.value
    return normalize_coordinate_method(
        tool_call.parameters.get("find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
