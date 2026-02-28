"""
Pydantic schemas for local backend tools.

Provides type-safe argument validation for all tools.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator


# --- Mouse Tool Schemas ---

class MouseControlArgs(BaseModel):
    """Arguments for mouse control tool."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["click", "double_click", "right_click", "move", "drag", "scroll"] = Field(
        ..., description="Mouse action to perform"
    )
    x: Optional[int] = Field(None, description="X coordinate (required for all actions except scroll)")
    y: Optional[int] = Field(None, description="Y coordinate (required for all actions except scroll)")
    scroll_amount: Optional[int] = Field(None, description="Amount to scroll (required for scroll action)")
    scroll_direction: Literal["vertical", "horizontal"] = Field("vertical", description="Scroll direction")
    wait: Optional[float] = Field(
        2.0,
        description="Delay in seconds before taking a screenshot after tool execution."
    )
    
    @model_validator(mode='after')
    def validate_coordinates(self):
        """Validate that coordinates are provided when required."""
        if self.action != "scroll" and (self.x is None or self.y is None):
            raise ValueError("X and Y coordinates are required for this action")
        if self.action == "scroll" and self.scroll_amount is None:
            raise ValueError("scroll_amount is required for scroll action")
        return self


# --- Keyboard Tool Schemas ---

