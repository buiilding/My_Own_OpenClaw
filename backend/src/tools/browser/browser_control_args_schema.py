"""Canonical model-facing browser args for backend tool calling."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.src.tools.browser.schema_types import (
    BROWSER_REMOVED_ACTION_PREFERRED,
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


def _ensure_evaluate_payload(script: Optional[str], code: Optional[str]) -> None:
    if script is None and code is None:
        raise ValueError("evaluate requires either 'script' or 'code'")


class _BrowserControlArgsBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    action: BrowserCanonicalAction = Field(
        ...,
        description="Canonical browser action to perform.",
    )

    # Browser session / navigation
    headless: bool = Field(False, description="Run the managed browser headless.")
    url: Optional[str] = Field(None, description="URL for navigate action.")
    new_tab: Optional[bool] = Field(None, description="Open navigation in a new tab.")
    wait_until: BrowserNavigationState = Field(
        "load",
        description="Navigation or snapshot wait condition.",
    )

    # Snapshot / extraction
    mode: Optional[Literal["efficient", "focused", "full_text", "structured"]] = Field(
        None,
        description=(
            "Snapshot or extract mode. Use 'efficient' for compact snapshots or "
            "'focused'/'full_text'/'structured' for extract."
        ),
    )
    format: BrowserSnapshotFormat = Field(
        "ai",
        description="Snapshot format.",
    )
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
    refs: SnapshotRefsField
    interactive: SnapshotInteractiveField
    compact: SnapshotCompactField
    depth: SnapshotDepthField
    selector: SnapshotSelectorField
    frame: SnapshotFrameField
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
        False,
        description="Include links in extracted source text.",
    )
    start_from_char: int = Field(
        0,
        description="Character offset for extract continuation.",
        ge=0,
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON schema hint for structured extraction output.",
    )
    engine: Optional[str] = Field(None, description="Search engine for search action.")
    pattern: Optional[str] = Field(None, description="Pattern for search_page or find_text.")
    regex: Optional[bool] = Field(None, description="Regex toggle for search_page.")
    case_sensitive: Optional[bool] = Field(
        None,
        description="Case-sensitive toggle for search_page.",
    )
    context_chars: Optional[int] = Field(
        None,
        description="Context characters for search_page.",
        ge=0,
    )
    css_scope: Optional[str] = Field(None, description="CSS scope for page search.")
    max_results: Optional[int] = Field(
        None,
        description="Maximum results for search or find actions.",
        ge=1,
    )
    attributes: Optional[List[str]] = Field(
        None,
        description="Attributes to include for find_elements output.",
    )
    include_text: Optional[bool] = Field(
        None,
        description="Include element text in find_elements output.",
    )

    # Interaction
    ref: Optional[str] = Field(None, description="Element reference from snapshot output.")
    index: Optional[int] = Field(None, description="Element index.", ge=0)
    text: Optional[str] = Field(
        None,
        description="Text payload for input or select_dropdown actions.",
        max_length=10000,
    )
    submit: bool = Field(False, description="Submit after input.")
    key: Optional[str] = Field(None, description="Single key value.")
    keys: Optional[str] = Field(None, description="Key sequence for send_keys.")
    code: Optional[str] = Field(
        None,
        description="JavaScript code alias for evaluate.",
        max_length=5000,
    )
    double_click: bool = Field(False, description="Perform double click.")
    coordinate_x: Optional[int] = Field(
        None,
        description="Coordinate-click X position.",
    )
    coordinate_y: Optional[int] = Field(
        None,
        description="Coordinate-click Y position.",
    )
    button: BrowserMouseButton = Field("left", description="Mouse button.")

    # Scroll / wait
    direction: BrowserScrollDirection = Field("down", description="Scroll direction.")
    amount: int = Field(500, description="Scroll amount in pixels.", ge=100, le=5000)
    down: Optional[bool] = Field(None, description="Browser Use scroll direction flag.")
    pages: Optional[float] = Field(None, description="Browser Use page count.", gt=0)
    state: BrowserWaitState = Field("networkidle", description="Wait state.")
    seconds: Optional[float] = Field(None, description="Wait time in seconds.", ge=0, le=60)

    # Tabs / files / completion
    tab_id: Optional[str] = Field(None, description="Browser tab id.")
    target_id: Optional[str] = Field(None, description="Target tab id.")
    file_name: Optional[str] = Field(None, description="Optional output filename.")
    input_ref: Optional[str] = Field(None, description="Input ref for upload action.")
    paths: Optional[List[str]] = Field(None, description="File paths for upload action.")
    path: Optional[str] = Field(None, description="File path for browser file actions.")
    content: Optional[str] = Field(
        None,
        description="Content payload for write_file.",
    )
    append: Optional[bool] = Field(None, description="Append mode for write_file.")
    trailing_newline: Optional[bool] = Field(
        None,
        description="Append trailing newline for write_file.",
    )
    leading_newline: Optional[bool] = Field(
        None,
        description="Append leading newline for write_file.",
    )
    old_str: Optional[str] = Field(None, description="Target string for replace_file.")
    new_str: Optional[str] = Field(None, description="Replacement string for replace_file.")
    goal: Optional[str] = Field(None, description="Goal for read_long_content.")
    source: Optional[str] = Field(None, description="Source hint for read_long_content.")
    context: Optional[str] = Field(None, description="Context for read_long_content.")
    success: Optional[bool] = Field(None, description="Success flag for done action.")
    files_to_display: Optional[List[str]] = Field(
        None,
        description="Attachment paths for done action.",
    )
    level: Optional[str] = Field(None, description="Console log level filter.")
    script: Optional[str] = Field(
        None,
        description="JavaScript to evaluate.",
        max_length=5000,
    )


class BrowserCanonicalControlArgs(_BrowserControlArgsBase):
    """Canonical backend browser control schema."""

    @model_validator(mode="before")
    @classmethod
    def reject_removed_legacy_actions(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        action = data.get("action")
        if isinstance(action, str) and action in BROWSER_REMOVED_ACTION_PREFERRED:
            raise ValueError(
                _removed_legacy_alias_error(
                    action,
                    BROWSER_REMOVED_ACTION_PREFERRED.get(action),
                )
            )
        return data

    @model_validator(mode="after")
    def validate_action_specific_arguments(self) -> "BrowserCanonicalControlArgs":
        if self.action == "click":
            _ensure_click_target(
                ref=self.ref,
                index=self.index,
                coordinate_x=self.coordinate_x,
                coordinate_y=self.coordinate_y,
            )
        if self.action == "evaluate":
            _ensure_evaluate_payload(script=self.script, code=self.code)
        return self

    @property
    def preferred_action(self) -> None:
        return None


class BrowserControlArgs(BrowserCanonicalControlArgs):
    """Canonical model-facing browser args used by the remote browser tool."""
