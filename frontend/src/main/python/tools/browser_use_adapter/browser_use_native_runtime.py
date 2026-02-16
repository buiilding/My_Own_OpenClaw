"""Optional Browser Use-native runtime provider factory.

This module is intentionally conservative in Phase 2:
- If `browser_use` is not installed, return `None`.
- If installed, return a dedicated provider class that currently delegates to
  controller-backed behavior and can be overridden action-by-action.

`runtime_provider.get_browser_runtime_provider(...)` handles fallback and strict
mode behavior.
"""

from __future__ import annotations

from importlib.util import find_spec
from typing import Any

from tools.browser_use_adapter.runtime_provider import (
    BrowserRuntimeProvider,
    ControllerBackedRuntimeProvider,
)


class BrowserUseNativeRuntimeProvider(ControllerBackedRuntimeProvider):
    """Phase 2 native-runtime placeholder provider.

    Behavior is currently inherited from controller-backed provider. Action-level
    Browser Use-native execution can be introduced here incrementally.
    """


def create_browser_use_native_runtime_provider(
    controller: Any,
) -> BrowserRuntimeProvider | None:
    """Return Browser Use-native runtime provider when available.

    Phase 2 note: returned provider still delegates to controller-backed methods.
    """

    if find_spec("browser_use") is None:
        return None
    return BrowserUseNativeRuntimeProvider(controller)
