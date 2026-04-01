"""Shared canonical browser literals re-exported from the shared browser contract."""

from __future__ import annotations

from backend.src.tools.browser.shared_contract_loader import ensure_frontend_python_path

ensure_frontend_python_path()

from windie_shared.browser_contract import (  # noqa: E402
    BROWSER_CANONICAL_ACTIONS,
    BrowserCanonicalAction,
    BrowserCoreAction,
    BrowserMouseButton,
    BrowserNavigationState,
    BrowserScrollDirection,
    BrowserWaitState,
)

__all__ = [
    "BROWSER_CANONICAL_ACTIONS",
    "BrowserCanonicalAction",
    "BrowserCoreAction",
    "BrowserMouseButton",
    "BrowserNavigationState",
    "BrowserScrollDirection",
    "BrowserWaitState",
]
