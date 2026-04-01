"""Canonical Windie browser tool schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from tools.browser.browser_action_contract import (
    BROWSER_CANONICAL_ACTIONS,
    REMOVED_BROWSER_ACTION_ALIASES,
)

BrowserNavigationState = Literal["load", "domcontentloaded", "networkidle", "commit"]
BrowserSnapshotFormat = Literal["ai", "aria"]
BrowserMouseButton = Literal["left", "right", "middle"]
BrowserScrollDirection = Literal["up", "down", "left", "right"]
BrowserWaitState = Literal["load", "domcontentloaded", "networkidle"]
BrowserAction = Literal[
    "connect",
    "status",
    "profiles",
    "navigate",
    "snapshot",
    "extract",
    "click",
    "input",
    "send_keys",
    "scroll",
    "screenshot",
    "wait",
    "get_tabs",
    "switch",
    "evaluate",
    "done",
    "search",
    "go_back",
    "search_page",
    "find_elements",
    "find_text",
    "close_tab",
    "dropdown_options",
    "select_dropdown",
    "upload_file",
    "write_file",
    "replace_file",
    "read_file",
    "read_long_content",
    "close",
    "type",
    "open",
    "switch_tab",
    "press",
    "act",
]


def _removed_legacy_alias_error(action: str, preferred: str | None) -> str:
    preferred_text = preferred or "canonical browser actions directly"
    return f"Legacy browser action '{action}' has been removed. Use {preferred_text}."


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


def _ensure_nonempty_string(value: Optional[str], message: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(message)


class BrowserControlArgs(BaseModel):
    """Canonical model-facing browser args used by the sidecar browser tool."""

    model_config = ConfigDict(extra="forbid")

    action: BrowserAction = Field(
        ..., description="Canonical browser action to perform."
    )

    headless: bool = Field(False, description="Run the managed browser headless.")
    url: Optional[str] = Field(None, description="URL for navigate action.")
    new_tab: Optional[bool] = Field(None, description="Open navigation in a new tab.")
    wait_until: BrowserNavigationState = Field(
        "load",
        description="Navigation or snapshot wait condition.",
    )

    mode: Optional[Literal["efficient", "focused", "full_text", "structured"]] = Field(
        None,
        description=(
            "Snapshot or extract mode. Use 'efficient' for compact snapshots or "
            "'focused'/'full_text'/'structured' for extract."
        ),
    )
    format: BrowserSnapshotFormat = Field("ai", description="Snapshot format.")
    max_chars: Optional[int] = Field(
        None,
        description="Optional character cap for snapshot or extract output.",
        ge=100,
        le=120000,
    )
    offset: Optional[int] = Field(
        None,
        description="Optional character offset for paginated reads.",
        ge=0,
    )
    limit: Optional[int] = Field(
        None,
        description="Optional result count or snapshot page size.",
        ge=1,
        le=120000,
    )
    refs: Optional[Literal["role", "aria"]] = Field(
        None,
        description="Reference mode for role snapshots.",
    )
    interactive: Optional[bool] = Field(
        None,
        description="Only include interactive roles in role snapshot output.",
    )
    compact: Optional[bool] = Field(
        None,
        description="Prune structural noise from role snapshot output.",
    )
    depth: Optional[int] = Field(
        None,
        description="Maximum role snapshot depth (0=root only).",
        ge=0,
        le=20,
    )
    selector: Optional[str] = Field(None, description="Optional CSS selector scope.")
    frame: Optional[str] = Field(None, description="Optional iframe selector scope.")
    query: Optional[str] = Field(
        None,
        description="Search or extract query text.",
        min_length=1,
        max_length=2000,
    )
    description: Optional[str] = Field(
        None,
        description="Optional description text for completion or navigation helpers.",
    )
    extract_links: bool = Field(
        False, description="Include links in extracted source text."
    )
    start_from_char: int = Field(
        0, description="Character offset for extract continuation.", ge=0
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON schema hint for structured extraction output.",
    )
    engine: Optional[str] = Field(None, description="Search engine for search action.")
    pattern: Optional[str] = Field(
        None, description="Pattern for search_page or find_text."
    )
    regex: Optional[bool] = Field(None, description="Regex toggle for search_page.")
    case_sensitive: Optional[bool] = Field(
        None, description="Case-sensitive toggle for search_page."
    )
    context_chars: Optional[int] = Field(
        None, description="Context characters for search_page.", ge=0
    )
    css_scope: Optional[str] = Field(None, description="CSS scope for page search.")
    max_results: Optional[int] = Field(
        None, description="Maximum results for search or find actions.", ge=1
    )
    attributes: Optional[List[str]] = Field(
        None, description="Attributes to include for find_elements output."
    )
    include_text: Optional[bool] = Field(
        None, description="Include element text in find_elements output."
    )

    ref: Optional[str] = Field(
        None, description="Element reference from snapshot output."
    )
    index: Optional[int] = Field(None, description="Element index.", ge=0)
    text: Optional[str] = Field(
        None,
        description="Text payload for input or select_dropdown actions.",
        max_length=10000,
    )
    submit: bool = Field(False, description="Submit after input.")
    clear: Optional[bool] = Field(
        None, description="Clear existing value before input."
    )
    clear_first: Optional[bool] = Field(
        None, description="Clear existing value before input."
    )
    key: Optional[str] = Field(None, description="Single key value.")
    keys: Optional[str] = Field(None, description="Key sequence for send_keys.")
    code: Optional[str] = Field(
        None, description="JavaScript code alias for evaluate.", max_length=5000
    )
    script: Optional[str] = Field(
        None, description="JavaScript to evaluate.", max_length=5000
    )
    double_click: bool = Field(False, description="Perform double click.")
    coordinate_x: Optional[int] = Field(
        None, description="Coordinate-click X position."
    )
    coordinate_y: Optional[int] = Field(
        None, description="Coordinate-click Y position."
    )
    button: BrowserMouseButton = Field("left", description="Mouse button.")

    direction: BrowserScrollDirection = Field("down", description="Scroll direction.")
    amount: int = Field(500, description="Scroll amount in pixels.", ge=100, le=5000)
    down: Optional[bool] = Field(None, description="Scroll direction override flag.")
    pages: Optional[float] = Field(None, description="Scroll page count.", gt=0)
    state: BrowserWaitState = Field("networkidle", description="Wait state.")
    seconds: Optional[float] = Field(
        None, description="Wait time in seconds.", ge=0, le=60
    )

    tab_id: Optional[str] = Field(None, description="Browser tab id.")
    target_id: Optional[str] = Field(None, description="Target tab id.")
    file_name: Optional[str] = Field(None, description="Optional output filename.")
    input_ref: Optional[str] = Field(None, description="Input ref for upload action.")
    paths: Optional[List[str]] = Field(
        None, description="File paths for upload action."
    )
    path: Optional[str] = Field(None, description="File path for browser file actions.")
    content: Optional[str] = Field(None, description="Content payload for write_file.")
    append: Optional[bool] = Field(None, description="Append mode for write_file.")
    trailing_newline: Optional[bool] = Field(
        None, description="Append trailing newline for write_file."
    )
    leading_newline: Optional[bool] = Field(
        None, description="Append leading newline for write_file."
    )
    old_str: Optional[str] = Field(None, description="Target string for replace_file.")
    new_str: Optional[str] = Field(
        None, description="Replacement string for replace_file."
    )
    goal: Optional[str] = Field(None, description="Goal for read_long_content.")
    source: Optional[str] = Field(
        None, description="Source hint for read_long_content."
    )
    context: Optional[str] = Field(None, description="Context for read_long_content.")
    success: Optional[bool] = Field(None, description="Success flag for done action.")
    files_to_display: Optional[List[str]] = Field(
        None, description="Attachment paths for done action."
    )
    level: Optional[str] = Field(None, description="Console log level filter.")

    full_page: bool = Field(
        False, description="Capture full page height for screenshots."
    )
    element: Optional[str] = Field(
        None, description="Optional CSS selector to screenshot."
    )
    type: Literal["png", "jpeg"] = Field("png", description="Screenshot image type.")
    quality: Optional[int] = Field(
        None, description="JPEG quality (1-100).", ge=1, le=100
    )

    @model_validator(mode="before")
    @classmethod
    def reject_removed_legacy_actions(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        action = data.get("action")
        if isinstance(action, str) and action in REMOVED_BROWSER_ACTION_ALIASES:
            raise ValueError(
                _removed_legacy_alias_error(
                    action,
                    REMOVED_BROWSER_ACTION_ALIASES.get(action),
                )
            )
        return data

    @model_validator(mode="after")
    def validate_action_specific_arguments(self) -> "BrowserControlArgs":
        if self.action not in BROWSER_CANONICAL_ACTIONS:
            raise ValueError(f"Unsupported browser action '{self.action}'.")
        if self.action == "navigate":
            _ensure_nonempty_string(self.url, "navigate requires non-empty 'url'")
        if self.action == "search":
            _ensure_nonempty_string(self.query, "search requires non-empty 'query'")
        if self.action == "extract":
            _ensure_nonempty_string(self.query, "extract requires non-empty 'query'")
        if self.action == "click":
            _ensure_click_target(
                ref=self.ref,
                index=self.index,
                coordinate_x=self.coordinate_x,
                coordinate_y=self.coordinate_y,
            )
        if self.action == "input":
            _ensure_nonempty_string(self.text, "input requires string 'text'")
            if self.ref is None and self.index is None:
                raise ValueError("input requires 'ref' or 'index'")
        if self.action == "send_keys":
            if not (
                (isinstance(self.keys, str) and self.keys.strip())
                or (isinstance(self.key, str) and self.key.strip())
            ):
                raise ValueError("send_keys requires non-empty 'keys' or 'key'")
        if self.action in {"switch", "close_tab"}:
            if not (
                (isinstance(self.target_id, str) and self.target_id.strip())
                or (isinstance(self.tab_id, str) and self.tab_id.strip())
            ):
                raise ValueError(
                    f"{self.action} requires non-empty 'target_id' or 'tab_id'"
                )
        if self.action == "evaluate":
            if self.script is None and self.code is None:
                raise ValueError("evaluate requires either 'script' or 'code'")
        if self.action == "find_elements":
            _ensure_nonempty_string(
                self.selector, "find_elements requires non-empty 'selector'"
            )
        if self.action == "find_text":
            if not (
                (isinstance(self.text, str) and self.text.strip())
                or (isinstance(self.pattern, str) and self.pattern.strip())
            ):
                raise ValueError("find_text requires non-empty 'text' or 'pattern'")
        if self.action == "search_page":
            if not (
                (isinstance(self.pattern, str) and self.pattern.strip())
                or (isinstance(self.query, str) and self.query.strip())
            ):
                raise ValueError("search_page requires non-empty 'pattern' or 'query'")
        if self.action in {"dropdown_options", "select_dropdown", "upload_file"}:
            if self.ref is None and self.index is None and self.input_ref is None:
                raise ValueError(
                    f"{self.action} requires 'ref', 'input_ref', or 'index'"
                )
        if self.action == "select_dropdown":
            _ensure_nonempty_string(
                self.text, "select_dropdown requires non-empty 'text'"
            )
        if self.action == "upload_file":
            has_path = isinstance(self.path, str) and self.path.strip()
            has_paths = isinstance(self.paths, list) and any(
                isinstance(candidate, str) and candidate.strip()
                for candidate in self.paths
            )
            if not has_path and not has_paths:
                raise ValueError("upload_file requires non-empty 'path' or 'paths'")
        if self.action == "write_file":
            _ensure_nonempty_string(self.path, "write_file requires non-empty 'path'")
            if not isinstance(self.content, str):
                raise ValueError("write_file requires string 'content'")
        if self.action == "replace_file":
            _ensure_nonempty_string(self.path, "replace_file requires non-empty 'path'")
            if not isinstance(self.old_str, str) or not isinstance(self.new_str, str):
                raise ValueError("replace_file requires string 'old_str' and 'new_str'")
        if self.action == "read_file":
            _ensure_nonempty_string(self.path, "read_file requires non-empty 'path'")
        if self.action == "read_long_content":
            _ensure_nonempty_string(
                self.goal, "read_long_content requires non-empty 'goal'"
            )
        return self


BrowserConnectArgs = BrowserControlArgs
BrowserNavigateArgs = BrowserControlArgs
BrowserSnapshotArgs = BrowserControlArgs
BrowserExtractArgs = BrowserControlArgs
BrowserClickArgs = BrowserControlArgs
BrowserScrollArgs = BrowserControlArgs
BrowserScreenshotArgs = BrowserControlArgs
BrowserWaitArgs = BrowserControlArgs
BrowserGetTabsArgs = BrowserControlArgs
BrowserEvaluateArgs = BrowserControlArgs
BrowserCloseArgs = BrowserControlArgs

BROWSER_SCHEMAS = {action: BrowserControlArgs for action in BROWSER_CANONICAL_ACTIONS}


def get_browser_schema(action: str) -> Optional[type[BaseModel]]:
    return BROWSER_SCHEMAS.get(action)


def validate_browser_args(action: str, args: dict) -> tuple[bool, Optional[str]]:
    try:
        BrowserControlArgs(**{**args, "action": action})
        return True, None
    except ValidationError as exc:
        return False, str(exc)
    except Exception as exc:
        return False, str(exc)
