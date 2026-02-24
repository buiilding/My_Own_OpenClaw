"""OpenClaw-compatible browser schema and action constants."""

from typing import Any, Dict, List, Literal, Optional, cast, get_args

from pydantic import BaseModel, ConfigDict, Field


class BrowserOpenClawCompatArgs(BaseModel):
    """OpenClaw-compatible browser actions and payload fields."""

    model_config = ConfigDict(extra="ignore")

    action: Literal[
        "status",
        "profiles",
        "open",
        "done",
        "search",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "write_file",
        "replace_file",
        "read_file",
        "read_long_content",
        "act",
    ] = Field(..., description="OpenClaw-compatible browser action")
    mode: Optional[
        Literal[
            "user_chrome",
            "managed",
            "efficient",
            "focused",
            "full_text",
            "structured",
        ]
    ] = Field(
        None,
        description=(
            "Compatibility connect/snapshot/extract mode for compatible actions."
        ),
    )
    cdp_url: Optional[str] = Field(
        None,
        description="Compatibility CDP URL for connect action (ignored at runtime).",
    )
    target_id: Optional[str] = Field(None, description="Tab target ID")
    targetId: Optional[str] = Field(None, description="Tab target ID (camelCase)")
    target_url: Optional[str] = Field(None, description="URL to open/navigate")
    targetUrl: Optional[str] = Field(
        None, description="URL to open/navigate (camelCase)"
    )
    url: Optional[str] = Field(None, description="URL to open/navigate")
    query: Optional[str] = Field(None, description="Search/extract query text")
    description: Optional[str] = Field(None, description="Description for go_back action")
    engine: Optional[str] = Field(None, description="Search engine (for search action)")
    pattern: Optional[str] = Field(
        None, description="Pattern to find for search_page/find_text"
    )
    regex: Optional[bool] = Field(None, description="Interpret pattern as regex")
    case_sensitive: Optional[bool] = Field(
        None, description="Case-sensitive match toggle"
    )
    context_chars: Optional[int] = Field(
        None, description="Context window chars for search_page", ge=0
    )
    css_scope: Optional[str] = Field(None, description="CSS scope for search_page")
    max_results: Optional[int] = Field(None, description="Maximum result count", ge=1)
    attributes: Optional[List[str]] = Field(
        None, description="Attributes to include for find_elements"
    )
    include_text: Optional[bool] = Field(
        None, description="Include text output for find_elements"
    )
    index: Optional[int] = Field(None, description="Browser Use element index", ge=0)
    tab_id: Optional[str] = Field(None, description="Browser Use tab id")
    new_tab: Optional[bool] = Field(None, description="Open navigate URL in new tab")
    snapshotFormat: Optional[Literal["ai", "aria"]] = Field(
        None, description="Snapshot format alias."
    )
    input_ref: Optional[str] = Field(None, description="Input ref for upload")
    inputRef: Optional[str] = Field(
        None, description="Input ref for upload (camelCase)"
    )
    paths: Optional[List[str]] = Field(None, description="File paths for upload")
    level: Optional[str] = Field(None, description="Console log level filter")
    limit: Optional[int] = Field(None, description="Result item limit")
    clear: Optional[bool] = Field(
        None, description="Clear retained console/dialog events"
    )
    timeoutMs: Optional[int] = Field(None, description="Timeout in milliseconds")
    timeout_ms: Optional[int] = Field(
        None, description="Timeout in milliseconds (snake_case)"
    )
    accept: Optional[bool] = Field(None, description="Dialog accept/dismiss policy")
    promptText: Optional[str] = Field(
        None, description="Prompt text for dialog.accept()"
    )
    prompt_text: Optional[str] = Field(
        None, description="Prompt text for dialog.accept() (snake_case)"
    )
    request: Optional[Dict[str, Any]] = Field(
        None, description="Nested action payload for act."
    )
    text: Optional[str] = Field(
        None, description="Text payload for done/input/find_text/select_dropdown actions"
    )
    selector: Optional[str] = Field(
        None, description="CSS selector for find_elements action"
    )
    cookies: Optional[List[Dict[str, Any]]] = Field(
        None, description="Cookies payload for cookies_set"
    )
    kind: Optional[Literal["local", "session"]] = Field(
        None, description="Storage kind"
    )
    values: Optional[Dict[str, Any]] = Field(None, description="Storage key-values")
    key: Optional[str] = Field(None, description="Single storage key")
    value: Optional[Any] = Field(None, description="Single storage value")
    contains: Optional[str] = Field(None, description="Requests contains filter")
    filter: Optional[str] = Field(None, description="Requests filter alias")
    snapshots: Optional[bool] = Field(None, description="Trace snapshots toggle")
    screenshots: Optional[bool] = Field(None, description="Trace screenshots toggle")
    sources: Optional[bool] = Field(None, description="Trace sources toggle")
    offline: Optional[bool] = Field(None, description="Offline toggle")
    enabled: Optional[bool] = Field(None, description="Offline alias")
    headers: Optional[Dict[str, str]] = Field(None, description="Extra HTTP headers")
    username: Optional[str] = Field(None, description="HTTP auth username")
    user: Optional[str] = Field(None, description="HTTP auth username alias")
    password: Optional[str] = Field(None, description="HTTP auth password")
    latitude: Optional[float] = Field(None, description="Geolocation latitude")
    longitude: Optional[float] = Field(None, description="Geolocation longitude")
    accuracy: Optional[float] = Field(None, description="Geolocation accuracy meters")
    media: Optional[str] = Field(None, description="Media type emulation")
    color_scheme: Optional[str] = Field(None, description="Color scheme emulation")
    colorScheme: Optional[str] = Field(None, description="Color scheme emulation alias")
    timezone: Optional[str] = Field(None, description="Timezone id")
    locale: Optional[str] = Field(None, description="Locale id")
    device: Optional[str] = Field(None, description="Device preset name")
    element: Optional[str] = Field(None, description="Element selector alias")
    type: Optional[Literal["png", "jpeg"]] = Field(
        None, description="Screenshot image type"
    )
    quality: Optional[int] = Field(None, description="JPEG quality", ge=1, le=100)
    file_name: Optional[str] = Field(None, description="Filename for file actions")
    content: Optional[str] = Field(None, description="Content for write_file")
    append: Optional[bool] = Field(None, description="Append mode for write_file")
    trailing_newline: Optional[bool] = Field(
        None, description="Append trailing newline for write_file"
    )
    leading_newline: Optional[bool] = Field(
        None, description="Append leading newline for write_file"
    )
    old_str: Optional[str] = Field(None, description="Target string for replace_file")
    new_str: Optional[str] = Field(
        None, description="Replacement string for replace_file"
    )
    path: Optional[str] = Field(None, description="File path for upload_file")
    goal: Optional[str] = Field(None, description="Goal for read_long_content")
    source: Optional[str] = Field(None, description="Source for read_long_content")
    context: Optional[str] = Field(None, description="Context for read_long_content")
    keys: Optional[str] = Field(None, description="Keyboard sequence for send_keys")
    pages: Optional[float] = Field(None, description="Browser Use page count", gt=0)
    down: Optional[bool] = Field(None, description="Browser Use scroll direction flag")
    code: Optional[str] = Field(None, description="Browser Use evaluate code")
    success: Optional[bool] = Field(None, description="Success flag for done action")
    files_to_display: Optional[List[str]] = Field(
        None, description="Optional attachment paths for done action"
    )
    profile: Optional[str] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
    node: Optional[str] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
    target: Optional[Literal["sandbox", "host", "node"]] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )


OPENCLAW_COMPAT_ACTIONS = cast(
    tuple[str, ...],
    tuple(
        action
        for action in get_args(BrowserOpenClawCompatArgs.model_fields["action"].annotation)
        if isinstance(action, str)
    ),
)
