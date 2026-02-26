"""
Browser control tool schemas for backend.

These schemas are used for LLM tool calling and validation.
They mirror the sidecar schemas for consistency.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.src.tools.browser.browser_control_args_schema import BrowserControlArgs
from backend.src.tools.browser.openclaw_compat_schema import BrowserOpenClawCompatArgs
from backend.src.tools.browser.schema_types import (
    BrowserMouseButton,
    BrowserNavigationState,
    BrowserScrollDirection,
    BrowserSnapshotFormat,
    BrowserWaitState,
)
from backend.src.tools.browser.snapshot_scope_fields import (
    SnapshotCompactField,
    SnapshotDepthField,
    SnapshotFrameField,
    SnapshotInteractiveField,
    SnapshotRefsField,
    SnapshotSelectorField,
)
from backend.src.tools.browser.shared_compat_fields import BrowserScreenshotImageFields


def _ensure_click_target(
    ref: Optional[str],
    index: Optional[int],
    coordinate_x: Optional[int],
    coordinate_y: Optional[int],
) -> None:
    has_ref_or_index = ref is not None or index is not None
    has_coordinates = coordinate_x is not None and coordinate_y is not None
    if not has_ref_or_index and not has_coordinates:
        raise ValueError(
            "click requires either 'ref'/'index' or both 'coordinate_x' and 'coordinate_y'"
        )
    if (coordinate_x is None) != (coordinate_y is None):
        raise ValueError(
            "click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click"
        )


def _ensure_evaluate_payload(script: Optional[str], code: Optional[str]) -> None:
    if script is None and code is None:
        raise ValueError("evaluate requires either 'script' or 'code'")


def _ignored_compat_field(default: Any, detail: str):
    return Field(default, description=f"Compatibility field (ignored). {detail}")


def _required_string_field(description: str, *, max_length: int):
    return Field(..., description=description, max_length=max_length)


def _optional_string_field(description: str, *, max_length: int):
    return Field(None, description=description, max_length=max_length)


class BrowserArgsModel(BaseModel):
    """Shared backend browser schema base."""

    model_config = ConfigDict(extra="ignore")


class BrowserConnectArgs(BrowserArgsModel):
    """Arguments for browser connect action."""

    action: Literal["connect"] = Field(..., description="Connect to browser")
    mode: Literal["user_chrome", "managed"] = _ignored_compat_field(
        "user_chrome",
        "WindieOS connect always targets the dedicated Windie browser instance.",
    )
    cdp_url: Optional[str] = _ignored_compat_field(
        "http://127.0.0.1:9333",
        "WindieOS connect uses the dedicated Windie browser CDP endpoint.",
    )
    headless: bool = Field(False, description="Run managed browser headless (no UI)")


class BrowserNavigateArgs(BrowserArgsModel):
    """Arguments for browser navigate action."""

    action: Literal["navigate"] = Field(..., description="Navigate to URL")
    url: str = Field(..., description="URL to navigate to")
    new_tab: bool = Field(False, description="Open URL in a new tab")
    wait_until: BrowserNavigationState = Field(
        "load", description="When to consider navigation complete"
    )


class BrowserSnapshotArgs(BrowserArgsModel):
    """Arguments for browser snapshot action."""

    action: Literal["snapshot"] = Field(..., description="Get page snapshot")
    format: BrowserSnapshotFormat = Field(
        "ai",
        description="Snapshot format: 'ai' (interactive + contextual snapshot) or 'aria' (accessibility tree)",
    )
    wait_until: BrowserNavigationState = Field(
        "load", description="Wait for this load state before capturing snapshot"
    )
    mode: Optional[Literal["efficient"]] = Field(
        None,
        description="Optional snapshot mode. 'efficient' enables interactive+compact+depth defaults (also used by default for ai snapshots when mode is omitted).",
    )
    max_chars: Optional[int] = Field(
        None,
        description="Optional max characters in snapshot (defaults to 12,000 for ai; 4,000 in efficient mode; aria snapshots are capped at 4,000)",
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
    refs: SnapshotRefsField
    interactive: SnapshotInteractiveField
    compact: SnapshotCompactField
    depth: SnapshotDepthField
    selector: SnapshotSelectorField
    frame: SnapshotFrameField


class BrowserExtractArgs(BrowserArgsModel):
    """Arguments for browser extract action."""

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
    wait_until: BrowserNavigationState = Field(
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


class BrowserClickArgs(BrowserArgsModel):
    """Arguments for browser click action."""

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
    button: BrowserMouseButton = Field(
        "left", description="Mouse button"
    )

    @model_validator(mode="after")
    def validate_ref_or_index(self):
        _ensure_click_target(
            ref=self.ref,
            index=self.index,
            coordinate_x=self.coordinate_x,
            coordinate_y=self.coordinate_y,
        )
        return self


class BrowserTypeArgs(BrowserArgsModel):
    """Arguments for browser type action."""

    action: Literal["type"] = Field(..., description="Type text")
    ref: str = Field(..., description="Element reference from snapshot")
    text: str = _required_string_field("Text to type", max_length=10000)
    submit: bool = Field(False, description="Press Enter after typing")


class BrowserPressArgs(BrowserArgsModel):
    """Arguments for browser press action."""

    action: Literal["press"] = Field(..., description="Press key")
    key: str = Field(
        ..., description="Key to press (e.g., 'Enter', 'Escape', 'ArrowDown')"
    )


class BrowserScrollArgs(BrowserArgsModel):
    """Arguments for browser scroll action."""

    action: Literal["scroll"] = Field(..., description="Scroll page")
    direction: BrowserScrollDirection = Field(
        "down", description="Scroll direction"
    )
    amount: int = Field(500, description="Scroll amount in pixels", ge=100, le=5000)
    down: Optional[bool] = Field(None, description="Browser Use scroll direction flag")
    pages: Optional[float] = Field(
        None, description="Browser Use page count", gt=0
    )
    index: Optional[int] = Field(None, description="Optional Browser Use element index", ge=0)


class BrowserScreenshotArgs(BrowserScreenshotImageFields, BrowserArgsModel):
    """Arguments for browser screenshot action."""

    action: Literal["screenshot"] = Field(..., description="Take screenshot")
    full_page: bool = Field(False, description="Capture full page height")
    ref: Optional[str] = Field(
        None, description="Optional element reference to screenshot"
    )
    file_name: Optional[str] = Field(
        None, description="Browser Use screenshot filename"
    )


class BrowserWaitArgs(BrowserArgsModel):
    """Arguments for browser wait action."""

    action: Literal["wait"] = Field(..., description="Wait for page state or time")
    state: BrowserWaitState = Field(
        "networkidle", description="Load state to wait for"
    )
    seconds: Optional[float] = Field(
        None,
        description="Alternative: wait fixed seconds",
        ge=0,
        le=60,
    )


class BrowserGetTabsArgs(BrowserArgsModel):
    """Arguments for browser get_tabs action."""

    action: Literal["get_tabs"] = Field(..., description="Get open tabs")


class BrowserSwitchTabArgs(BrowserArgsModel):
    """Arguments for browser switch_tab action."""

    action: Literal["switch_tab"] = Field(..., description="Switch to tab")
    target_id: str = Field(..., description="Tab target ID from get_tabs")


class BrowserEvaluateArgs(BrowserArgsModel):
    """Arguments for browser evaluate action."""

    action: Literal["evaluate"] = Field(..., description="Evaluate JavaScript")
    script: Optional[str] = _optional_string_field(
        "JavaScript code to execute",
        max_length=5000,
    )
    code: Optional[str] = _optional_string_field("Browser Use evaluate code", max_length=5000)

    @model_validator(mode="after")
    def validate_script_or_code(self):
        _ensure_evaluate_payload(script=self.script, code=self.code)
        return self


class BrowserCloseArgs(BrowserArgsModel):
    """Arguments for browser close action."""

    action: Literal["close"] = Field(..., description="Close browser connection")
    tab_id: Optional[str] = Field(
        None, description="Browser Use tab id (close tab semantics)"
    )
    target_id: Optional[str] = Field(
        None, description="Tab target id alias for close tab semantics"
    )
