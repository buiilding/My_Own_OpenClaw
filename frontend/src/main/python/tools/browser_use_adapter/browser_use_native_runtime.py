"""Optional Browser Use-native runtime provider factory.

This module is intentionally conservative in Phase 2:
- If `browser_use` is not installed, return `None`.
- If installed, return `None` until action-level native wiring is implemented.

`runtime_provider.get_browser_runtime_provider(...)` handles fallback and strict
mode behavior.
"""

from __future__ import annotations

from importlib.util import find_spec
from typing import Any

from tools.browser_use_adapter.runtime_provider import BrowserRuntimeProvider


def create_browser_use_native_runtime_provider(
    _controller: Any,
) -> BrowserRuntimeProvider | None:
    """Return Browser Use-native runtime provider when available.

    Phase 2 note: returns `None` even when `browser_use` is present because
    native action wiring is not yet implemented.
    """

    if find_spec("browser_use") is None:
        return None
    return None

