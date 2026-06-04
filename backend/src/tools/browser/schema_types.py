"""Shared canonical browser literals re-exported from the shared browser contract."""

from __future__ import annotations

from backend.src.tools.browser.shared_contract_loader import (
    load_shared_browser_contract,
)

__all__ = [
    "BROWSER_CANONICAL_ACTIONS",
    "BrowserCanonicalAction",
    "BrowserMouseButton",
    "BrowserScrollDirection",
]

_browser_contract = load_shared_browser_contract()
for _name in __all__:
    globals()[_name] = getattr(_browser_contract, _name)
del _browser_contract, _name
