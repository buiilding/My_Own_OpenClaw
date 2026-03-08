"""
Pydantic schemas for computer control tools.
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator

from backend.src.core.types.enums import (
    CoordinateFindingMethod,
    KeyboardAction,
    MouseAction,
)
from backend.src.tools.schema_fields import post_action_wait_field

# --- Mouse Tool Schemas ---

class MouseControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: MouseAction = Field(
        ...,
        description=(
            "Mouse action to perform (click, double_click, right_click, move, or drag). "
            "Prefer keyboard shortcuts/hotkeys first when they can accomplish the same goal. "
            "Do not treat tool execution status alone as UI success; verify the expected UI change from the latest screenshot."
        ),
    )

    # Coordinate finding method
    find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL,
        description=(
            "Coordinate targeting strategy. If the target has visible text, use 'ocr' "
            "with exact ocr_text for initial targeting, then use candidate_id "
            "for ambiguity retries. For manual targeting, ground x/y from the latest "
            "screenshot and use the visible mouse position as a spatial reference. "
            "For manual clicks, success requires both cursor alignment and the intended UI state change."
        ),
    )

    # Manual coordinate fields
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
    drag_to_x: Optional[int] = Field(
        None,
        description=(
            "Destination X coordinate in screenshot pixels for drag actions. "
            "Required when action='drag' and drag_to_find_coordinates_by='manual'."
        ),
    )
    drag_to_y: Optional[int] = Field(
        None,
        description=(
            "Destination Y coordinate in screenshot pixels for drag actions. "
            "Required when action='drag' and drag_to_find_coordinates_by='manual'."
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
        description="Optional specific vision model to use for drag destination prediction",
    )

    # OCR coordinate fields
    ocr_text: Optional[str] = Field(
        None,
        description=(
            "Exact visible on-screen text for OCR targeting. Required for "
            "find_coordinates_by='ocr' unless candidate_id is provided. Prefer this whenever clicking text-labeled "
            "elements (placeholders, buttons, tabs). Example: if an input shows "
            "'type something here', pass that exact string. Keep text to one line; "
            "OCR matching is weaker on multiline strings."
        ),
    )
    candidate_id: Optional[str] = Field(
        None,
        description=(
            "Stable OCR candidate id from an earlier ambiguity response. "
            "Use this for deterministic follow-up selection when multiple OCR matches exist."
        ),
    )

    # Prediction coordinate fields
    source_description: Optional[str] = Field(
        None,
        description=(
            "Detailed visual description of a non-text target (icon, image, shape, relative location). "
            "Required for find_coordinates_by='prediction'. Do not combine with ocr_text."
        ),
    )
    model_name: Optional[str] = Field(None, description="Optional specific vision model to use for prediction")

    # Action-specific fields
    duration: float = Field(0.5, description="Duration for drag operations")
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        """Validate that required fields are present based on find_coordinates_by value."""
        if self.find_coordinates_by == CoordinateFindingMethod.MANUAL:
            if self.x is None or self.y is None:
                raise ValueError(
                    "x and y coordinates are required when find_coordinates_by='manual'"
                )
        elif self.find_coordinates_by == CoordinateFindingMethod.OCR:
            if not self.ocr_text and not self.candidate_id:
                raise ValueError(
                    "ocr_text or candidate_id is required when find_coordinates_by='ocr'"
                )
        elif self.find_coordinates_by == CoordinateFindingMethod.PREDICTION:
            if not self.source_description:
                raise ValueError("source_description is required when find_coordinates_by='prediction'")

        if self.action == MouseAction.DRAG:
            if self.drag_to_find_coordinates_by == CoordinateFindingMethod.MANUAL:
                if self.drag_to_x is None or self.drag_to_y is None:
                    raise ValueError(
                        "drag_to_x and drag_to_y are required when action='drag' and "
                        "drag_to_find_coordinates_by='manual'"
                    )
            elif self.drag_to_find_coordinates_by == CoordinateFindingMethod.OCR:
                if not self.drag_to_ocr_text and not self.drag_to_candidate_id:
                    raise ValueError(
                        "drag_to_ocr_text or drag_to_candidate_id is required when "
                        "action='drag' and drag_to_find_coordinates_by='ocr'"
                    )
            elif self.drag_to_find_coordinates_by == CoordinateFindingMethod.PREDICTION:
                if not self.destination_description:
                    raise ValueError(
                        "destination_description is required when action='drag' and "
                        "drag_to_find_coordinates_by='prediction'"
                    )

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
    wait: float = post_action_wait_field()


# --- Screenshot Tool Schemas ---

class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    model_config = ConfigDict(extra='ignore')
    
    wait: Optional[float] = Field(
        None,
        description="(OPTIONAL) Delay in seconds before capturing a screenshot. If provided, waits this duration before capture."
    )


# --- Scroll Tool Schemas ---

# Scroll direction: vertical (up/down) or horizontal (left/right). Uses vscroll for vertical, hscroll for horizontal.
ScrollToolDirection = Literal["up", "down", "left", "right"]

class ScrollControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(
        ...,
        description="Scroll action to perform (`scroll`, `scroll_up`, or `scroll_down`).",
    )
    find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL,
        description=(
            "Coordinate targeting strategy for the scroll focus region. Use 'ocr' for visible "
            "text targets, 'prediction' for non-text visual regions, and 'manual' only when "
            "you have reliable coordinates from the latest screenshot."
        ),
    )
    x: Optional[int] = Field(
        None,
        description="Screen X coordinate to move to before scrolling. Required when find_coordinates_by='manual'.",
    )
    y: Optional[int] = Field(
        None,
        description="Screen Y coordinate to move to before scrolling. Required when find_coordinates_by='manual'.",
    )
    ocr_text: Optional[str] = Field(
        None,
        description=(
            "Exact visible on-screen text for OCR targeting. Required for "
            "find_coordinates_by='ocr' unless candidate_id is provided."
        ),
    )
    candidate_id: Optional[str] = Field(
        None,
        description=(
            "Stable OCR candidate id from an earlier ambiguity response. "
            "Use this for deterministic follow-up scroll targeting when multiple OCR matches exist."
        ),
    )
    source_description: Optional[str] = Field(
        None,
        description=(
            "Detailed visual description of the scroll target region when "
            "find_coordinates_by='prediction'."
        ),
    )
    model_name: Optional[str] = Field(
        None,
        description="Optional specific vision model to use for scroll target prediction",
    )
    clicks: int = Field(
        5,
        description="Scroll click count (positive moves up/right, negative moves down/left).",
    )
    direction: Optional[ScrollToolDirection] = Field(
        None,
        description="Direction for scroll action: vertical 'up'|'down', or horizontal 'left'|'right'. Required when action is 'scroll'.",
    )
    wait: float = post_action_wait_field()

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        if self.find_coordinates_by == CoordinateFindingMethod.MANUAL:
            if self.x is None or self.y is None:
                raise ValueError(
                    "x and y coordinates are required when find_coordinates_by='manual'"
                )
        elif self.find_coordinates_by == CoordinateFindingMethod.OCR:
            if not self.ocr_text and not self.candidate_id:
                raise ValueError(
                    "ocr_text or candidate_id is required when find_coordinates_by='ocr'"
                )
        elif self.find_coordinates_by == CoordinateFindingMethod.PREDICTION:
            if not self.source_description:
                raise ValueError(
                    "source_description is required when find_coordinates_by='prediction'"
                )

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
    wait: float = post_action_wait_field()


# --- Wait Tool Schemas ---

class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')

    seconds: float = Field(
        ...,
        description="Number of seconds to wait before capturing a screenshot."
    )


class ComputerUseMetadata(BaseModel):
    """Required rationale payload for computer-use calls."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    description: str = Field(
        ...,
        min_length=1,
        description="Current observed UI/screen state before action.",
    )
    explanation: str = Field(
        ...,
        min_length=1,
        description="Why this action is needed toward the goal.",
    )
    expectation: str = Field(
        ...,
        min_length=1,
        description="Expected UI state after action.",
    )


class ComputerUseArgs(BaseModel):
    """
    Unified computer-use tool envelope.

    `tool` selects the concrete computer action. `arguments` are validated against
    the selected action schema by RemoteComputerUseTool at runtime.
    """

    model_config = ConfigDict(extra="forbid")

    tool: Literal[
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_tab",
        "wait",
    ] = Field(
        ...,
        description="Concrete computer-use action to execute.",
    )
    metadata: ComputerUseMetadata = Field(
        ...,
        description=(
            "Required execution rationale metadata for computer-use actions."
        ),
    )
    arguments: Dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Arguments for the selected `tool` action. "
            "For `mouse_control`, this follows mouse schema fields including "
            "`action`, `find_coordinates_by` (`manual` | `ocr` | `prediction`), "
            "`x`/`y` for manual, `ocr_text` or `candidate_id` for OCR, and "
            "`source_description` for prediction plus `destination_description` "
            "for drag destinations using prediction. "
            "For other tools, use the same arguments as their legacy schemas "
            "(keyboard_control/screenshot/scroll_control/switch_tab/wait)."
        ),
    )
