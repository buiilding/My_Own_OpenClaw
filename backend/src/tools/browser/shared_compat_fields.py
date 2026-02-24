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
    request: Optional[Dict[str, Any]] = Field(
        None, description="Nested action payload for act."
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
