"""Pydantic schemas for computer control tools."""

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.src.core.types.enums import (
    CoordinateFindingMethod,
    KeyboardAction,
    MouseAction,
)
from backend.src.tools.computer.grounding_contract import (
    DragDestinationGroundingArgsMixin,
    SourceGroundingArgsMixin,
    validate_drag_destination_grounding_fields,
    validate_source_grounding_fields,
)
from backend.src.tools.schema_fields import explanation_field, post_action_wait_field


def _has_ocr_target(
    *,
    text: Optional[str],
    candidate_id: Optional[str],
) -> bool:
    return bool((text or "").strip() or (candidate_id or "").strip())


def _has_prediction_target(description: Optional[str]) -> bool:
    return bool((description or "").strip())


# Scroll direction: vertical (up/down) or horizontal (left/right). Uses vscroll
# for vertical, hscroll for horizontal.
ScrollToolDirection = Literal["up", "down", "left", "right"]


# --- Mouse Tool Schemas ---

class MouseControlArgs(SourceGroundingArgsMixin, DragDestinationGroundingArgsMixin):
    model_config = ConfigDict(extra='forbid')

    action: MouseAction = Field(
        ...,
        description=(
            "Mouse action to perform (click, double_click, right_click, move, or drag). "
            "Prefer keyboard shortcuts/hotkeys first when they can accomplish the same goal. "
            "Do not treat tool execution status alone as UI success; verify the expected UI change from the latest screenshot."
        ),
    )
    button: Literal["left", "right", "middle"] = Field(
        "left",
        description="Mouse button for click and double_click actions.",
    )

    # Action-specific fields
    duration: float = Field(0.5, description="Duration for drag operations")
    explanation: str = explanation_field()
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        """Validate that required fields are present based on find_coordinates_by value."""
        validate_source_grounding_fields(self)

        if self.action == MouseAction.DRAG:
            validate_drag_destination_grounding_fields(self)

        return self


# --- Keyboard Tool Schemas ---

class KeyboardControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: KeyboardAction = Field(
        ...,
        description=(
            "Keyboard action to perform: type (text input), paste (clipboard insert), "
            "press (single key), or hotkey (combined keys)."
            " Default to action='type' for text entry; use action='paste' mainly as a recovery override "
            "when action='type' does not land text. Prefer keyboard-driven navigation over clicking when equivalent. "
            "Use press/hotkey for submit actions only when submission is explicitly intended."
        ),
    )
    text: Optional[str] = Field(
        None,
        description=(
            "Text payload for action='type' or action='paste'. Start with action='type'; runtime may internally use safer "
            "paste-like insertion for multiline or long text. "
            "After input, verify the text is visible in the latest screenshot instead of assuming tool success means UI success. "
            "If text is missing, retry once with action='paste'; if still missing, refocus the field and retry."
        ),
    )
    key: Optional[str] = Field(
        None,
        description="Single key for action='press' (for example: enter, esc, tab).",
    )
    keys: Optional[List[str]] = Field(
        None,
        description="Ordered key list for action='hotkey' (for example: ['ctrl', 'l']).",
    )
    repeat: int = Field(
        1,
        description="Repeat count for action='press' or action='hotkey'.",
        ge=1,
        le=50,
    )
    interval_ms: int = Field(
        0,
        description="Delay between repeats in milliseconds for action='press' or action='hotkey'.",
        ge=0,
        le=2000,
    )
    explanation: str = explanation_field()
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        if self.action in {KeyboardAction.TYPE, KeyboardAction.PASTE}:
            if not self.text:
                raise ValueError("text parameter required for type or paste action")
            if len(self.text) > 10000:
                raise ValueError(
                    f"Text too long: {len(self.text)} characters (max 10000)"
                )
        if self.action == KeyboardAction.PRESS and not self.key:
            raise ValueError("key parameter required for press action")
        if self.action == KeyboardAction.HOTKEY and (
            not self.keys or len(self.keys) < 2
        ):
            raise ValueError("keys parameter required for hotkey action")
        return self


