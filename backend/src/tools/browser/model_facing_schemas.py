"""Strict model-facing browser action schemas for native tool calling."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.src.tools.browser.schema_types import (
    BrowserMouseButton,
    BrowserScrollDirection,
)


class BrowserModelFacingArgs(BaseModel):
    """Base class for strict model-facing browser schemas."""

    model_config = ConfigDict(extra="forbid")


def _require_ref_or_index(
    *,
    action: str,
    ref: Optional[str],
    index: Optional[int],
) -> None:
    has_ref = isinstance(ref, str) and bool(ref.strip())
    has_index = isinstance(index, int) and index >= 0
    if not has_ref and not has_index:
        raise ValueError(f"{action} requires non-empty 'ref' or non-negative 'index'")


def _require_tab_target(
    *,
    action: str,
    tab_id: Optional[str],
    target_id: Optional[str],
) -> None:
    has_tab_id = isinstance(tab_id, str) and bool(tab_id.strip())
    has_target_id = isinstance(target_id, str) and bool(target_id.strip())
    if not has_tab_id and not has_target_id:
        raise ValueError(f"{action} requires non-empty 'tab_id' or 'target_id'")


class BrowserConnectActionArgs(BrowserModelFacingArgs):
    action: Literal["connect"] = Field(..., description="Browser action.")
    headless: bool = Field(False, description="Run managed browser headless.")


class BrowserStatusActionArgs(BrowserModelFacingArgs):
    action: Literal["status"] = Field(..., description="Browser action.")


class BrowserProfilesActionArgs(BrowserModelFacingArgs):
    action: Literal["profiles"] = Field(..., description="Browser action.")


class BrowserNavigateActionArgs(BrowserModelFacingArgs):
    action: Literal["navigate"] = Field(..., description="Browser action.")
    url: str = Field(..., description="URL for navigate action.", min_length=1)
    new_tab: bool = Field(False, description="Open navigate URL in new tab.")


class BrowserSnapshotActionArgs(BrowserModelFacingArgs):
    action: Literal["snapshot"] = Field(..., description="Browser action.")
    offset: Optional[int] = Field(
        None,
        description="Character offset for paginated reads.",
        ge=0,
    )
    limit: Optional[int] = Field(
        None,
        description="Maximum result count or page size.",
        ge=1,
    )


class BrowserExtractActionArgs(BrowserModelFacingArgs):
    action: Literal["extract"] = Field(..., description="Browser action.")
    query: str = Field(..., description="Query text for extract/search actions.", min_length=1)
    extract_links: bool = Field(
        False,
        description="Include links in extracted content.",
    )
    start_from_char: int = Field(
        0,
        description="Character offset for extract continuation.",
        ge=0,
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional schema hint for extract results.",
    )


class BrowserClickActionArgs(BrowserModelFacingArgs):
    action: Literal["click"] = Field(..., description="Browser action.")
    ref: Optional[str] = Field(None, description="Element reference from snapshot output.")
    index: Optional[int] = Field(None, description="Element index.", ge=0)
    coordinate_x: Optional[int] = Field(None, description="Click X coordinate.")
    coordinate_y: Optional[int] = Field(None, description="Click Y coordinate.")
    double_click: bool = Field(False, description="Perform double click.")
    button: BrowserMouseButton = Field("left", description="Mouse button.")

    @model_validator(mode="after")
    def validate_target(self):
        has_ref = isinstance(self.ref, str) and bool(self.ref.strip())
        has_index = isinstance(self.index, int) and self.index >= 0
        has_x = self.coordinate_x is not None
        has_y = self.coordinate_y is not None
        if not has_ref and not has_index and not (has_x and has_y):
            raise ValueError(
                "click requires non-empty 'ref', non-negative 'index', or both 'coordinate_x' and 'coordinate_y'"
            )
        if has_x != has_y:
            raise ValueError(
                "click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click"
            )
        return self


class BrowserInputActionArgs(BrowserModelFacingArgs):
    action: Literal["input"] = Field(..., description="Browser action.")
    ref: Optional[str] = Field(None, description="Element reference from snapshot output.")
    index: Optional[int] = Field(None, description="Element index.", ge=0)
    text: str = Field(..., description="Text payload for input action.", max_length=10000)
    submit: bool = Field(False, description="Submit after input.")
    clear: Optional[bool] = Field(None, description="Clear before typing.")
    clear_first: Optional[bool] = Field(None, description="Clear before typing.")

    @model_validator(mode="after")
    def validate_target(self):
        _require_ref_or_index(action="input", ref=self.ref, index=self.index)
        return self


class BrowserSendKeysActionArgs(BrowserModelFacingArgs):
    action: Literal["send_keys"] = Field(..., description="Browser action.")
    keys: Optional[str] = Field(None, description="Key sequence for send_keys.")
    key: Optional[str] = Field(None, description="Single key value.")

    @model_validator(mode="after")
    def validate_keys(self):
        has_keys = isinstance(self.keys, str) and bool(self.keys.strip())
        has_key = isinstance(self.key, str) and bool(self.key.strip())
        if not has_keys and not has_key:
            raise ValueError("send_keys requires non-empty 'keys' or 'key'")
        return self


class BrowserScrollActionArgs(BrowserModelFacingArgs):
    action: Literal["scroll"] = Field(..., description="Browser action.")
    direction: BrowserScrollDirection = Field("down", description="Scroll direction.")
    amount: int = Field(500, description="Scroll amount.", ge=100, le=5000)
    down: Optional[bool] = Field(None, description="Scroll direction flag.")
    pages: Optional[float] = Field(None, description="Scroll amount in pages.", gt=0)
    index: Optional[int] = Field(None, description="Element index.", ge=0)


class BrowserScreenshotActionArgs(BrowserModelFacingArgs):
    action: Literal["screenshot"] = Field(..., description="Browser action.")
    file_name: Optional[str] = Field(None, description="Optional output filename.")


class BrowserWaitActionArgs(BrowserModelFacingArgs):
    action: Literal["wait"] = Field(..., description="Browser action.")
    seconds: Optional[float] = Field(
        None,
        description="Wait duration in seconds.",
        ge=0,
        le=60,
    )


class BrowserGetTabsActionArgs(BrowserModelFacingArgs):
    action: Literal["get_tabs"] = Field(..., description="Browser action.")


class BrowserSwitchActionArgs(BrowserModelFacingArgs):
    action: Literal["switch"] = Field(..., description="Browser action.")
    target_id: Optional[str] = Field(None, description="Target tab id.")
    tab_id: Optional[str] = Field(None, description="Tab id.")

    @model_validator(mode="after")
    def validate_target(self):
        _require_tab_target(action="switch", tab_id=self.tab_id, target_id=self.target_id)
        return self


class BrowserEvaluateActionArgs(BrowserModelFacingArgs):
    action: Literal["evaluate"] = Field(..., description="Browser action.")
    script: Optional[str] = Field(None, description="JavaScript code for evaluate action.", max_length=5000)
    code: Optional[str] = Field(None, description="JavaScript code alias.", max_length=5000)

    @model_validator(mode="after")
    def validate_code(self):
        has_script = isinstance(self.script, str) and bool(self.script.strip())
        has_code = isinstance(self.code, str) and bool(self.code.strip())
        if not has_script and not has_code:
            raise ValueError("evaluate requires non-empty 'script' or 'code'")
        return self


class BrowserDoneActionArgs(BrowserModelFacingArgs):
    action: Literal["done"] = Field(..., description="Browser action.")
    text: str = Field("Done.", description="Text payload for done action.", max_length=10000)
    success: Optional[bool] = Field(None, description="Success flag for done action.")
    files_to_display: Optional[List[str]] = Field(
        None,
        description="Files to display after completion.",
    )


class BrowserSearchActionArgs(BrowserModelFacingArgs):
    action: Literal["search"] = Field(..., description="Browser action.")
    query: str = Field(..., description="Query text for extract/search actions.", min_length=1)
    engine: Optional[str] = Field(None, description="Search engine.")


class BrowserGoBackActionArgs(BrowserModelFacingArgs):
    action: Literal["go_back"] = Field(..., description="Browser action.")
    description: Optional[str] = Field(None, description="Description for go_back action.")


class BrowserSearchPageActionArgs(BrowserModelFacingArgs):
    action: Literal["search_page"] = Field(..., description="Browser action.")
    pattern: Optional[str] = Field(None, description="Pattern for search_page/find_text.")
    query: Optional[str] = Field(None, description="Query text alias for search_page.")
    regex: Optional[bool] = Field(None, description="Regex toggle for search_page.")
    case_sensitive: Optional[bool] = Field(None, description="Case-sensitive toggle for search_page.")
    context_chars: Optional[int] = Field(None, description="Context chars for search_page.", ge=0)
    css_scope: Optional[str] = Field(None, description="CSS scope for search_page.")
    max_results: Optional[int] = Field(None, description="Max results for find/search.", ge=1)

    @model_validator(mode="after")
    def validate_pattern(self):
        has_pattern = isinstance(self.pattern, str) and bool(self.pattern.strip())
        has_query = isinstance(self.query, str) and bool(self.query.strip())
        if not has_pattern and not has_query:
            raise ValueError("search_page requires non-empty 'pattern' or 'query'")
        return self


class BrowserFindElementsActionArgs(BrowserModelFacingArgs):
    action: Literal["find_elements"] = Field(..., description="Browser action.")
    selector: str = Field(..., description="CSS selector for find_elements action.", min_length=1)
    max_results: Optional[int] = Field(None, description="Max results for find/search.", ge=1)
    attributes: Optional[List[str]] = Field(None, description="Attributes for find_elements output.")
    include_text: Optional[bool] = Field(None, description="Include element text for find_elements.")


class BrowserFindTextActionArgs(BrowserModelFacingArgs):
    action: Literal["find_text"] = Field(..., description="Browser action.")
    text: Optional[str] = Field(None, description="Text payload for find_text.")
    pattern: Optional[str] = Field(None, description="Pattern alias for find_text.")

    @model_validator(mode="after")
    def validate_text(self):
        has_text = isinstance(self.text, str) and bool(self.text.strip())
        has_pattern = isinstance(self.pattern, str) and bool(self.pattern.strip())
        if not has_text and not has_pattern:
            raise ValueError("find_text requires non-empty 'text' or 'pattern'")
        return self


class BrowserCloseTabActionArgs(BrowserModelFacingArgs):
    action: Literal["close_tab"] = Field(..., description="Browser action.")
    target_id: Optional[str] = Field(None, description="Target tab id.")
    tab_id: Optional[str] = Field(None, description="Tab id.")

    @model_validator(mode="after")
    def validate_target(self):
        _require_tab_target(action="close_tab", tab_id=self.tab_id, target_id=self.target_id)
        return self


class BrowserDropdownOptionsActionArgs(BrowserModelFacingArgs):
    action: Literal["dropdown_options"] = Field(..., description="Browser action.")
    ref: Optional[str] = Field(None, description="Element reference from snapshot output.")
    index: Optional[int] = Field(None, description="Element index.", ge=0)

    @model_validator(mode="after")
    def validate_target(self):
        _require_ref_or_index(action="dropdown_options", ref=self.ref, index=self.index)
        return self


class BrowserSelectDropdownActionArgs(BrowserModelFacingArgs):
    action: Literal["select_dropdown"] = Field(..., description="Browser action.")
    ref: Optional[str] = Field(None, description="Element reference from snapshot output.")
    index: Optional[int] = Field(None, description="Element index.", ge=0)
    text: str = Field(..., description="Text payload for select_dropdown action.", min_length=1)

    @model_validator(mode="after")
    def validate_target(self):
        _require_ref_or_index(action="select_dropdown", ref=self.ref, index=self.index)
        return self


class BrowserUploadFileActionArgs(BrowserModelFacingArgs):
    action: Literal["upload_file"] = Field(..., description="Browser action.")
    ref: Optional[str] = Field(None, description="Element reference from snapshot output.")
    index: Optional[int] = Field(None, description="Element index.", ge=0)
    path: Optional[str] = Field(None, description="File path for upload action.")
    paths: Optional[List[str]] = Field(None, description="File paths for upload action.")

    @model_validator(mode="after")
    def validate_target_and_path(self):
        _require_ref_or_index(action="upload_file", ref=self.ref, index=self.index)
        has_path = isinstance(self.path, str) and bool(self.path.strip())
        has_paths = isinstance(self.paths, list) and any(
            isinstance(path, str) and path.strip() for path in self.paths
        )
        if not has_path and not has_paths:
            raise ValueError("upload_file requires non-empty 'path' or at least one entry in 'paths'")
        return self


class BrowserReadLongContentActionArgs(BrowserModelFacingArgs):
    action: Literal["read_long_content"] = Field(..., description="Browser action.")
    goal: Optional[str] = Field(None, description="Goal for read_long_content.")
    query: Optional[str] = Field(None, description="Query alias for read_long_content.")
    source: Optional[str] = Field(None, description="Source for read_long_content.")
    context: Optional[str] = Field(None, description="Context for read_long_content.")

    @model_validator(mode="after")
    def validate_goal(self):
        has_goal = isinstance(self.goal, str) and bool(self.goal.strip())
        has_query = isinstance(self.query, str) and bool(self.query.strip())
        if not has_goal and not has_query:
            raise ValueError("read_long_content requires non-empty 'goal' or 'query'")
        return self


class BrowserCloseActionArgs(BrowserModelFacingArgs):
    action: Literal["close"] = Field(..., description="Browser action.")
    target_id: Optional[str] = Field(None, description="Target tab id.")
    tab_id: Optional[str] = Field(None, description="Tab id.")

    @model_validator(mode="after")
    def validate_target(self):
        _require_tab_target(action="close", tab_id=self.tab_id, target_id=self.target_id)
        return self


MODEL_FACING_BROWSER_ACTION_MODELS: dict[str, type[BrowserModelFacingArgs]] = {
    "connect": BrowserConnectActionArgs,
    "status": BrowserStatusActionArgs,
    "profiles": BrowserProfilesActionArgs,
    "navigate": BrowserNavigateActionArgs,
    "snapshot": BrowserSnapshotActionArgs,
    "extract": BrowserExtractActionArgs,
    "click": BrowserClickActionArgs,
    "input": BrowserInputActionArgs,
    "send_keys": BrowserSendKeysActionArgs,
    "scroll": BrowserScrollActionArgs,
    "screenshot": BrowserScreenshotActionArgs,
    "wait": BrowserWaitActionArgs,
    "get_tabs": BrowserGetTabsActionArgs,
    "switch": BrowserSwitchActionArgs,
    "evaluate": BrowserEvaluateActionArgs,
    "done": BrowserDoneActionArgs,
    "search": BrowserSearchActionArgs,
    "go_back": BrowserGoBackActionArgs,
    "search_page": BrowserSearchPageActionArgs,
    "find_elements": BrowserFindElementsActionArgs,
    "find_text": BrowserFindTextActionArgs,
    "close_tab": BrowserCloseTabActionArgs,
    "dropdown_options": BrowserDropdownOptionsActionArgs,
    "select_dropdown": BrowserSelectDropdownActionArgs,
    "upload_file": BrowserUploadFileActionArgs,
    "read_long_content": BrowserReadLongContentActionArgs,
    "close": BrowserCloseActionArgs,
}
