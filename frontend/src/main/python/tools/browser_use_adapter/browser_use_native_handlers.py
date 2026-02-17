"""Default Browser Use native-runtime handler registry.

Phase 2 keeps controller-backed behavior as fallback, but ships a minimal native
action path for `wait(seconds=...)` when Browser Use is available.
"""

from __future__ import annotations

import inspect
from importlib import import_module
import logging
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

NativeActionHandler = Callable[..., Awaitable[Any] | Any]


def _build_browser_use_wait_seconds_handler() -> NativeActionHandler | None:
    """Create a handler that executes Browser Use's native `wait` action."""

    try:
        service_module = import_module("browser_use.tools.service")
        tools_type = getattr(service_module, "Tools", None)
        if not inspect.isclass(tools_type):
            return None
        tools_instance = tools_type()
        registry = getattr(tools_instance, "registry", None)
        execute_action = getattr(registry, "execute_action", None)
        if not callable(execute_action):
            return None
    except Exception as exc:
        logger.debug("Browser Use wait handler unavailable: %s", exc)
        return None

    async def _wait_seconds_handler(*, seconds: float) -> dict[str, Any]:
        requested_seconds = max(0.0, float(seconds))
        # Browser Use wait action expects integer seconds.
        wait_seconds = max(0, int(round(requested_seconds)))
        try:
            result = execute_action(
                "wait",
                {"seconds": wait_seconds},
                browser_session=None,
            )
            if inspect.isawaitable(result):
                await result
        except Exception as exc:
            return {
                "success": False,
                "error": f"Browser Use native wait failed: {exc}",
            }
        return {
            "success": True,
            "seconds": requested_seconds,
            "native_source": "browser_use.tools.wait",
        }

    return _wait_seconds_handler


def get_native_runtime_handlers(controller: Any | None = None) -> dict[str, NativeActionHandler]:
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
    - wait_seconds
    - evaluate
    - snapshot
    - upload
    """
    del controller  # reserved for future handler sets that need controller context.

    handlers: dict[str, NativeActionHandler] = {}
    wait_handler = _build_browser_use_wait_seconds_handler()
    if wait_handler is not None:
        handlers["wait_seconds"] = wait_handler

    return handlers
