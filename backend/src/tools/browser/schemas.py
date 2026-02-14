"""
Browser control tool schemas for backend.

These schemas are used for LLM tool calling and validation.
They mirror the sidecar schemas for consistency.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class BrowserConnectArgs(BaseModel):
    """Arguments for browser connect action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["connect"] = Field(
        ...,
        description="Connect to browser"
    )
    mode: Literal["user_chrome", "managed"] = Field(
        "user_chrome",
        description="Connection mode: 'user_chrome' connects to existing Chrome, 'managed' launches isolated Chromium"
    )
    cdp_url: Optional[str] = Field(
        "http://127.0.0.1:9222",
        description="CDP URL for user Chrome mode (must be localhost)"
    )
    headless: bool = Field(
        False,
        description="Run managed browser headless (no UI)"
    )


class BrowserNavigateArgs(BaseModel):
    """Arguments for browser navigate action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["navigate"] = Field(
        ...,
        description="Navigate to URL"
    )
    url: str = Field(
        ...,
        description="URL to navigate to"
    )
    wait_until: Literal["load", "domcontentloaded", "networkidle", "commit"] = Field(
        "networkidle",
        description="When to consider navigation complete"
    )


class BrowserSnapshotArgs(BaseModel):
    """Arguments for browser snapshot action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["snapshot"] = Field(
        ...,
        description="Get page snapshot"
    )
    format: Literal["ai", "aria"] = Field(
        "ai",
        description="Snapshot format: 'ai' (interactive + contextual snapshot) or 'aria' (accessibility tree)"
    )
    mode: Optional[Literal["efficient"]] = Field(
        None,
        description="Optional snapshot mode. 'efficient' enables interactive+compact+depth defaults."
    )
    max_chars: Optional[int] = Field(
        None,
        description="Optional max characters in snapshot (defaults to 80,000 for ai; 10,000 in efficient mode)",
        ge=100,
        le=120000,
    )
    refs: Optional[Literal["role", "aria"]] = Field(
        None,
        description="Reference mode for role snapshots."
    )
    interactive: Optional[bool] = Field(
        None,
        description="Only include interactive roles in role snapshot output."
    )
    compact: Optional[bool] = Field(
        None,
        description="Prune structural noise from role snapshot output."
    )
    depth: Optional[int] = Field(
        None,
        description="Maximum role snapshot depth (0=root only).",
        ge=0,
        le=20,
    )
    selector: Optional[str] = Field(
        None,
        description="Optional CSS selector scope for role snapshots."
    )
    frame: Optional[str] = Field(
        None,
        description="Optional iframe selector scope for role snapshots."
    )


class BrowserClickArgs(BaseModel):
    """Arguments for browser click action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["click"] = Field(
        ...,
        description="Click element"
    )
    ref: str = Field(
        ...,
        description="Element reference from snapshot (e.g., '5')"
    )
    double_click: bool = Field(
        False,
        description="Perform double click"
    )
    button: Literal["left", "right", "middle"] = Field(
        "left",
        description="Mouse button"
    )


class BrowserTypeArgs(BaseModel):
    """Arguments for browser type action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["type"] = Field(
        ...,
        description="Type text"
    )
    ref: str = Field(
        ...,
        description="Element reference from snapshot"
    )
    text: str = Field(
        ...,
        description="Text to type",
        max_length=10000
    )
    submit: bool = Field(
        False,
        description="Press Enter after typing"
    )


class BrowserPressArgs(BaseModel):
    """Arguments for browser press action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["press"] = Field(
        ...,
        description="Press key"
    )
    key: str = Field(
        ...,
        description="Key to press (e.g., 'Enter', 'Escape', 'ArrowDown')"
    )


class BrowserScrollArgs(BaseModel):
    """Arguments for browser scroll action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["scroll"] = Field(
        ...,
        description="Scroll page"
    )
    direction: Literal["up", "down", "left", "right"] = Field(
        "down",
        description="Scroll direction"
    )
    amount: int = Field(
        500,
        description="Scroll amount in pixels",
        ge=100,
        le=5000
    )


