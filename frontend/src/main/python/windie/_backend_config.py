"""
Shared backend endpoint configuration for the Python sidecar.
"""

import os

DEFAULT_BACKEND_HTTP_URL = "https://api.windieos.com"


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
    return (
        _normalize_backend_http_url(os.getenv("WINDIE_BACKEND_HTTP_URL"))
        or DEFAULT_BACKEND_HTTP_URL
    )
