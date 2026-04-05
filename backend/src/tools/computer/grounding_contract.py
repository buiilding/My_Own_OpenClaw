"""Shared grounding contract helpers for computer-use tools."""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.src.core.types.enums import CoordinateFindingMethod

SOURCE_GROUNDED_TOOL_NAMES = frozenset(
    {
        "mouse_control",
        "scroll_control",
        "grounded_mouse_action",
        "grounded_scroll_action",
    }
)
DRAG_DESTINATION_GROUNDED_TOOL_NAMES = frozenset(
    {"mouse_control", "grounded_mouse_action"}
)


def supports_source_grounding(tool_name: str) -> bool:
    return tool_name in SOURCE_GROUNDED_TOOL_NAMES


def supports_drag_destination_grounding(tool_name: str) -> bool:
    return tool_name in DRAG_DESTINATION_GROUNDED_TOOL_NAMES


class SourceGroundingArgsMixin(BaseModel):
    """Reusable grounded source-target fields for computer-use tools."""

    model_config = ConfigDict(extra="ignore")

    find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL,
        description=(
            "Coordinate targeting strategy. Use 'ocr' for visible text targets, "
            "'prediction' for non-text visual targets, and 'manual' only when "
            "you have reliable coordinates from the latest screenshot and use the "
            "visible mouse position as a spatial reference. For manual clicks, success "
            "requires both cursor alignment and the intended UI state change."
        ),
    )
    x: Optional[int] = Field(
        None,
        description=(
            "X coordinate in screenshot pixels. Required when find_coordinates_by='manual'. "
            "Beware of the mouse position on the image when determining manual coordinates."
        ),
    )
    y: Optional[int] = Field(
        None,
        description=(
            "Y coordinate in screenshot pixels. Required when find_coordinates_by='manual'. "
            "Beware of the mouse position on the image when determining manual coordinates."
        ),
    )
    ocr_text: Optional[str] = Field(
        None,
        description=(
            "Exact visible on-screen text for OCR targeting. Required when "
            "find_coordinates_by='ocr' unless candidate_id is provided. Prefer this "
            "whenever clicking text-labeled elements such as buttons, tabs, and inputs "
            "like 'type something here'."
        ),
    )
    candidate_id: Optional[str] = Field(
        None,
        description=(
            "Stable OCR candidate id from an earlier ambiguity response. "
            "Use this for deterministic follow-up selection when multiple OCR matches exist."
        ),
    )
    source_description: Optional[str] = Field(
        None,
        description=(
            "Detailed visual description of the source target when "
            "find_coordinates_by='prediction'."
        ),
    )
    model_name: Optional[str] = Field(
        None,
        description="Optional specific vision model to use for prediction grounding.",
    )


class DragDestinationGroundingArgsMixin(BaseModel):
    """Reusable drag destination fields for grounded drag actions."""

    model_config = ConfigDict(extra="ignore")

    drag_to_x: Optional[int] = Field(
        None,
        description=(
            "Destination X coordinate in screenshot pixels for drag actions. "
            "Required when drag_to_find_coordinates_by='manual'."
        ),
    )
    drag_to_y: Optional[int] = Field(
        None,
        description=(
            "Destination Y coordinate in screenshot pixels for drag actions. "
            "Required when drag_to_find_coordinates_by='manual'."
        ),
    )
    drag_to_find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL,
        description=(
            "Destination coordinate targeting strategy for drag actions. "
            "Use 'ocr' for text-labeled targets, 'prediction' for non-text targets, "
            "and 'manual' when you already know destination screenshot coordinates."
        ),
    )
    drag_to_ocr_text: Optional[str] = Field(
        None,
        description=(
            "Exact visible on-screen text for the drag destination when "
            "drag_to_find_coordinates_by='ocr'."
        ),
    )
    drag_to_candidate_id: Optional[str] = Field(
        None,
        description=(
            "Stable OCR candidate id for the drag destination when "
            "drag_to_find_coordinates_by='ocr'."
        ),
    )
    destination_description: Optional[str] = Field(
        None,
        description=(
            "Detailed visual description of the drag destination when "
            "drag_to_find_coordinates_by='prediction'."
        ),
    )
    drag_to_model_name: Optional[str] = Field(
        None,
        description="Optional specific vision model to use for drag destination prediction.",
    )


def validate_source_grounding_fields(instance: SourceGroundingArgsMixin) -> None:
    """Validate required grounded-source fields for one schema instance."""
    if instance.find_coordinates_by == CoordinateFindingMethod.MANUAL:
        if instance.x is None or instance.y is None:
            raise ValueError(
                "x and y coordinates are required when find_coordinates_by='manual'"
            )
        return

    if instance.find_coordinates_by == CoordinateFindingMethod.OCR:
        if not instance.ocr_text and not instance.candidate_id:
            raise ValueError(
                "ocr_text or candidate_id is required when find_coordinates_by='ocr'"
            )
        return

    if not instance.source_description:
        raise ValueError(
            "source_description is required when find_coordinates_by='prediction'"
        )


