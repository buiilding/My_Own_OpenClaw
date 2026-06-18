"""
Shared backend endpoint configuration for Python SDK local-runtime clients.
"""

import os

BACKEND_HTTP_URL_ENV = "AGENT_BACKEND_HTTP_URL"
LEGACY_BACKEND_HTTP_URL_ENV = "WINDIE_BACKEND_HTTP_URL"
BACKEND_HTTP_URL_ENVS = (
    BACKEND_HTTP_URL_ENV,
    LEGACY_BACKEND_HTTP_URL_ENV,
)


def _normalize_backend_http_url(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.rstrip("/")
    return normalized or None


def get_backend_http_url() -> str:
    """
    Resolve backend HTTP URL used by Python SDK hosted clients.

    Electron main owns endpoint override precedence and passes the resolved
    value to the local runtime through the configured env key. Standalone SDK
    callers may set ``AGENT_BACKEND_HTTP_URL`` directly.
    """
    for env_key in BACKEND_HTTP_URL_ENVS:
        resolved_url = _normalize_backend_http_url(os.getenv(env_key))
        if resolved_url:
            return resolved_url
    raise RuntimeError(
        "Agent SDK backend URL is required. Pass backend_url or set "
        f"{BACKEND_HTTP_URL_ENV} (legacy {LEGACY_BACKEND_HTTP_URL_ENV} is also supported)."
    )
