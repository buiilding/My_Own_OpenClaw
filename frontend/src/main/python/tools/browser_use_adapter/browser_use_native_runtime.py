"""Optional Browser Use-native runtime provider factory.

This module is intentionally conservative in Phase 2:
- If `browser_use` is not installed, return `None`.
- If installed, return a dedicated provider class that currently delegates to
  controller-backed behavior and can be overridden action-by-action.

`runtime_provider.get_browser_runtime_provider(...)` handles fallback and strict
mode behavior.
"""

from __future__ import annotations

import inspect
from importlib.util import find_spec
import logging
import os
from typing import Any, Awaitable, Callable, Mapping

from tools.browser_use_adapter.runtime_provider import (
    BrowserRuntimeProvider,
    ControllerBackedRuntimeProvider,
)

logger = logging.getLogger(__name__)

ENV_NATIVE_ACTIONS = "WINDIE_BROWSER_USE_NATIVE_ACTIONS"
ENV_NATIVE_ACTIONS_STRICT = "WINDIE_BROWSER_USE_NATIVE_ACTIONS_STRICT"
NativeActionHandler = Callable[..., Awaitable[Any] | Any]


class BrowserUseNativeRuntimeProvider(ControllerBackedRuntimeProvider):
    """Phase 2 native-runtime placeholder provider.

    Behavior is controller-backed by default.
    Action-level Browser Use-native execution can be enabled incrementally via:

    - `WINDIE_BROWSER_USE_NATIVE_ACTIONS`: comma-separated action names
    - `WINDIE_BROWSER_USE_NATIVE_ACTIONS_STRICT`: fail when enabled action has
      no native handler (`1`, `true`, `yes`, `on`)
    """

    def __init__(
        self,
        controller: Any,
        *,
        native_handlers: Mapping[str, NativeActionHandler] | None = None,
    ):
        super().__init__(controller)
        self._native_handlers = dict(native_handlers or {})
        enabled = os.getenv(ENV_NATIVE_ACTIONS, "")
        self._native_actions = {
            token.strip().lower()
            for token in enabled.split(",")
            if token.strip()
        }
        strict_raw = os.getenv(ENV_NATIVE_ACTIONS_STRICT, "").strip().lower()
        self._native_strict = strict_raw in {"1", "true", "yes", "on"}

    async def _maybe_native_result(self, action: str, **kwargs: Any) -> Any | None:
        normalized = action.strip().lower()
        if normalized not in self._native_actions:
            return None

        handler = self._native_handlers.get(normalized)
        if handler is None:
            message = (
                f"Native runtime action '{normalized}' was requested but no "
                "native handler is configured."
            )
            if self._native_strict:
                raise RuntimeError(message)
            logger.warning("%s Falling back to controller-backed behavior.", message)
            return None

        result = handler(**kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def get_status(self) -> dict[str, Any]:
        native = await self._maybe_native_result("status")
        if isinstance(native, dict):
            return native
        return await super().get_status()

    async def navigate(self, *, url: str, wait_until: str) -> dict[str, Any]:
        native = await self._maybe_native_result(
            "navigate",
            url=url,
            wait_until=wait_until,
        )
        if isinstance(native, dict):
            return native
        return await super().navigate(url=url, wait_until=wait_until)

    async def open_tab(self, *, url: str) -> dict[str, Any]:
        native = await self._maybe_native_result("open", url=url)
        if isinstance(native, dict):
            return native
        return await super().open_tab(url=url)

    async def get_tabs(self) -> list[Any]:
        native = await self._maybe_native_result("get_tabs")
        if isinstance(native, list):
            return native
        return await super().get_tabs()

    async def switch_tab(self, target_id: str) -> bool:
        native = await self._maybe_native_result("switch_tab", target_id=target_id)
        if isinstance(native, bool):
            return native
        return await super().switch_tab(target_id)

    async def close(self) -> None:
        native = await self._maybe_native_result("close")
        if native is not None:
            return
        await super().close()


def create_browser_use_native_runtime_provider(
    controller: Any,
) -> BrowserRuntimeProvider | None:
    """Return Browser Use-native runtime provider when available.

    Phase 2 note: returned provider still delegates to controller-backed methods.
    """

    if find_spec("browser_use") is None:
        return None
    return BrowserUseNativeRuntimeProvider(controller)
