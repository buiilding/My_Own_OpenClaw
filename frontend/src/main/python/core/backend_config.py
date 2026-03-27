"""
Shared backend endpoint configuration for the Python sidecar.
"""

import os

DEFAULT_BACKEND_HTTP_URL = "http://127.0.0.1:8765"


def _normalize_backend_http_url(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.rstrip("/")
    return normalized or None


def get_backend_http_urls() -> list[str]:
    """
    Resolve backend HTTP URL candidates used by sidecar memory clients.

    Resolution order:
    1. WINDIE_BACKEND_HTTP_URL (set by Electron main process)
    2. WINDIE_BACKEND_FALLBACK_HTTP_URL (optional local fallback from Electron main)
    3. BACKEND_HTTP_URL
    4. default localhost URL
    """
    candidates: list[str] = []
    seen: set[str] = set()

    for raw_value in (
        os.getenv("WINDIE_BACKEND_HTTP_URL"),
        os.getenv("WINDIE_BACKEND_FALLBACK_HTTP_URL"),
        os.getenv("BACKEND_HTTP_URL"),
        DEFAULT_BACKEND_HTTP_URL,
    ):
        normalized = _normalize_backend_http_url(raw_value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        candidates.append(normalized)

    return candidates


def get_backend_http_url() -> str:
    """
    Resolve backend HTTP URL used by sidecar memory clients.

    Returns the primary backend URL. Use ``get_backend_http_urls`` when the
    caller wants to try fallback endpoints too.
    """
    return get_backend_http_urls()[0]
