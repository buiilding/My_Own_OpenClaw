"""Backend-owned validation for backend-executed tool calls."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import ValidationError

from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.llm.parser_types import ParsedToolCall

_BACKEND_VALIDATION_FAILURE_MARKER = (
    "call is invalid and was rejected before backend execution"
)
_GROUNDED_SOURCE_FIELDS = (
    "find_coordinates_by",
    "ocr_text",
    "candidate_id",
    "source_description",
    "model_name",
)
_GROUNDED_DRAG_FIELDS = (
    "drag_to_find_coordinates_by",
    "drag_to_ocr_text",
    "drag_to_candidate_id",
    "destination_description",
    "drag_to_model_name",
)


def _format_validation_error(exc: ValidationError) -> str:
    parts: list[str] = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", ()))
        message = str(error.get("msg", "invalid value"))
        parts.append(f"{location}: {message}" if location else message)
    return "; ".join(parts) if parts else str(exc)


def validate_parsed_tool_call(
    tool_call: ParsedToolCall,
    tool_registry: Any | None,
) -> Optional[str]:
    """Validate model-emitted args only when the backend owns execution."""
    if tool_registry is None:
        return None

    tool = tool_registry.get_tool(tool_call.tool_name)
    if getattr(tool, "execution_target", None) != "backend":
        return None

    args_model = getattr(tool, "args_model", None)
    if args_model is None:
        return None

    try:
        args_model.model_validate(tool_call.parameters or {})
    except ValidationError as exc:
        return (
            f"{tool_call.tool_name} {_BACKEND_VALIDATION_FAILURE_MARKER}. "
            f"Details: {_format_validation_error(exc)}."
        )
    return None


def sanitize_resolved_tool_call(
    resolved_call: ResolvedToolCall,
    *,
    enabled: bool,
) -> None:
    """Strip backend-only grounding fields before local dispatch."""
    if enabled:
        _strip_grounding_only_fields(resolved_call)


def _strip_grounding_only_fields(resolved_call: ResolvedToolCall) -> None:
    if resolved_call.tool_name not in {"mouse_control", "scroll_control"}:
        return
    if not isinstance(resolved_call.parameters, dict):
        return
    if "screenshot_id" in resolved_call.parameters:
        raise ValueError(
            f"{resolved_call.tool_name} no longer accepts screenshot_id; "
            "use current-frame coordinates without passing screenshot_id."
        )

    for field_name in _GROUNDED_SOURCE_FIELDS:
        resolved_call.parameters.pop(field_name, None)

    if resolved_call.tool_name == "mouse_control":
        for field_name in _GROUNDED_DRAG_FIELDS:
            resolved_call.parameters.pop(field_name, None)
