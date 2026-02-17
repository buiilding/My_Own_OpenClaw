"""Default Browser Use native-runtime handler registry.

Phase 2 ships an empty handler map by default; this keeps behavior stable while
allowing action-by-action native overrides via module-level registration.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

NativeActionHandler = Callable[..., Awaitable[Any] | Any]


def get_native_runtime_handlers() -> dict[str, NativeActionHandler]:
    """Return action->handler map for BrowserUseNativeRuntimeProvider.

    Supported action keys are runtime-layer names, for example:
    - connect_user_chrome
    - connect_managed
    - status
    - navigate
    - open
    - get_tabs
    - switch_tab
    - close
    - click
    - type
    - press
    - scroll
    - screenshot
    - wait
    - evaluate
    - snapshot
    - upload
    """

    return {}

