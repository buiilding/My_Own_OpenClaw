"""Unified browser control schema exposed to LLM tool calling."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import ConfigDict, Field

from backend.src.tools.browser.schema_types import (
    BrowserAction,
    BrowserMouseButton,
    BrowserNavigationState,
    BrowserScrollDirection,
    BrowserSnapshotFormat,
    BrowserWaitState,
)
from backend.src.tools.browser.shared_compat_fields import BrowserSharedCompatFields


class BrowserControlArgs(BrowserSharedCompatFields):
    """
    Unified browser control arguments.

    This is the main schema exposed to the LLM. The action field
    determines which specific action is performed.
    """

    model_config = ConfigDict(extra="ignore")

    action: BrowserAction = Field(..., description="Browser action to perform")

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
    append: Optional[bool] = Field(None, description="Append mode for write_file")
    trailing_newline: Optional[bool] = Field(
        None, description="Append trailing newline for write_file"
    )
    leading_newline: Optional[bool] = Field(
        None, description="Append leading newline for write_file"
    )
    old_str: Optional[str] = Field(None, description="Old string for replace_file")
    new_str: Optional[str] = Field(None, description="New string for replace_file")
    path: Optional[str] = Field(None, description="File path for upload_file")
    goal: Optional[str] = Field(None, description="Goal for read_long_content")
    source: Optional[str] = Field(None, description="Source for read_long_content")
    context: Optional[str] = Field(None, description="Context for read_long_content")
    keys: Optional[str] = Field(None, description="Key sequence for send_keys")
    success: Optional[bool] = Field(None, description="Success flag for done action")
    files_to_display: Optional[List[str]] = Field(
        None, description="Optional attachment paths for done action"
    )

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
    profile: Optional[str] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
    node: Optional[str] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
    target: Optional[Literal["sandbox", "host", "node"]] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
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
