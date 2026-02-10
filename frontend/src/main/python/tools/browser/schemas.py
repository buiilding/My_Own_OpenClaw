"""
Pydantic schemas for browser control tool.

Provides type-safe argument validation for browser automation.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class BrowserConnectArgs(BaseModel):
    """Arguments for browser connect action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["connect"] = Field(..., description="Connect to browser")
    mode: Literal["user_chrome", "managed"] = Field(
        "user_chrome",
        description="Connection mode: 'user_chrome' connects to existing Chrome, 'managed' launches isolated Chromium"
    )
    cdp_url: Optional[str] = Field(
        "http://127.0.0.1:9222",
        description="CDP URL for user Chrome mode"
    )
    headless: bool = Field(
        False,
        description="Run managed browser headless (no UI)"
    )
    executable_path: Optional[str] = Field(
        None,
        description="Optional path to Chrome executable"
    )
    
    @model_validator(mode='after')
    def validate_cdp_url(self):
        """Validate CDP URL is localhost for security."""
        if self.mode == "user_chrome" and self.cdp_url:
            from urllib.parse import urlparse
            parsed = urlparse(self.cdp_url)
            if parsed.hostname not in ("localhost", "127.0.0.1", None):
                raise ValueError("CDP URL must be localhost for security")
        return self


class BrowserNavigateArgs(BaseModel):
    """Arguments for browser navigate action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["navigate"] = Field(..., description="Navigate to URL")
    url: str = Field(..., description="URL to navigate to")
    wait_until: Literal["load", "domcontentloaded", "networkidle", "commit"] = Field(
        "networkidle",
        description="When to consider navigation complete"
    )


class BrowserSnapshotArgs(BaseModel):
    """Arguments for browser snapshot action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["snapshot"] = Field(..., description="Get page snapshot")
    format: Literal["ai", "dom_compact", "aria"] = Field(
        "ai",
        description="Snapshot format: 'ai' (flat interactive list), 'dom_compact' (grouped), or 'aria' (accessibility tree)"
    )
    max_chars: int = Field(
        5000,
        description="Maximum characters in snapshot",
        ge=100,
        le=20000,
    )


class BrowserClickArgs(BaseModel):
    """Arguments for browser click action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["click"] = Field(..., description="Click element")
    ref: str = Field(..., description="Element reference from snapshot (e.g., '5')")
    double_click: bool = Field(False, description="Perform double click")
    button: Literal["left", "right", "middle"] = Field("left", description="Mouse button")


class BrowserTypeArgs(BaseModel):
    """Arguments for browser type action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["type"] = Field(..., description="Type text")
    ref: str = Field(..., description="Element reference from snapshot")
    text: str = Field(..., description="Text to type", max_length=10000)
    submit: bool = Field(False, description="Press Enter after typing")
    clear_first: bool = Field(True, description="Clear field before typing")


class BrowserPressArgs(BaseModel):
    """Arguments for browser press action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["press"] = Field(..., description="Press key")
    key: str = Field(..., description="Key to press (e.g., 'Enter', 'Escape', 'ArrowDown')")


class BrowserScrollArgs(BaseModel):
    """Arguments for browser scroll action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["scroll"] = Field(..., description="Scroll page")
    direction: Literal["up", "down", "left", "right"] = Field("down", description="Scroll direction")
    amount: int = Field(500, description="Scroll amount in pixels", ge=100, le=5000)


class BrowserScreenshotArgs(BaseModel):
    """Arguments for browser screenshot action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["screenshot"] = Field(..., description="Take screenshot")
    full_page: bool = Field(False, description="Capture full page height")
    ref: Optional[str] = Field(None, description="Optional element reference to screenshot")


class BrowserWaitArgs(BaseModel):
    """Arguments for browser wait action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["wait"] = Field(..., description="Wait for page state")
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
    
    action: Literal["get_tabs"] = Field(..., description="Get open tabs")


class BrowserSwitchTabArgs(BaseModel):
    """Arguments for browser switch_tab action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["switch_tab"] = Field(..., description="Switch to tab")
    target_id: str = Field(..., description="Tab target ID from get_tabs")


class BrowserEvaluateArgs(BaseModel):
    """Arguments for browser evaluate action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["evaluate"] = Field(..., description="Evaluate JavaScript")
    script: str = Field(..., description="JavaScript code to execute", max_length=5000)


class BrowserCloseArgs(BaseModel):
    """Arguments for browser close action."""
    model_config = ConfigDict(extra='ignore')
    
    action: Literal["close"] = Field(..., description="Close browser connection")


# Union type for all browser actions
BrowserControlArgs = (
    BrowserConnectArgs
    | BrowserNavigateArgs
    | BrowserSnapshotArgs
    | BrowserClickArgs
    | BrowserTypeArgs
    | BrowserPressArgs
    | BrowserScrollArgs
    | BrowserScreenshotArgs
    | BrowserWaitArgs
    | BrowserGetTabsArgs
    | BrowserSwitchTabArgs
    | BrowserEvaluateArgs
    | BrowserCloseArgs
)


# Schema registry for tool validation
BROWSER_SCHEMAS = {
    "connect": BrowserConnectArgs,
    "navigate": BrowserNavigateArgs,
    "snapshot": BrowserSnapshotArgs,
    "click": BrowserClickArgs,
    "type": BrowserTypeArgs,
    "press": BrowserPressArgs,
    "scroll": BrowserScrollArgs,
    "screenshot": BrowserScreenshotArgs,
    "wait": BrowserWaitArgs,
    "get_tabs": BrowserGetTabsArgs,
    "switch_tab": BrowserSwitchTabArgs,
    "evaluate": BrowserEvaluateArgs,
    "close": BrowserCloseArgs,
}


def get_browser_schema(action: str) -> Optional[type[BaseModel]]:
    """Get schema class for browser action."""
    return BROWSER_SCHEMAS.get(action)


def validate_browser_args(action: str, args: dict) -> tuple[bool, Optional[str]]:
    """
    Validate browser arguments for action.
    
    Args:
        action: Browser action name
        args: Raw argument dictionary
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    schema_class = get_browser_schema(action)
    if not schema_class:
        return False, f"Unknown browser action: {action}"
    
    try:
        # Add action to args for validation
        args_with_action = {**args, "action": action}
        schema_class(**args_with_action)
        return True, None
    except Exception as e:
        return False, str(e)
