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

    action: MouseAction = Field(..., description="Mouse action to perform")

    # Coordinate finding method
    find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL, description="Method to find the target coordinates for the mouse action"
    )

    # Manual coordinate fields
    x: Optional[int] = Field(None, description="X coordinate (required when find_coordinates_by='manual')")
    y: Optional[int] = Field(None, description="Y coordinate (required when find_coordinates_by='manual')")

    # OCR coordinate fields
    ocr_text: Optional[str] = Field(None, description="Exact text to search for on screen using OCR. Required for 'ocr' method. Do NOT use for 'prediction'.")

    # Prediction coordinate fields
    description: Optional[str] = Field(None, description="Highly detailed visual description of the non-text element (icon, image). Required for 'prediction' method. Do NOT use for 'ocr'.")
    model_name: Optional[str] = Field(None, description="Optional specific vision model to use for prediction")

    # Action-specific fields
    scroll_amount: Optional[int] = Field(None, description="Amount to scroll (positive for down/right, negative for up/left, required for scroll action)")
    scroll_direction: Optional[ScrollDirectionEnum] = Field(ScrollDirectionEnum.VERTICAL, description="Direction of scrolling (required for scroll action)")
    duration: float = Field(0.5, description="Duration for drag operations")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this mouse action executes."
    )
    wait: float = Field(
        ...,
        description="Delay in seconds before taking a screenshot after tool execution."
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

    action: KeyboardAction = Field(..., description="Keyboard action to perform")
    text: Optional[str] = Field(None, description="Text to type (required for 'type' action)")
    key: Optional[str] = Field(None, description="Single key to press (required for 'press' action)")
    keys: Optional[List[str]] = Field(None, description="List of keys for hotkey (required for 'hotkey' action)")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this keyboard action executes."
    )
    wait: float = Field(
        ...,
        description="Delay in seconds before taking a screenshot after tool execution."
    )


# --- Screenshot Tool Schemas ---

class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    model_config = ConfigDict(extra='forbid')
    
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this action executes."
    )


# --- Scroll Tool Schemas ---

# Scroll direction for this tool (different from ScrollDirection enum used in mouse_tool)
ScrollToolDirection = Literal["up", "down", "left", "right"]

class ScrollControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(..., description="Scroll action to perform")
    x: Optional[int] = Field(None, description="X coordinate to scroll at (optional, uses current cursor if not provided)")
    y: Optional[int] = Field(None, description="Y coordinate to scroll at (optional, uses current cursor if not provided)")
    clicks: int = Field(5, description="Number of scroll clicks")
    direction: Optional[ScrollToolDirection] = Field(None, description="Direction for scroll action ('up', 'down', 'left', 'right')")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this scroll action executes."
    )
    wait: float = Field(
        ...,
        description="Delay in seconds before taking a screenshot after tool execution."
    )


# --- Switch Tab Tool Schemas ---

class SwitchTabArgs(BaseModel):
    """Arguments for switching to a specific tab/window."""
    model_config = ConfigDict(extra='forbid')

    tab_name: str = Field(
        ...,
        description="The exact name of the tab/window to switch to, as it appears in get_open_windows output."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after switching to this tab."
    )
    wait: float = Field(
        ...,
        description="Delay in seconds before taking a screenshot after tool execution."
    )


# --- Wait Tool Schemas ---

class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')

    seconds: float = Field(
        ...,
        description="Number of seconds to wait before capturing a screenshot."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this action executes."
    )
