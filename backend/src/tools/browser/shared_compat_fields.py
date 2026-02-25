"""Shared browser compatibility fields used by multiple schema models."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class BrowserSharedCompatFields(BaseModel):
    """Common storage/network/emulation fields for browser compatibility schemas."""

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
    cookies: Optional[List[Dict[str, Any]]] = Field(
        None, description="Cookies payload for cookies_set"
    )
    kind: Optional[Literal["local", "session"]] = Field(
        None, description="Storage kind"
    )
    values: Optional[Dict[str, Any]] = Field(None, description="Storage key-values")
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

    # Shared file/text mutation compatibility fields.
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
    success: Optional[bool] = Field(None, description="Success flag for done action")
    files_to_display: Optional[List[str]] = Field(
        None, description="Optional attachment paths for done action"
    )

    # Shared no-op compatibility fields.
    profile: Optional[str] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
    node: Optional[str] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )
    target: Optional[Literal["sandbox", "host", "node"]] = Field(
        None, description="Compatibility field (unused in WindieOS)"
    )


class BrowserScreenshotImageFields(BaseModel):
    """Shared screenshot image options for browser schemas."""

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