class BrowserScreenshotArgs(BaseModel):
    """Arguments for browser screenshot action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["screenshot"] = Field(
        ...,
        description="Take screenshot"
    )
    full_page: bool = Field(
        False,
        description="Capture full page height"
    )
    ref: Optional[str] = Field(
        None,
        description="Optional element reference to screenshot"
    )


class BrowserWaitArgs(BaseModel):
    """Arguments for browser wait action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["wait"] = Field(
        ...,
        description="Wait for page state or time"
    )
    state: Literal["load", "domcontentloaded", "networkidle"] = Field(
        "networkidle",
        description="Load state to wait for"
    )
    seconds: Optional[float] = Field(
        None,
        description="Alternative: wait fixed seconds",
        ge=0,
        le=60,
    )


class BrowserGetTabsArgs(BaseModel):
    """Arguments for browser get_tabs action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["get_tabs"] = Field(
        ...,
        description="Get open tabs"
    )


class BrowserSwitchTabArgs(BaseModel):
    """Arguments for browser switch_tab action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["switch_tab"] = Field(
        ...,
        description="Switch to tab"
    )
    target_id: str = Field(
        ...,
        description="Tab target ID from get_tabs"
    )


class BrowserEvaluateArgs(BaseModel):
    """Arguments for browser evaluate action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["evaluate"] = Field(
        ...,
        description="Evaluate JavaScript"
    )
    script: str = Field(
        ...,
        description="JavaScript code to execute",
        max_length=5000
    )


class BrowserCloseArgs(BaseModel):
    """Arguments for browser close action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["close"] = Field(
        ...,
        description="Close browser connection"
    )


class BrowserOpenClawCompatArgs(BaseModel):
    """OpenClaw-compatible browser actions and payload fields."""
    model_config = ConfigDict(extra='ignore')

    action: Literal[
        "status", "start", "stop", "profiles", "tabs",
        "open", "focus", "console", "pdf", "upload",
        "dialog", "act",
    ] = Field(
        ...,
        description="OpenClaw-compatible browser action"
    )
    mode: Optional[Literal["user_chrome", "managed", "efficient"]] = Field(
        None,
        description="Connect/snapshot mode for compatible actions."
    )
    cdp_url: Optional[str] = Field(
        None,
        description="Optional CDP URL."
    )
    target_id: Optional[str] = Field(None, description="Tab target ID")
    targetId: Optional[str] = Field(None, description="Tab target ID (camelCase)")
    target_url: Optional[str] = Field(None, description="URL to open/navigate")
    targetUrl: Optional[str] = Field(None, description="URL to open/navigate (camelCase)")
    url: Optional[str] = Field(None, description="URL to open/navigate")
    snapshotFormat: Optional[Literal["ai", "aria"]] = Field(
        None,
        description="Snapshot format alias."
    )
    input_ref: Optional[str] = Field(None, description="Input ref for upload")
    inputRef: Optional[str] = Field(None, description="Input ref for upload (camelCase)")
    paths: Optional[List[str]] = Field(None, description="File paths for upload")
    request: Optional[Dict[str, Any]] = Field(
        None,
        description="Nested action payload for act."
    )
    profile: Optional[str] = Field(None, description="Compatibility field (unused in WindieOS)")
    node: Optional[str] = Field(None, description="Compatibility field (unused in WindieOS)")
    target: Optional[Literal["sandbox", "host", "node"]] = Field(
        None,
        description="Compatibility field (unused in WindieOS)"
    )