class GroundedMouseActionArgs(BaseModel):
    """OpenAI-only semantic mouse tool without manual-coordinate mode."""

    model_config = ConfigDict(extra='forbid')

    action: MouseAction = Field(
        ...,
        description=(
            "Mouse action to perform using OCR or vision grounding. "
            "Use OCR fields for visible text targets and source_description for non-text targets."
        ),
    )
    button: Literal["left", "right", "middle"] = Field(
        "left",
        description="Mouse button for click and double_click actions.",
    )
    ocr_text: Optional[str] = Field(
        None,
        description="Exact visible text to target via OCR.",
    )
    candidate_id: Optional[str] = Field(
        None,
        description="Stable OCR candidate id from a previous ambiguity response.",
    )
    source_description: Optional[str] = Field(
        None,
        description="Detailed visual description for non-text prediction grounding.",
    )
    model_name: Optional[str] = Field(
        None,
        description="Optional specific vision model override.",
    )
    drag_to_ocr_text: Optional[str] = Field(
        None,
        description="Exact visible text for the drag destination via OCR.",
    )
    drag_to_candidate_id: Optional[str] = Field(
        None,
        description="Stable OCR candidate id for the drag destination.",
    )
    destination_description: Optional[str] = Field(
        None,
        description="Detailed visual description for a non-text drag destination.",
    )
    drag_to_model_name: Optional[str] = Field(
        None,
        description="Optional specific vision model override for the drag destination.",
    )
    duration: float = Field(0.5, description="Duration for drag operations")
    explanation: str = explanation_field()
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_grounding_fields(self):
        source_grounding_choices = int(
            _has_ocr_target(text=self.ocr_text, candidate_id=self.candidate_id)
        ) + int(_has_prediction_target(self.source_description))
        if source_grounding_choices != 1:
            raise ValueError(
                "Provide exactly one source grounding path: OCR (ocr_text/candidate_id) or prediction (source_description)"
            )

        if self.action == MouseAction.DRAG:
            destination_grounding_choices = int(
                _has_ocr_target(
                    text=self.drag_to_ocr_text,
                    candidate_id=self.drag_to_candidate_id,
                )
            ) + int(_has_prediction_target(self.destination_description))
            if destination_grounding_choices != 1:
                raise ValueError(
                    "Drag actions require exactly one destination grounding path: OCR (drag_to_ocr_text/drag_to_candidate_id) or prediction (destination_description)"
                )
        return self


class GroundedScrollActionArgs(BaseModel):
    """OpenAI-only semantic scroll tool without manual-coordinate mode."""

    model_config = ConfigDict(extra='forbid')

    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(
        ...,
        description="Scroll action to perform against an OCR- or vision-grounded region.",
    )
    clicks: Optional[int] = Field(
        None,
        description="Optional literal wheel click override for follow-up fine tuning.",
    )
    direction: Optional[ScrollToolDirection] = Field(
        None,
        description="Direction for scroll action. Required when action is 'scroll'.",
    )
    ocr_text: Optional[str] = Field(
        None,
        description="Exact visible text to target via OCR.",
    )
    candidate_id: Optional[str] = Field(
        None,
        description="Stable OCR candidate id from a previous ambiguity response.",
    )
    source_description: Optional[str] = Field(
        None,
        description="Detailed visual description for non-text prediction grounding.",
    )
    model_name: Optional[str] = Field(
        None,
        description="Optional specific vision model override.",
    )
    explanation: str = explanation_field()
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_grounding_fields(self):
        grounding_choices = int(
            _has_ocr_target(text=self.ocr_text, candidate_id=self.candidate_id)
        ) + int(_has_prediction_target(self.source_description))
        if grounding_choices != 1:
            raise ValueError(
                "Provide exactly one grounding path: OCR (ocr_text/candidate_id) or prediction (source_description)"
            )
        if self.action == "scroll" and not self.direction:
            raise ValueError("direction required for scroll action")
        return self


class OpenAIComputerArgs(BaseModel):
    """Opaque OpenAI native computer call payload."""

    model_config = ConfigDict(extra='forbid')

    actions: List[dict[str, Any]] = Field(
        ...,
        description="Ordered OpenAI native computer actions to execute.",
        min_length=1,
    )


# --- Screenshot Tool Schemas ---

class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    model_config = ConfigDict(extra='ignore')

    explanation: str = explanation_field()
    wait: Optional[float] = Field(
        None,
        description="(OPTIONAL) Delay in seconds before capturing a screenshot. If provided, waits this duration before capture."
    )


# --- Scroll Tool Schemas ---

class ScrollControlArgs(SourceGroundingArgsMixin):
    model_config = ConfigDict(extra='forbid')

    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(
        ...,
        description=(
            "Scroll action to perform (`scroll`, `scroll_up`, or `scroll_down`). "
            "Vertical actions default to a coarse executor-owned step."
        ),
    )
    clicks: Optional[int] = Field(
        None,
        description=(
            "Optional explicit literal OS wheel click override. Fallback-only for "
            "follow-up fine tuning. Omit it on the first vertical scroll attempt so "
            "the executor chooses the default click amount (8 on macOS, 5 on "
            "Windows/Linux)."
        ),
    )
    direction: Optional[ScrollToolDirection] = Field(
        None,
        description="Direction for scroll action: vertical 'up'|'down', or horizontal 'left'|'right'. Required when action is 'scroll'.",
    )
    explanation: str = explanation_field()
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        validate_source_grounding_fields(self)

        if self.action == "scroll" and not self.direction:
            raise ValueError("direction required for scroll action")
        return self


# --- Switch Tab Tool Schemas ---

class SwitchTabArgs(BaseModel):
    """Arguments for switching to a specific tab/window."""
    model_config = ConfigDict(extra='forbid')

    tab_name: str = Field(
        ...,
        description=(
            "Exact window or tab title to focus, matching get_open_windows output exactly."
        ),
    )
    match_mode: Literal["exact", "contains", "regex"] = Field(
        "exact",
        description="Window title match mode.",
    )
    explanation: str = explanation_field()
    wait: float = post_action_wait_field()


# --- Wait Tool Schemas ---

class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')

    seconds: float = Field(
        ...,
        description="Number of seconds to wait before capturing a screenshot."
    )
    explanation: str = explanation_field()
