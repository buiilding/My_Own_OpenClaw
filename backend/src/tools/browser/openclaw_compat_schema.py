"""OpenClaw-compatible browser schema definitions for backend validation."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import ConfigDict, Field

from backend.src.tools.browser.schema_types import (
    BrowserOpenClawAction,
    BrowserSnapshotFormat,
)
from backend.src.tools.browser.shared_compat_fields import BrowserSharedCompatFields


class BrowserOpenClawCompatArgs(BrowserSharedCompatFields):
    """OpenClaw-compatible browser actions and payload fields."""

    model_config = ConfigDict(extra="ignore")

    action: BrowserOpenClawAction = Field(
        ..., description="OpenClaw-compatible browser action"
    )
    mode: Optional[Literal["user_chrome", "managed", "efficient"]] = Field(
        None, description="Connect/snapshot mode for compatible actions."
    )
    cdp_url: Optional[str] = Field(None, description="Optional CDP URL.")
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
    snapshotFormat: Optional[BrowserSnapshotFormat] = Field(
        None, description="Snapshot format alias."
    )
    input_ref: Optional[str] = Field(None, description="Input ref for upload")
    inputRef: Optional[str] = Field(
        None, description="Input ref for upload (camelCase)"
    )
    paths: Optional[List[str]] = Field(None, description="File paths for upload")
    level: Optional[str] = Field(None, description="Console log level filter")
    limit: Optional[int] = Field(None, description="Result item limit")
    text: Optional[str] = Field(
        None, description="Text payload for done/input/find_text/select_dropdown actions"
    )
    selector: Optional[str] = Field(
        None, description="CSS selector for find_elements action"
    )
    key: Optional[str] = Field(None, description="Single storage key")
    element: Optional[str] = Field(None, description="Element selector alias")
    type: Optional[Literal["png", "jpeg"]] = Field(
        None, description="Screenshot image type"
    )
    quality: Optional[int] = Field(None, description="JPEG quality", ge=1, le=100)
    file_name: Optional[str] = Field(None, description="Filename for file actions")
    pages: Optional[float] = Field(None, description="Browser Use page count", gt=0)
    down: Optional[bool] = Field(None, description="Browser Use scroll direction flag")
    code: Optional[str] = Field(None, description="Browser Use evaluate code")
