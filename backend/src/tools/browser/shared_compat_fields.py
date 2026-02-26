"""Shared browser compatibility fields used by multiple schema models."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


def _compat_field(description: str):
    return Field(None, description=description)


class BrowserSharedCompatFields(BaseModel):
    """Common storage/network/emulation fields for browser compatibility schemas."""

    clear: Optional[bool] = _compat_field("Clear retained console/dialog events")
    timeoutMs: Optional[int] = _compat_field("Timeout in milliseconds")
    timeout_ms: Optional[int] = _compat_field("Timeout in milliseconds (snake_case)")
    accept: Optional[bool] = _compat_field("Dialog accept/dismiss policy")
    promptText: Optional[str] = _compat_field("Prompt text for dialog.accept()")
    prompt_text: Optional[str] = _compat_field(
        "Prompt text for dialog.accept() (snake_case)"
    )
    cookies: Optional[List[Dict[str, Any]]] = _compat_field(
        "Cookies payload for cookies_set"
    )
    kind: Optional[Literal["local", "session"]] = _compat_field("Storage kind")
    values: Optional[Dict[str, Any]] = _compat_field("Storage key-values")
    value: Optional[Any] = _compat_field("Single storage value")

    contains: Optional[str] = _compat_field("Requests contains filter")
    filter: Optional[str] = _compat_field("Requests filter alias")
    snapshots: Optional[bool] = _compat_field("Trace snapshots toggle")
    screenshots: Optional[bool] = _compat_field("Trace screenshots toggle")
    sources: Optional[bool] = _compat_field("Trace sources toggle")
    offline: Optional[bool] = _compat_field("Offline toggle")
    enabled: Optional[bool] = _compat_field("Offline alias")
    headers: Optional[Dict[str, str]] = _compat_field("Extra HTTP headers")
    username: Optional[str] = _compat_field("HTTP auth username")
    user: Optional[str] = _compat_field("HTTP auth username alias")
    password: Optional[str] = _compat_field("HTTP auth password")
    latitude: Optional[float] = _compat_field("Geolocation latitude")
    longitude: Optional[float] = _compat_field("Geolocation longitude")
    accuracy: Optional[float] = _compat_field("Geolocation accuracy meters")
    media: Optional[str] = _compat_field("Media type emulation")
    color_scheme: Optional[str] = _compat_field("Color scheme emulation")
    colorScheme: Optional[str] = _compat_field("Color scheme emulation alias")
    timezone: Optional[str] = _compat_field("Timezone id")
    locale: Optional[str] = _compat_field("Locale id")
    device: Optional[str] = _compat_field("Device preset name")

    # Shared file/text mutation compatibility fields.
    content: Optional[str] = _compat_field("Content for write_file")
    append: Optional[bool] = _compat_field("Append mode for write_file")
    trailing_newline: Optional[bool] = _compat_field(
        "Append trailing newline for write_file"
    )
    leading_newline: Optional[bool] = _compat_field(
        "Append leading newline for write_file"
    )
    old_str: Optional[str] = _compat_field("Target string for replace_file")
    new_str: Optional[str] = _compat_field("Replacement string for replace_file")
    path: Optional[str] = _compat_field("File path for upload_file")
    goal: Optional[str] = _compat_field("Goal for read_long_content")
    source: Optional[str] = _compat_field("Source for read_long_content")
    context: Optional[str] = _compat_field("Context for read_long_content")
    keys: Optional[str] = _compat_field("Keyboard sequence for send_keys")
    success: Optional[bool] = _compat_field("Success flag for done action")
    files_to_display: Optional[List[str]] = _compat_field(
        "Optional attachment paths for done action"
    )

    # Shared no-op compatibility fields.
    profile: Optional[str] = _compat_field("Compatibility field (unused in WindieOS)")
    node: Optional[str] = _compat_field("Compatibility field (unused in WindieOS)")
    target: Optional[Literal["sandbox", "host", "node"]] = _compat_field(
        "Compatibility field (unused in WindieOS)"
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
