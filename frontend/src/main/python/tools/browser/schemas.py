"""
Pydantic schemas for browser control tool.

Provides type-safe argument validation for browser automation.
"""

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from tools.browser.openclaw_compat_schema import (
    BrowserOpenClawCompatArgs,
    OPENCLAW_COMPAT_ACTIONS,
)


class BrowserConnectArgs(BaseModel):
    """Arguments for browser connect action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["connect"] = Field(..., description="Connect to browser")
    mode: Literal["user_chrome", "managed"] = Field(
        "user_chrome",
        description=(
            "Compatibility field (ignored). WindieOS connect always targets the "
            "dedicated Windie browser instance."
        ),
    )
    cdp_url: Optional[str] = Field(
        "http://127.0.0.1:9333",
        description=(
            "Compatibility field (ignored). WindieOS connect uses the dedicated "
            "Windie browser CDP endpoint."
        ),
    )
    headless: bool = Field(False, description="Run managed browser headless (no UI)")
    executable_path: Optional[str] = Field(
        None, description="Optional path to Chrome executable"
    )

    @model_validator(mode="after")
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

    model_config = ConfigDict(extra="ignore")

    action: Literal["navigate"] = Field(..., description="Navigate to URL")
    url: str = Field(..., description="URL to navigate to")
    new_tab: bool = Field(False, description="Open URL in a new tab")
    wait_until: Literal["load", "domcontentloaded", "networkidle", "commit"] = Field(
        "load", description="When to consider navigation complete"
    )


class BrowserSnapshotArgs(BaseModel):
    """Arguments for browser snapshot action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["snapshot"] = Field(..., description="Get page snapshot")
    format: Literal["ai", "aria"] = Field(
        "ai",
        description="Snapshot format: 'ai' (interactive + contextual snapshot) or 'aria' (accessibility tree)",
    )
    wait_until: Literal["load", "domcontentloaded", "networkidle", "commit"] = Field(
        "load", description="Wait for this load state before capturing snapshot"
    )
    mode: Optional[Literal["efficient"]] = Field(
        None,
        description="Optional snapshot mode. 'efficient' enables interactive+compact+depth defaults (also used by default for ai snapshots when mode is omitted).",
    )
    max_chars: Optional[int] = Field(
        None,
        description="Optional maximum characters in snapshot (defaults to 12,000 for ai; 4,000 in efficient mode; aria snapshots are capped at 4,000)",
        ge=100,
        le=120000,
    )
    offset: Optional[int] = Field(
        None,
        description="Optional character offset into snapshot text for paginated reads.",
        ge=0,
    )
    limit: Optional[int] = Field(
        None,
        description="Optional character page size for snapshot text. aria pages are capped at 4,000 characters.",
        ge=1,
        le=120000,
    )
    refs: Optional[Literal["role", "aria"]] = Field(
        None, description="Reference mode for role snapshots."
    )
    interactive: Optional[bool] = Field(
        None, description="Only include interactive roles in role snapshot output."
    )
    compact: Optional[bool] = Field(
        None, description="Prune structural noise from role snapshot output."
    )
    depth: Optional[int] = Field(
        None,
        description="Maximum role snapshot depth (0=root only).",
        ge=0,
        le=20,
    )
    selector: Optional[str] = Field(
        None, description="Optional CSS selector scope for role snapshots."
    )
    frame: Optional[str] = Field(
        None, description="Optional iframe selector scope for role snapshots."
    )


class BrowserExtractArgs(BaseModel):
    """Arguments for browser extract action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["extract"] = Field(
        ..., description="Extract query-relevant page content from current DOM text"
    )
    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Extraction goal/query (for example: 'list all pricing tiers and monthly cost')",
    )
    mode: Literal["focused", "full_text", "structured"] = Field(
        "focused",
        description="Extraction mode: focused (keyword filter), full_text (unfiltered text window), or structured (table/list JSON window).",
    )
    extract_links: bool = Field(
        False,
        description="Include page links in extracted source text before query filtering.",
    )
    start_from_char: int = Field(
        0,
        ge=0,
        description="Character offset into extracted page content for long pages.",
    )
    max_chars: Optional[int] = Field(
        None,
        ge=100,
        le=120000,
        description="Maximum number of characters in the final extracted result.",
    )
    wait_until: Literal["load", "domcontentloaded", "networkidle", "commit"] = Field(
        "load", description="Wait for this load state before extracting page content."
    )
    selector: Optional[str] = Field(
        None, description="Optional CSS selector to scope extraction."
    )
    frame: Optional[str] = Field(
        None, description="Optional iframe selector scope for extraction."
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON schema hint for caller-side structured parsing (not enforced by sidecar).",
    )


class BrowserClickArgs(BaseModel):
    """Arguments for browser click action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["click"] = Field(..., description="Click element")
    ref: Optional[str] = Field(
        None, description="Element reference from snapshot (e.g., '5')"
    )
    index: Optional[int] = Field(
        None, description="Browser Use element index", ge=0
    )
    coordinate_x: Optional[int] = Field(
        None,
        description="Browser Use coordinate click X position (requires coordinate_y).",
    )
    coordinate_y: Optional[int] = Field(
        None,
        description="Browser Use coordinate click Y position (requires coordinate_x).",
    )
    double_click: bool = Field(False, description="Perform double click")
    button: Literal["left", "right", "middle"] = Field(
        "left", description="Mouse button"
    )

    @model_validator(mode="after")
    def validate_ref_or_index(self):
        has_ref_or_index = self.ref is not None or self.index is not None
        has_coordinates = (
            self.coordinate_x is not None and self.coordinate_y is not None
        )
        if not has_ref_or_index and not has_coordinates:
            raise ValueError(
                "click requires either 'ref'/'index' or both 'coordinate_x' and 'coordinate_y'"
            )
        if (self.coordinate_x is None) != (self.coordinate_y is None):
            raise ValueError(
                "click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click"
            )
        return self


