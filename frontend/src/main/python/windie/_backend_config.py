"""
Shared backend endpoint configuration for the Python sidecar.
"""

import os

BACKEND_HTTP_URL_ENV = "WINDIE_BACKEND_HTTP_URL"


def _normalize_backend_http_url(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.rstrip("/")
    return normalized or None


def get_backend_http_url() -> str:
    """
    Resolve backend HTTP URL used by sidecar memory clients.

    Electron main owns endpoint override precedence and passes the resolved
    value to the sidecar as ``WINDIE_BACKEND_HTTP_URL``.
    """
    resolved_url = _normalize_backend_http_url(os.getenv(BACKEND_HTTP_URL_ENV))
    if resolved_url:
        return resolved_url
    raise RuntimeError(
        "Agent SDK backend URL is required. Pass backend_url or set "
        f"{BACKEND_HTTP_URL_ENV}."
    )
