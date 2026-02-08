"""
Shared backend endpoint configuration for the Python sidecar.
"""

import os

DEFAULT_BACKEND_HTTP_URL = "http://127.0.0.1:8765"


def get_backend_http_url() -> str:
    """
    Resolve backend HTTP URL used by sidecar memory clients.

    Resolution order:
    1. WINDIE_BACKEND_HTTP_URL (set by Electron main process)
    2. BACKEND_HTTP_URL
    3. default localhost URL
    """
    value = (
        os.getenv("WINDIE_BACKEND_HTTP_URL")
        or os.getenv("BACKEND_HTTP_URL")
        or DEFAULT_BACKEND_HTTP_URL
    )
    return value.rstrip("/")
