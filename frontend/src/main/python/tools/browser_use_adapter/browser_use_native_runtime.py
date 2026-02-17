"""Browser Use-native runtime provider factory.

Browser Use action names are executed strictly via native handlers.
Controller-backed methods are retained for non-Browser-Use compatibility actions.
"""

from __future__ import annotations

import inspect
from importlib import import_module
from importlib.util import find_spec
import os
from typing import Any, Awaitable, Callable, Mapping

from tools.browser_use_adapter.runtime_provider import (
    BrowserRuntimeProvider,
    ControllerBackedRuntimeProvider,
)

ENV_NATIVE_HANDLER_MODULE = "WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE"
DEFAULT_NATIVE_HANDLER_MODULE = "tools.browser_use_adapter.browser_use_native_handlers"
NativeActionHandler = Callable[..., Awaitable[Any] | Any]


class BrowserUseNativeRuntimeProvider(ControllerBackedRuntimeProvider):
    """Runtime provider with strict Browser Use native action execution."""

    def __init__(
        self,
        controller: Any,
        *,
        native_handlers: Mapping[str, NativeActionHandler] | None = None,
    ):
        super().__init__(controller)
        self._native_handlers = dict(native_handlers or {})

    async def execute_browser_use_action(
        self,
        *,
        action: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        normalized = action.strip().lower()
        handler = self._native_handlers.get(normalized)
        if handler is None:
            raise RuntimeError(
                f"No Browser Use native handler configured for action '{normalized}'"
            )
        result = handler(**dict(params))
        if inspect.isawaitable(result):
            result = await result
        if isinstance(result, dict):
            return result
        return {
            "success": True,
            "action": normalized,
            "result": result,
            "native_source": "browser_use.tools",
        }


def _load_native_handlers(controller: Any) -> dict[str, NativeActionHandler]:
    module_name = os.getenv(
        ENV_NATIVE_HANDLER_MODULE,
        DEFAULT_NATIVE_HANDLER_MODULE,
    ).strip()
    if not module_name:
        raise RuntimeError(
            "Native handler module is not configured. Set WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE."
        )
    try:
        module = import_module(module_name)
    except Exception as exc:
        raise RuntimeError(
            f"Native handler module '{module_name}' failed to load: {exc}"
        ) from exc

    factory = getattr(module, "get_native_runtime_handlers", None)
    if not callable(factory):
        raise RuntimeError(
            f"Native handler module '{module_name}' does not expose get_native_runtime_handlers()."
        )

    try:
        factory_signature = inspect.signature(factory)
        if factory_signature.parameters:
            handlers = factory(controller=controller)
        else:
            handlers = factory()
    except Exception as exc:
        raise RuntimeError(
            f"Native handler module '{module_name}' handler factory failed: {exc}"
        ) from exc

    if not isinstance(handlers, Mapping):
        raise RuntimeError(
            f"Native handler module '{module_name}' returned non-mapping handlers."
        )

    normalized: dict[str, NativeActionHandler] = {}
    for action, handler in handlers.items():
        if not isinstance(action, str):
            continue
        action_key = action.strip().lower()
        if not action_key or not callable(handler):
            continue
        normalized[action_key] = handler
    if not normalized:
        raise RuntimeError(
            f"Native handler module '{module_name}' did not return any callable handlers."
        )
    return normalized


def create_browser_use_native_runtime_provider(
    controller: Any,
) -> BrowserRuntimeProvider | None:
    """Return Browser Use-native runtime provider when available.

    Browser Use package availability is required by runtime_provider selection.
    """

    if find_spec("browser_use") is None:
        return None
    native_handlers = _load_native_handlers(controller)
    return BrowserUseNativeRuntimeProvider(
        controller,
        native_handlers=native_handlers,
    )
