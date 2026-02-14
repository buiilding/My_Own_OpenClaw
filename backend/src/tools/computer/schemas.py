"""
Pydantic schemas for computer control tools.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator

from backend.src.core.types.enums import (
    CoordinateFindingMethod,
    KeyboardAction,
    MouseAction,
    ScrollDirection as ScrollDirectionEnum,
)

# --- Mouse Tool Schemas ---

class MouseControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: MouseAction = Field(
        ...,
        description="Mouse action to perform (click, double_click, right_click, move, drag, or scroll).",
    )

    # Coordinate finding method
    find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL,
        description=(
            "Coordinate targeting strategy. Prefer 'ocr' for visible text targets, "
            "'prediction' for non-text UI elements, and 'manual' only as fallback."
        ),
    )

    # Manual coordinate fields
    x: Optional[int] = Field(
        None,
        description="X coordinate in screen pixels. Required when find_coordinates_by='manual'.",
    )
    y: Optional[int] = Field(
        None,
        description="Y coordinate in screen pixels. Required when find_coordinates_by='manual'.",
    )

    # OCR coordinate fields
    ocr_text: Optional[str] = Field(
        None,
        description=(
            "Exact on-screen text for OCR targeting. Required for find_coordinates_by='ocr'. Generate the exact text that you see on the image, the text should be on the same line, the ocr doesnt work well with multi-line text."
        ),
    )

    # Prediction coordinate fields
    description: Optional[str] = Field(
        None,
        description=(
            "Detailed visual description of a non-text target (icon, image, shape, relative location). "
            "Required for find_coordinates_by='prediction'. Do not combine with ocr_text."
        ),
    )
    model_name: Optional[str] = Field(None, description="Optional specific vision model to use for prediction")

    # Action-specific fields
    scroll_amount: Optional[int] = Field(None, description="Amount to scroll (positive for down/right, negative for up/left, required for scroll action)")
    scroll_direction: Optional[ScrollDirectionEnum] = Field(ScrollDirectionEnum.VERTICAL, description="Direction of scrolling (required for scroll action)")
    duration: float = Field(0.5, description="Duration for drag operations")
    wait: float = Field(
        0.0,
        description="Delay in seconds before automatic post-action screenshot capture."
    )

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        """Validate that required fields are present based on find_coordinates_by value."""
        if self.find_coordinates_by == CoordinateFindingMethod.MANUAL:
            if self.x is None or self.y is None:
                raise ValueError("x and y coordinates are required when find_coordinates_by='manual'")
        elif self.find_coordinates_by == CoordinateFindingMethod.OCR:
            if not self.ocr_text:
                raise ValueError("ocr_text is required when find_coordinates_by='ocr'")
        elif self.find_coordinates_by == CoordinateFindingMethod.PREDICTION:
            if not self.description:
                raise ValueError("description is required when find_coordinates_by='prediction'")

        if self.action == MouseAction.SCROLL:
            if self.scroll_amount is None:
                raise ValueError("scroll_amount is required when action='scroll'")

        return self


# --- Keyboard Tool Schemas ---

class KeyboardControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: KeyboardAction = Field(
        ...,
        description=(
            "Keyboard action to perform: type (text input), press (single key), or hotkey (combined keys)."
        ),
    )
    text: Optional[str] = Field(
        None,
        description=(
            "Text payload for action='type'. Use with deterministic follow-up key presses when needed "
            "(for example, submit after input)."
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
    wait: float = Field(
        0.0,
        description="Delay in seconds before automatic post-action screenshot capture."
    )


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

    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(..., description="Scroll action to perform")
    x: int = Field(..., description="X coordinate to move to before scrolling (manual coordinates only)")
    y: int = Field(..., description="Y coordinate to move to before scrolling (manual coordinates only)")
    clicks: int = Field(5, description="Number of scroll clicks (positive=up/right, negative=down/left)")
    direction: Optional[ScrollToolDirection] = Field(
        None,
        description="Direction for scroll action: vertical 'up'|'down', or horizontal 'left'|'right'. Required when action is 'scroll'.",
    )
    wait: float = Field(
        0.0,
        description="Delay in seconds before automatic post-action screenshot capture."
    )

    @model_validator(mode='after')
    def validate_direction(self):
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
    wait: float = Field(
        0.0,
        description="Delay in seconds before automatic post-action screenshot capture."
    )


# --- Wait Tool Schemas ---

class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')

    seconds: float = Field(
        ...,
        description="Number of seconds to wait before capturing a screenshot."
    )
