"""
Pydantic schemas for computer control tools.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator

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
from backend.src.tools.schema_fields import post_action_wait_field

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
    wait: float = post_action_wait_field()


# --- Wait Tool Schemas ---

class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')

    seconds: float = Field(
        ...,
        description="Number of seconds to wait before capturing a screenshot."
    )

