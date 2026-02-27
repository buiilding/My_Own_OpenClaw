"""OpenClaw-compatible browser schema definitions for backend validation."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import ConfigDict, Field

from backend.src.tools.browser.schema_types import (
    BrowserOpenClawAction,
    BrowserSnapshotFormat,
)
from backend.src.tools.browser.shared_compat_fields import BrowserSharedCompatFields


def _openclaw_field(description: str, **kwargs):
    return Field(None, description=description, **kwargs)


class BrowserOpenClawCompatArgs(BrowserSharedCompatFields):
    """OpenClaw-compatible browser actions and payload fields.

    Removed aliases such as ``act`` are intentionally excluded.
    """

    model_config = ConfigDict(extra="ignore")

    action: BrowserOpenClawAction = Field(
        ..., description="OpenClaw-compatible browser action"
    )
    mode: Optional[Literal["user_chrome", "managed", "efficient"]] = _openclaw_field(
        "Connect/snapshot mode for compatible actions."
    )
    cdp_url: Optional[str] = _openclaw_field("Optional CDP URL.")
    target_id: Optional[str] = _openclaw_field("Tab target ID")
    targetId: Optional[str] = _openclaw_field("Tab target ID (camelCase)")
    target_url: Optional[str] = _openclaw_field("URL to open/navigate")
    targetUrl: Optional[str] = _openclaw_field("URL to open/navigate (camelCase)")
    url: Optional[str] = _openclaw_field("URL to open/navigate")
    query: Optional[str] = _openclaw_field("Search/extract query text")
    description: Optional[str] = _openclaw_field("Description for go_back action")
    engine: Optional[str] = _openclaw_field("Search engine (for search action)")
    pattern: Optional[str] = _openclaw_field(
        "Pattern to find for search_page/find_text"
    )
    regex: Optional[bool] = _openclaw_field("Interpret pattern as regex")
    case_sensitive: Optional[bool] = _openclaw_field("Case-sensitive match toggle")
    context_chars: Optional[int] = _openclaw_field(
        "Context window chars for search_page",
        ge=0,
    )
    css_scope: Optional[str] = _openclaw_field("CSS scope for search_page")
    max_results: Optional[int] = _openclaw_field("Maximum result count", ge=1)
    attributes: Optional[List[str]] = _openclaw_field(
        "Attributes to include for find_elements"
    )
    include_text: Optional[bool] = _openclaw_field(
        "Include text output for find_elements"
    )
    index: Optional[int] = _openclaw_field("Browser Use element index", ge=0)
    tab_id: Optional[str] = _openclaw_field("Browser Use tab id")
    new_tab: Optional[bool] = _openclaw_field("Open navigate URL in new tab")
    snapshotFormat: Optional[BrowserSnapshotFormat] = _openclaw_field(
        "Snapshot format alias."
    )
    input_ref: Optional[str] = _openclaw_field("Input ref for upload")
    inputRef: Optional[str] = _openclaw_field("Input ref for upload (camelCase)")
    paths: Optional[List[str]] = _openclaw_field("File paths for upload")
    level: Optional[str] = _openclaw_field("Console log level filter")
    limit: Optional[int] = _openclaw_field("Result item limit")
    text: Optional[str] = _openclaw_field(
        "Text payload for done/input/find_text/select_dropdown actions"
    )
    selector: Optional[str] = _openclaw_field(
        "CSS selector for find_elements action"
    )
    key: Optional[str] = _openclaw_field("Single storage key")
    element: Optional[str] = _openclaw_field("Element selector alias")
    type: Optional[Literal["png", "jpeg"]] = _openclaw_field(
        "Screenshot image type"
    )
    quality: Optional[int] = _openclaw_field("JPEG quality", ge=1, le=100)
    file_name: Optional[str] = _openclaw_field("Filename for file actions")
    pages: Optional[float] = _openclaw_field("Browser Use page count", gt=0)
    down: Optional[bool] = _openclaw_field("Browser Use scroll direction flag")
    code: Optional[str] = _openclaw_field("Browser Use evaluate code")