def validate_drag_destination_grounding_fields(
    instance: DragDestinationGroundingArgsMixin,
) -> None:
    """Validate required drag destination fields for one schema instance."""
    if instance.drag_to_find_coordinates_by == CoordinateFindingMethod.MANUAL:
        if instance.drag_to_x is None or instance.drag_to_y is None:
            raise ValueError(
                "drag_to_x and drag_to_y are required when drag_to_find_coordinates_by='manual'"
            )
        return

    if instance.drag_to_find_coordinates_by == CoordinateFindingMethod.OCR:
        if not instance.drag_to_ocr_text and not instance.drag_to_candidate_id:
            raise ValueError(
                "drag_to_ocr_text or drag_to_candidate_id is required when drag_to_find_coordinates_by='ocr'"
            )
        return

    if not instance.destination_description:
        raise ValueError(
            "destination_description is required when drag_to_find_coordinates_by='prediction'"
        )


def build_source_grounding_json_properties() -> Dict[str, Dict[str, Any]]:
    """Return canonical source-grounding JSON Schema properties."""
    return {
        "find_coordinates_by": {
            "type": "string",
            "description": "Coordinate targeting method.",
            "default": "manual",
            "enum": ["manual", "ocr", "prediction"],
        },
        "x": {
            "type": "integer",
            "description": (
                "X coordinate in screenshot pixels. Required when "
                "find_coordinates_by='manual'."
            ),
        },
        "y": {
            "type": "integer",
            "description": (
                "Y coordinate in screenshot pixels. Required when "
                "find_coordinates_by='manual'."
            ),
        },
        "ocr_text": {
            "type": "string",
            "description": "Visible text target for OCR selection.",
        },
        "candidate_id": {
            "type": "string",
            "description": "OCR candidate id from an earlier response.",
        },
        "source_description": {
            "type": "string",
            "description": "Visual source target description for prediction.",
        },
        "model_name": {
            "type": "string",
            "description": "Optional prediction model override.",
        },
    }


def build_source_grounding_json_rules() -> list[Dict[str, Any]]:
    """Return canonical source-grounding JSON Schema conditional rules."""
    return [
        {
            "if": {
                "properties": {"find_coordinates_by": {"const": "manual"}},
                "required": ["find_coordinates_by"],
            },
            "then": {"required": ["x", "y"]},
        },
        {
            "if": {
                "properties": {"find_coordinates_by": {"const": "ocr"}},
                "required": ["find_coordinates_by"],
            },
            "then": {
                "anyOf": [
                    {"required": ["ocr_text"]},
                    {"required": ["candidate_id"]},
                ],
            },
        },
        {
            "if": {
                "properties": {"find_coordinates_by": {"const": "prediction"}},
                "required": ["find_coordinates_by"],
            },
            "then": {"required": ["source_description"]},
        },
    ]


def build_drag_destination_json_properties() -> Dict[str, Dict[str, Any]]:
    """Return canonical drag destination JSON Schema properties."""
    return {
        "drag_to_x": {
            "type": "integer",
            "description": (
                "Destination X for drag. Required when action='drag' and "
                "drag_to_find_coordinates_by='manual'."
            ),
        },
        "drag_to_y": {
            "type": "integer",
            "description": (
                "Destination Y for drag. Required when action='drag' and "
                "drag_to_find_coordinates_by='manual'."
            ),
        },
        "drag_to_find_coordinates_by": {
            "type": "string",
            "description": "Drag destination targeting method.",
            "default": "manual",
            "enum": ["manual", "ocr", "prediction"],
        },
        "drag_to_ocr_text": {
            "type": "string",
            "description": "Visible text target for OCR drag destination.",
        },
        "drag_to_candidate_id": {
            "type": "string",
            "description": "OCR candidate id for drag destination.",
        },
        "destination_description": {
            "type": "string",
            "description": "Visual drag destination for prediction.",
        },
        "drag_to_model_name": {
            "type": "string",
            "description": "Optional model override for drag prediction.",
        },
    }


def build_drag_destination_json_rules() -> list[Dict[str, Any]]:
    """Return canonical drag-destination JSON Schema conditional rules."""
    return [
        {
            "if": {
                "properties": {
                    "action": {"const": "drag"},
                    "drag_to_find_coordinates_by": {"const": "manual"},
                },
                "required": ["action", "drag_to_find_coordinates_by"],
            },
            "then": {"required": ["drag_to_x", "drag_to_y"]},
        },
        {
            "if": {
                "properties": {
                    "action": {"const": "drag"},
                    "drag_to_find_coordinates_by": {"const": "ocr"},
                },
                "required": ["action", "drag_to_find_coordinates_by"],
            },
            "then": {
                "anyOf": [
                    {"required": ["drag_to_ocr_text"]},
                    {"required": ["drag_to_candidate_id"]},
                ],
            },
        },
        {
            "if": {
                "properties": {
                    "action": {"const": "drag"},
                    "drag_to_find_coordinates_by": {"const": "prediction"},
                },
                "required": ["action", "drag_to_find_coordinates_by"],
            },
            "then": {"required": ["destination_description"]},
        },
    ]