class BrowserTypeArgs(BaseModel):
    """Arguments for browser type action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["type"] = Field(..., description="Type text")
    ref: str = Field(..., description="Element reference from snapshot")
    text: str = Field(..., description="Text to type", max_length=10000)
    submit: bool = Field(False, description="Press Enter after typing")
    clear_first: bool = Field(True, description="Clear field before typing")


class BrowserPressArgs(BaseModel):
    """Arguments for browser press action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["press"] = Field(..., description="Press key")
    key: str = Field(
        ..., description="Key to press (e.g., 'Enter', 'Escape', 'ArrowDown')"
    )


class BrowserScrollArgs(BaseModel):
    """Arguments for browser scroll action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["scroll"] = Field(..., description="Scroll page")
    direction: Literal["up", "down", "left", "right"] = Field(
        "down", description="Scroll direction"
    )
    amount: int = Field(500, description="Scroll amount in pixels", ge=100, le=5000)
    down: Optional[bool] = Field(None, description="Browser Use scroll direction flag")
    pages: Optional[float] = Field(
        None, description="Browser Use page count", gt=0
    )
    index: Optional[int] = Field(None, description="Optional Browser Use element index", ge=0)


class BrowserScreenshotArgs(BaseModel):
    """Arguments for browser screenshot action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["screenshot"] = Field(..., description="Take screenshot")
    full_page: bool = Field(False, description="Capture full page height")
    ref: Optional[str] = Field(
        None, description="Optional element reference to screenshot"
    )
    element: Optional[str] = Field(
        None, description="Optional CSS selector to screenshot"
    )
    type: Literal["png", "jpeg"] = Field("png", description="Screenshot image type")
    quality: Optional[int] = Field(
        None,
        description="JPEG quality (1-100)",
        ge=1,
        le=100,
    )
    file_name: Optional[str] = Field(
        None, description="Browser Use screenshot filename"
    )


class BrowserWaitArgs(BaseModel):
    """Arguments for browser wait action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["wait"] = Field(..., description="Wait for page state")
    state: Literal["load", "domcontentloaded", "networkidle"] = Field(
        "networkidle", description="Load state to wait for"
    )
    seconds: Optional[float] = Field(
        None,
        description="Alternative: wait fixed seconds",
        ge=0,
        le=60,
    )


class BrowserGetTabsArgs(BaseModel):
    """Arguments for browser get_tabs action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["get_tabs"] = Field(..., description="Get open tabs")


class BrowserSwitchTabArgs(BaseModel):
    """Arguments for browser switch_tab action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["switch_tab"] = Field(..., description="Switch to tab")
    target_id: str = Field(..., description="Tab target ID from get_tabs")


class BrowserEvaluateArgs(BaseModel):
    """Arguments for browser evaluate action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["evaluate"] = Field(..., description="Evaluate JavaScript")
    script: Optional[str] = Field(
        None, description="JavaScript code to execute", max_length=5000
    )
    code: Optional[str] = Field(
        None, description="Browser Use evaluate code", max_length=5000
    )

    @model_validator(mode="after")
    def validate_script_or_code(self):
        if self.script is None and self.code is None:
            raise ValueError("evaluate requires either 'script' or 'code'")
        return self


class BrowserCloseArgs(BaseModel):
    """Arguments for browser close action."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["close"] = Field(..., description="Close browser connection")
    tab_id: Optional[str] = Field(
        None, description="Browser Use tab id (close tab semantics)"
    )
    target_id: Optional[str] = Field(
        None, description="Tab target id alias for close tab semantics"
    )


# Union type for all browser actions
BrowserControlArgs = (
    BrowserConnectArgs
    | BrowserNavigateArgs
    | BrowserSnapshotArgs
    | BrowserExtractArgs
    | BrowserClickArgs
    | BrowserScrollArgs
    | BrowserScreenshotArgs
    | BrowserWaitArgs
    | BrowserGetTabsArgs
    | BrowserEvaluateArgs
    | BrowserCloseArgs
    | BrowserOpenClawCompatArgs
)


# Schema registry for tool validation
BROWSER_SCHEMAS = {
    "connect": BrowserConnectArgs,
    "navigate": BrowserNavigateArgs,
    "snapshot": BrowserSnapshotArgs,
    "extract": BrowserExtractArgs,
    "click": BrowserClickArgs,
    "scroll": BrowserScrollArgs,
    "screenshot": BrowserScreenshotArgs,
    "wait": BrowserWaitArgs,
    "get_tabs": BrowserGetTabsArgs,
    "evaluate": BrowserEvaluateArgs,
    "close": BrowserCloseArgs,
    **{action: BrowserOpenClawCompatArgs for action in OPENCLAW_COMPAT_ACTIONS},
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