# Unified browser control args for tool schema
class BrowserControlArgs(BaseModel):
    """
    Unified browser control arguments.
    
    This is the main schema exposed to the LLM. The action field
    determines which specific action is performed.
    """
    model_config = ConfigDict(extra='ignore')
    
    action: Literal[
        "connect", "navigate", "snapshot", "click", "type",
        "press", "scroll", "screenshot", "wait", "get_tabs",
        "switch_tab", "evaluate", "close", "status", "start",
        "stop", "profiles", "tabs", "open", "focus",
        "console", "pdf", "upload", "dialog", "act"
    ] = Field(
        ...,
        description="Browser action to perform"
    )
    
    # Connection args
    mode: Literal["user_chrome", "managed", "efficient"] = Field(
        "user_chrome",
        description="Browser mode for connect action ('user_chrome'/'managed') or snapshot mode ('efficient')"
    )
    cdp_url: Optional[str] = Field(
        "http://127.0.0.1:9222",
        description="CDP URL for user Chrome mode"
    )
    headless: bool = Field(
        False,
        description="Run managed browser headless"
    )
    
    # Navigation args
    url: Optional[str] = Field(
        None,
        description="URL for navigate action"
    )
    wait_until: Literal["load", "domcontentloaded", "networkidle", "commit"] = Field(
        "networkidle",
        description="Navigation wait condition"
    )
    
    # Snapshot args
    format: Literal["ai", "aria"] = Field(
        "ai",
        description="Snapshot format: 'ai' (interactive + contextual snapshot) or 'aria' (accessibility tree)"
    )
    max_chars: Optional[int] = Field(
        None,
        description="Optional max snapshot chars (defaults to 80,000 for ai; 10,000 in efficient mode)",
        ge=100,
        le=120000
    )
    refs: Optional[Literal["role", "aria"]] = Field(
        None,
        description="Reference mode for role snapshots."
    )
    interactive: Optional[bool] = Field(
        None,
        description="Only include interactive roles in role snapshot output."
    )
    compact: Optional[bool] = Field(
        None,
        description="Prune structural noise from role snapshot output."
    )
    depth: Optional[int] = Field(
        None,
        description="Maximum role snapshot depth (0=root only).",
        ge=0,
        le=20,
    )
    selector: Optional[str] = Field(
        None,
        description="Optional CSS selector scope for role snapshots."
    )
    frame: Optional[str] = Field(
        None,
        description="Optional iframe selector scope for role snapshots."
    )
    snapshotFormat: Optional[Literal["ai", "aria"]] = Field(
        None,
        description="Snapshot format alias."
    )
    
    # Element interaction args
    ref: Optional[str] = Field(
        None,
        description="Element reference from snapshot"
    )
    text: Optional[str] = Field(
        None,
        description="Text for type action",
        max_length=10000
    )
    submit: bool = Field(
        False,
        description="Submit after type"
    )
    key: Optional[str] = Field(
        None,
        description="Key for press action"
    )
    double_click: bool = Field(
        False,
        description="Double click"
    )
    button: Literal["left", "right", "middle"] = Field(
        "left",
        description="Mouse button"
    )
    
    # Scroll args
    direction: Literal["up", "down", "left", "right"] = Field(
        "down",
        description="Scroll direction"
    )
    amount: int = Field(
        500,
        description="Scroll amount",
        ge=100,
        le=5000
    )
    
    # Screenshot args
    full_page: bool = Field(
        False,
        description="Full page screenshot"
    )
    
    # Wait args
    state: Literal["load", "domcontentloaded", "networkidle"] = Field(
        "networkidle",
        description="Wait state"
    )
    seconds: Optional[float] = Field(
        None,
        description="Wait seconds",
        ge=0,
        le=60
    )
    
    # Tab args
    target_id: Optional[str] = Field(
        None,
        description="Tab target ID"
    )
    targetId: Optional[str] = Field(
        None,
        description="Tab target ID (camelCase alias)"
    )
    target_url: Optional[str] = Field(
        None,
        description="Open/navigate URL (snake_case)"
    )
    targetUrl: Optional[str] = Field(
        None,
        description="Open/navigate URL (camelCase)"
    )
    profile: Optional[str] = Field(
        None,
        description="Compatibility field (unused in WindieOS)"
    )
    node: Optional[str] = Field(
        None,
        description="Compatibility field (unused in WindieOS)"
    )
    target: Optional[Literal["sandbox", "host", "node"]] = Field(
        None,
        description="Compatibility field (unused in WindieOS)"
    )
    input_ref: Optional[str] = Field(
        None,
        description="Input ref for upload action"
    )
    inputRef: Optional[str] = Field(
        None,
        description="Input ref for upload action (camelCase)"
    )
    paths: Optional[List[str]] = Field(
        None,
        description="File paths for upload action"
    )
    request: Optional[Dict[str, Any]] = Field(
        None,
        description="Nested act request payload"
    )
    
    # Evaluate args
    script: Optional[str] = Field(
        None,
        description="JavaScript to evaluate",
        max_length=5000
    )
