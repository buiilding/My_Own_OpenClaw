"""Backend-owned validation for parsed and resolved tool calls before dispatch."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.llm.parser_types import ParsedToolCall


class ExecutorMouseControlArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str
    x: int | None = None
    y: int | None = None
    drag_to_x: int | None = None
    drag_to_y: int | None = None
    button: str = "left"
    duration: float = 0.5
    wait: float = 0.0

    @model_validator(mode="after")
    def validate_action_fields(self):
        if self.action not in {"click", "double_click", "right_click", "move", "drag"}:
            raise ValueError(f"Unknown mouse action: {self.action}")
        if self.x is None or self.y is None:
            raise ValueError("X and Y coordinates are required")
        if self.action == "drag" and (
            self.drag_to_x is None or self.drag_to_y is None
        ):
            raise ValueError("drag_to_x and drag_to_y are required for drag action")
        return self


class ExecutorKeyboardControlArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str
    text: str | None = None
    key: str | None = None
    keys: list[str] | None = None
    repeat: int = Field(default=1, ge=1, le=50)
    interval_ms: int = Field(default=0, ge=0, le=2000)
    wait: float = 0.0

    @model_validator(mode="after")
    def validate_action_fields(self):
        if self.action not in {"type", "paste", "press", "hotkey"}:
            raise ValueError(f"Unknown keyboard action: {self.action}")
        if self.action in {"type", "paste"} and not self.text:
            raise ValueError("text parameter required for type or paste action")
        if self.action == "press" and not self.key:
            raise ValueError("key parameter required for press action")
        if self.action == "hotkey" and (not self.keys or len(self.keys) < 2):
            raise ValueError("keys parameter required for hotkey action")
        return self


class ExecutorScrollControlArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str
    x: int
    y: int
    clicks: int = 5
    direction: str | None = None
    wait: float = 0.0

    @model_validator(mode="after")
    def validate_action_fields(self):
        if self.action not in {"scroll", "scroll_up", "scroll_down"}:
            raise ValueError(f"Unknown scroll action: {self.action}")
        if self.action == "scroll" and not self.direction:
            raise ValueError("direction required for scroll action")
        return self


class ExecutorSwitchTabArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tab_name: str
    match_mode: str = "exact"
    wait: float = 0.0

    @model_validator(mode="after")
    def validate_action_fields(self):
        if self.match_mode not in {"exact", "contains", "regex"}:
            raise ValueError(
                "match_mode must be one of: exact, contains, regex"
            )
        return self


_EXECUTOR_MODELS_BY_TOOL: dict[str, type[BaseModel]] = {
    "mouse_control": ExecutorMouseControlArgs,
    "keyboard_control": ExecutorKeyboardControlArgs,
    "scroll_control": ExecutorScrollControlArgs,
    "switch_tab": ExecutorSwitchTabArgs,
}

_GROUNDED_SOURCE_FIELDS = (
    "find_coordinates_by",
    "ocr_text",
    "candidate_id",
    "source_description",
    "model_name",
    "screenshot_id",
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
    """Validate model-emitted args against backend-owned tool arg models."""
    if tool_registry is None:
        return None

    tool = tool_registry.get_tool(tool_call.tool_name)
    args_model = getattr(tool, "args_model", None) if tool is not None else None
    if args_model is None:
        return None

    try:
        args_model.model_validate(tool_call.parameters or {})
    except ValidationError as exc:
        return (
            f"{tool_call.tool_name} call is invalid and was rejected before frontend execution. "
            f"{_format_validation_error(exc)}"
        )
    return None


def sanitize_and_validate_resolved_tool_call(
    resolved_call: ResolvedToolCall,
    *,
    enabled: bool,
) -> Optional[str]:
    """Normalize resolved args into executor shape and validate before dispatch."""
    if not enabled:
        return None

    _strip_grounding_only_fields(resolved_call)
    model = _EXECUTOR_MODELS_BY_TOOL.get(resolved_call.tool_name)
    if model is None:
        return None

    try:
        validated = model.model_validate(resolved_call.parameters or {})
    except ValidationError as exc:
        return (
            f"{resolved_call.tool_name} call is invalid and was rejected before frontend execution. "
            f"{_format_validation_error(exc)}"
        )

    resolved_call.parameters = validated.model_dump(
        exclude_none=True,
        exclude_defaults=True,
    )
    return None


def _strip_grounding_only_fields(resolved_call: ResolvedToolCall) -> None:
    if resolved_call.tool_name not in {"mouse_control", "scroll_control"}:
        return

    for field_name in _GROUNDED_SOURCE_FIELDS:
        resolved_call.parameters.pop(field_name, None)

    if resolved_call.tool_name == "mouse_control":
        for field_name in _GROUNDED_DRAG_FIELDS:
            resolved_call.parameters.pop(field_name, None)
