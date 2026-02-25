"""Unified browser control schema exposed to LLM tool calling."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import ConfigDict, Field

from backend.src.tools.browser.schema_types import (
    BrowserAction,
    BROWSER_COMPAT_ACTION_PREFERRED,
    BROWSER_LEGACY_COMPAT_ACTIONS,
    BrowserCanonicalAction,
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
from backend.src.tools.browser.shared_compat_fields import (
    BrowserScreenshotImageFields,
    BrowserSharedCompatFields,
)


class _BrowserControlArgsBase(BrowserSharedCompatFields, BrowserScreenshotImageFields):
    """
    Shared browser control arguments.

    Action typing is layered by subclasses:
    - BrowserCanonicalControlArgs (canonical actions only)
    - BrowserControlArgs (combined compatibility surface)
    """

    model_config = ConfigDict(extra="ignore")

    # Connection args
    mode: Literal[
        "user_chrome",
        "managed",
        "efficient",
        "focused",
        "full_text",
        "structured",
    ] = Field(
        "user_chrome",
        description=(
            "Compatibility field for connect action ('user_chrome'/'managed') "
            "(ignored at runtime), "
            "snapshot mode ('efficient'), or extract modes "
            "('focused'/'full_text'/'structured')."
        ),
    )
    cdp_url: Optional[str] = Field(
        "http://127.0.0.1:9333",
        description="Compatibility field for connect action (ignored at runtime).",
    )
    headless: bool = Field(False, description="Run managed browser headless")

    # Navigation args
    url: Optional[str] = Field(None, description="URL for navigate action")
    wait_until: BrowserNavigationState = Field(
        "load", description="Navigation wait condition"
    )

    # Snapshot args
    format: BrowserSnapshotFormat = Field(
        "ai",
        description="Snapshot format: 'ai' (interactive + contextual snapshot) or 'aria' (accessibility tree)",
    )
    max_chars: Optional[int] = Field(
        None,
        description="Optional max snapshot chars (defaults to 12,000 for ai; 4,000 in efficient mode; aria snapshots are capped at 4,000)",
        ge=100,
        le=120000,
    )
    offset: Optional[int] = Field(
        None,
        description="Optional character offset into snapshot text for paginated reads.",
        ge=0,
    )
    refs: SnapshotRefsField
    interactive: SnapshotInteractiveField
    compact: SnapshotCompactField
    depth: SnapshotDepthField
    selector: SnapshotSelectorField
    frame: SnapshotFrameField
    snapshotFormat: Optional[BrowserSnapshotFormat] = Field(
        None, description="Snapshot format alias."
    )
    query: Optional[str] = Field(
        None, description="Extraction goal/query for extract action."
    )
    description: Optional[str] = Field(None, description="Description for go_back action")
    extract_links: bool = Field(
        False,
        description="Include links in extracted source text before query filtering (extract action).",
    )
    start_from_char: int = Field(
        0,
        description="Character offset into extracted source text for continuation (extract action).",
        ge=0,
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON schema hint for caller-side structured parsing (extract action).",
    )
    engine: Optional[str] = Field(None, description="Search engine for search action")
    pattern: Optional[str] = Field(None, description="Pattern for search_page/find_text")
    regex: Optional[bool] = Field(None, description="Regex toggle for search_page")
    case_sensitive: Optional[bool] = Field(
        None, description="Case-sensitive toggle for search_page"
    )
    context_chars: Optional[int] = Field(
        None, description="Context chars for search_page", ge=0
    )
    css_scope: Optional[str] = Field(None, description="CSS scope for search_page")
    max_results: Optional[int] = Field(None, description="Max results for find/search", ge=1)
    attributes: Optional[List[str]] = Field(
        None, description="Attributes for find_elements output"
    )
    include_text: Optional[bool] = Field(
        None, description="Include element text for find_elements"
    )
    index: Optional[int] = Field(None, description="Browser Use element index", ge=0)
    tab_id: Optional[str] = Field(None, description="Browser Use tab id")
    file_name: Optional[str] = Field(
        None, description="Filename for file or screenshot actions"
    )
    content: Optional[str] = Field(None, description="Content for write_file action")

    # Element interaction args
    ref: Optional[str] = Field(None, description="Element reference from snapshot")
    text: Optional[str] = Field(
        None, description="Text for type action", max_length=10000
    )
    submit: bool = Field(False, description="Submit after type")
    key: Optional[str] = Field(
        None, description="Key for press action or storage key"
    )
    code: Optional[str] = Field(None, description="Browser Use evaluate code")
    double_click: bool = Field(False, description="Double click")
    coordinate_x: Optional[int] = Field(
        None,
        description="Browser Use coordinate click X position (requires coordinate_y).",
    )
    coordinate_y: Optional[int] = Field(
        None,
        description="Browser Use coordinate click Y position (requires coordinate_x).",
    )
    button: BrowserMouseButton = Field("left", description="Mouse button")

    # Scroll args
    direction: BrowserScrollDirection = Field("down", description="Scroll direction")
    amount: int = Field(500, description="Scroll amount", ge=100, le=5000)
    down: Optional[bool] = Field(None, description="Browser Use scroll direction flag")
    pages: Optional[float] = Field(None, description="Browser Use page count", gt=0)

    # Screenshot args
    full_page: bool = Field(False, description="Full page screenshot")

    # Wait args
    state: BrowserWaitState = Field("networkidle", description="Wait state")
    seconds: Optional[float] = Field(None, description="Wait seconds", ge=0, le=60)

    # Tab args
    target_id: Optional[str] = Field(None, description="Tab target ID")
    targetId: Optional[str] = Field(None, description="Tab target ID (camelCase alias)")
    target_url: Optional[str] = Field(
        None, description="Open/navigate URL (snake_case)"
    )
    new_tab: Optional[bool] = Field(None, description="Open navigate URL in new tab")
    targetUrl: Optional[str] = Field(None, description="Open/navigate URL (camelCase)")
    input_ref: Optional[str] = Field(None, description="Input ref for upload action")
    inputRef: Optional[str] = Field(
        None, description="Input ref for upload action (camelCase)"
    )
    paths: Optional[List[str]] = Field(None, description="File paths for upload action")
    level: Optional[str] = Field(None, description="Console log level filter")
    limit: Optional[int] = Field(
        None,
        description="Result item limit (or snapshot character page size when action='snapshot')",
    )

    # Evaluate args
    script: Optional[str] = Field(
        None, description="JavaScript to evaluate", max_length=5000
    )


class BrowserCanonicalControlArgs(_BrowserControlArgsBase):
    """Canonical browser control action schema."""

    action: BrowserCanonicalAction = Field(
        ...,
        description="Canonical browser action to perform.",
    )


class BrowserControlArgs(_BrowserControlArgsBase):
    """
    Unified browser control arguments accepted at the backend boundary.

    Keeps legacy aliases parseable while migration to canonical-only actions is in progress.
    """

    action: BrowserAction = Field(..., description="Browser action to perform")

    @classmethod
    def is_legacy_action(cls, action: str) -> bool:
        """Return True when action is a legacy compatibility alias."""
        return action in BROWSER_LEGACY_COMPAT_ACTIONS

    @property
    def is_legacy(self) -> bool:
        """True when this payload uses a legacy compatibility alias."""
        return self.is_legacy_action(self.action)

    @property
    def preferred_action(self) -> str | None:
        """Canonical action recommendation for legacy aliases."""
        return BROWSER_COMPAT_ACTION_PREFERRED.get(self.action)