class KeyboardControlArgs(BaseModel):
    """Arguments for keyboard control tool."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["type", "press", "hotkey"] = Field(..., description="Keyboard action to perform")
    text: Optional[str] = Field(None, description="Text to type (required for 'type' action)")
    key: Optional[str] = Field(None, description="Single key to press (required for 'press' action)")
    keys: Optional[List[str]] = Field(None, description="List of keys for hotkey (required for 'hotkey' action)")
    wait: Optional[float] = Field(
        2.0,
        description="Delay in seconds before taking a screenshot after tool execution."
    )
    
    @model_validator(mode='after')
    def validate_action_fields(self):
        """Validate that required fields are present based on action."""
        if self.action == "type" and not self.text:
            raise ValueError("text parameter required for type action")
        if self.action == "press" and not self.key:
            raise ValueError("key parameter required for press action")
        if self.action == "hotkey" and (not self.keys or len(self.keys) == 0):
            raise ValueError("keys parameter required for hotkey action")
        if self.action == "type" and len(self.text) > 10000:
            raise ValueError(f"Text too long: {len(self.text)} characters (max 10000)")
        return self


# --- Screenshot Tool Schemas ---

class DisplayBounds(BaseModel):
    """Screen bounds for targeted screenshot capture."""
    model_config = ConfigDict(extra='ignore')

    x: int = Field(..., description="Display X origin")
    y: int = Field(..., description="Display Y origin")
    width: int = Field(..., description="Display width")
    height: int = Field(..., description="Display height")
    monitor_id: Optional[str] = Field(None, description="Optional monitor identifier")

class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    model_config = ConfigDict(extra='ignore')
    
    wait: Optional[float] = Field(
        None,
        description="(OPTIONAL) Delay in seconds before capturing a screenshot. If provided, waits this duration before capture."
    )
    display_bounds: Optional[DisplayBounds] = Field(
        None,
        description="(OPTIONAL) Display bounds to capture instead of the full desktop."
    )


# --- Scroll Tool Schemas ---

class ScrollControlArgs(BaseModel):
    """Arguments for scroll control tool. Vertical: up/down (vscroll). Horizontal: left/right (hscroll).
    
    Scroll amounts are specified in 'scroll units' (the 'clicks' parameter) where each unit
    represents approximately 3 lines of text visually. The actual OS wheel clicks are
    automatically calculated based on the operating system for consistent cross-platform behavior.
    
    OS-specific behavior:
    - Windows: 1 unit ≈ 1 wheel tick (typically 3 lines), adjustable based on user settings
    - macOS: 1 unit ≈ 0.3 wheel ticks (smooth scrolling compensation)
    - Linux: 1 unit ≈ 1 wheel tick (typically 3 lines)
    """
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(..., description="Scroll action to perform")
    x: int = Field(..., description="X coordinate to move to before scrolling (manual coordinates only)")
    y: int = Field(..., description="Y coordinate to move to before scrolling (manual coordinates only)")
    clicks: int = Field(
        5,
        description=(
            "Number of scroll units (visually ~3 lines of text per unit). "
            "Default 5 units ≈ 15 lines. Automatically converted to OS-specific wheel clicks: "
            "Windows/Linux ≈ 1:1, macOS ≈ 0.3:1 due to smooth scrolling."
        )
    )
    direction: Optional[Literal["up", "down", "left", "right"]] = Field(
        None,
        description="Direction for scroll action: vertical 'up'|'down', or horizontal 'left'|'right'. Required when action is 'scroll'.",
    )
    wait: Optional[float] = Field(
        2.0,
        description="Delay in seconds before taking a screenshot after tool execution."
    )
    
    @model_validator(mode='after')
    def validate_direction(self):
        """Validate that direction is provided for scroll action."""
        if self.action == "scroll" and not self.direction:
            raise ValueError("direction required for scroll action")
        return self


# --- Filesystem Tool Schemas ---

class ReadFileArgs(BaseModel):
    """Arguments for read file tool."""
    model_config = ConfigDict(extra='ignore')
    
    file_path: str = Field(..., description="Absolute path to the file to read")
    offset: Optional[int] = Field(
        None,
        description="0-based line offset to start reading from (defaults to 0)",
    )
    limit: Optional[int] = Field(
        None,
        description="Maximum number of lines to read (defaults to 2000 when omitted)",
    )
    explanation: Optional[str] = Field(
        None,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- System Tool Schemas ---

class RunShellCommandArgs(BaseModel):
    """Arguments for shell command tool."""
    model_config = ConfigDict(extra='ignore')
    
    command: str = Field(..., description="Command to execute")
    directory: Optional[str] = Field(None, description="Working directory (must be absolute path)")
    run_in_background: bool = Field(False, description="Run command in background")
    terminate_after_seconds: Optional[float] = Field(120.0, description="Timeout in seconds (for foreground execution)")
    yield_after_seconds: Optional[float] = Field(
        None,
        description="(OPTIONAL) Return early if command runs longer than this (seconds). The command continues in the background.",
    )
    max_output_tokens: Optional[int] = Field(
        None,
        description=(
            "(OPTIONAL) Maximum number of output tokens to include in llm_content for foreground responses. "
            "Defaults to 10000 when omitted."
        ),
    )
    env: Optional[dict[str, str]] = Field(
        None,
        description="(OPTIONAL) Environment variable overrides for the command.",
    )
    pty: Optional[bool] = Field(
        None,
        description="(OPTIONAL) Request a pseudo-terminal (best-effort).",
    )
    explanation: Optional[str] = Field(
        None,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    wait: Optional[float] = Field(
        None,
        description="(OPTIONAL) Delay in seconds before taking a screenshot after tool execution. If provided, the tool will wait and capture a screenshot like computer-use tools."
    )


class ProcessShellCommandArgs(BaseModel):
    """Arguments for process tool (manage background shell sessions)."""
    model_config = ConfigDict(extra='ignore')

    action: str = Field(
        ...,
        description="Action to perform: list, poll, log, write, send-keys, submit, paste, kill, clear, remove.",
    )
    session_id: Optional[str] = Field(None, description="Session id for actions other than list/clear")
    data: Optional[str] = Field(None, description="Data to write for write action")
    keys: Optional[list[str]] = Field(None, description="Key tokens for send-keys action")
    hex: Optional[list[str]] = Field(None, description="Hex bytes for send-keys action")
    literal: Optional[str] = Field(None, description="Literal text for send-keys action")
    text: Optional[str] = Field(None, description="Text for paste action")
    bracketed: Optional[bool] = Field(None, description="Wrap paste in bracketed mode")
    eof: Optional[bool] = Field(None, description="Close stdin after write action")
    offset: Optional[int] = Field(None, description="Log line offset")
    limit: Optional[int] = Field(None, description="Log line limit")


class SwitchTabArgs(BaseModel):
    """Arguments for switch tab tool."""
    model_config = ConfigDict(extra='ignore')
    
    tab_name: str = Field(..., description="Name of the tab/window to switch to")
    wait: Optional[float] = Field(
        2.0,
        description="Delay in seconds before taking a screenshot after tool execution."
    )


class GetOpenWindowsArgs(BaseModel):
    """Arguments for get open windows tool."""
    model_config = ConfigDict(extra='ignore')
    
    filter_text: Optional[str] = Field("", description="Optional filter text to search window titles")
    explanation: Optional[str] = Field(
        None,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class GetSystemStatsArgs(BaseModel):
    """Arguments for get system stats tool."""
    model_config = ConfigDict(extra='ignore')
    
    explanation: Optional[str] = Field(
        None,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='ignore')
    
    seconds: Optional[float] = Field(
        1.0,
        description="Number of seconds to wait before capturing a screenshot."
    )


# --- Additional Filesystem Tool Schemas ---

def _before_context_field():
    return Field(
        None,
        description="Optional exact text that must appear immediately before old_string",
    )


def _after_context_field():
    return Field(
        None,
        description="Optional exact text that must appear immediately after old_string",
    )


def _occurrence_index_field():
    return Field(
        None,
        ge=1,
        description="Optional 1-based match index to replace when multiple matches exist",
    )


def _require_eof_field():
    return Field(
        False,
        description="If true, match must end at file EOF (allowing trailing newline)",
    )


class ReplaceOperationArgs(BaseModel):
    """Arguments for one replacement operation in a batched replace call."""
    model_config = ConfigDict(extra='ignore')

    old_string: str = Field(..., description="The string to search for and replace")
    new_string: str = Field(
        ...,
        description=(
            "The replacement string. Keep payloads focused; split large edits across "
            "multiple replace/apply_patch-style calls."
        ),
    )
    replace_all: bool = Field(
        False,
        description="If true, replace all occurrences in this operation",
    )
    before_context: Optional[str] = _before_context_field()
    after_context: Optional[str] = _after_context_field()
    occurrence_index: Optional[int] = _occurrence_index_field()
    require_eof: bool = _require_eof_field()
    match_mode: Optional[Literal['strict', 'lenient']] = Field(
        None,
        description="Matching mode override for this operation",
    )


class ReplacePatchChunkArgs(BaseModel):
    """Arguments for one apply_patch-style ordered update chunk."""
    model_config = ConfigDict(extra='ignore')

    change_context: Optional[str] = Field(
        None,
        description="Optional single-line context anchor. Matching starts after this line.",
    )
    old_lines: List[str] = Field(
        ...,
        description="Exact old lines to replace (line content only; no newline characters).",
    )
    new_lines: List[str] = Field(
        ...,
        description="Replacement lines (line content only; no newline characters).",
    )
    is_end_of_file: bool = Field(
        False,
        description="If true, old_lines must match at end-of-file.",
    )


class ReplaceArgs(BaseModel):
    """Arguments for replace tool."""
    model_config = ConfigDict(extra='ignore')
    
    file_path: str = Field(..., description="Absolute path to the file to modify")
    old_string: Optional[str] = Field(
        None,
        description="Single-operation string to search for and replace",
    )
    new_string: Optional[str] = Field(
        None,
        description=(
            "Single-operation replacement string. Do not send giant payloads in one call; "
            "chunk large edits across multiple calls."
        ),
    )
    replace_all: bool = Field(
        False,
        description="If true, replace all occurrences; if false, replace only the first occurrence",
    )
    before_context: Optional[str] = _before_context_field()
    after_context: Optional[str] = _after_context_field()
    occurrence_index: Optional[int] = _occurrence_index_field()
    require_eof: bool = _require_eof_field()
    match_mode: Literal['strict', 'lenient'] = Field(
        'lenient',
        description="Matching mode for single operation and default for replacements[]",
    )
    replacements: Optional[List[ReplaceOperationArgs]] = Field(
        None,
        description="Optional batched replacement operations applied atomically",
    )
    patch_chunks: Optional[List[ReplacePatchChunkArgs]] = Field(
        None,
        description=(
            "Optional apply_patch-style ordered update chunks. "
            "Cannot be combined with old_string/new_string/replacements. "
            "Prefer multiple focused chunks/calls over one oversized payload."
        ),
    )
