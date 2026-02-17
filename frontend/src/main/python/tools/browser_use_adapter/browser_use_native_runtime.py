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
from importlib import import_module
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
ENV_NATIVE_HANDLER_MODULE = "WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE"
DEFAULT_NATIVE_HANDLER_MODULE = "tools.browser_use_adapter.browser_use_native_handlers"
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

    async def connect_user_chrome(
        self,
        *,
        cdp_url: str,
        auto_launch: bool,
    ) -> dict[str, Any]:
        native = await self._maybe_native_result(
            "connect_user_chrome",
            cdp_url=cdp_url,
            auto_launch=auto_launch,
        )
        if isinstance(native, dict):
            return native
        return await super().connect_user_chrome(
            cdp_url=cdp_url,
            auto_launch=auto_launch,
        )

    async def connect_managed(
        self,
        *,
        headless: bool,
        executable_path: str | None,
    ) -> dict[str, Any]:
        native = await self._maybe_native_result(
            "connect_managed",
            headless=headless,
            executable_path=executable_path,
        )
        if isinstance(native, dict):
            return native
        return await super().connect_managed(
            headless=headless,
            executable_path=executable_path,
        )

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

    async def click(
        self,
        *,
        ref: str,
        double_click: bool,
        button: str,
    ) -> dict[str, Any]:
        native = await self._maybe_native_result(
            "click",
            ref=ref,
            double_click=double_click,
            button=button,
        )
        if isinstance(native, dict):
            return native
        return await super().click(
            ref=ref,
            double_click=double_click,
            button=button,
        )

    async def type_text(
        self,
        *,
        ref: str,
        text: str,
        submit: bool,
        clear_first: bool,
    ) -> dict[str, Any]:
        native = await self._maybe_native_result(
            "type",
            ref=ref,
            text=text,
            submit=submit,
            clear_first=clear_first,
        )
        if isinstance(native, dict):
            return native
        return await super().type_text(
            ref=ref,
            text=text,
            submit=submit,
            clear_first=clear_first,
        )

    async def press_key(self, key: str) -> dict[str, Any]:
        native = await self._maybe_native_result("press", key=key)
        if isinstance(native, dict):
            return native
        return await super().press_key(key)

    async def scroll(self, *, direction: str, amount: int) -> dict[str, Any]:
        native = await self._maybe_native_result(
            "scroll",
            direction=direction,
            amount=amount,
        )
        if isinstance(native, dict):
            return native
        return await super().scroll(direction=direction, amount=amount)

    async def screenshot(
        self,
        *,
        full_page: bool,
        ref: str | None,
        element: str | None,
        image_type: str,
        quality: int | None,
    ) -> bytes:
        native = await self._maybe_native_result(
            "screenshot",
            full_page=full_page,
            ref=ref,
            element=element,
            image_type=image_type,
            quality=quality,
        )
        if isinstance(native, (bytes, bytearray)):
            return bytes(native)
        return await super().screenshot(
            full_page=full_page,
            ref=ref,
            element=element,
            image_type=image_type,
            quality=quality,
        )

    async def wait_for_load(self, *, state: str) -> dict[str, Any]:
        native = await self._maybe_native_result("wait", state=state)
        if isinstance(native, dict):
            return native
        return await super().wait_for_load(state=state)

    async def evaluate(self, *, script: str) -> dict[str, Any]:
        native = await self._maybe_native_result("evaluate", script=script)
        if isinstance(native, dict):
            return native
        return await super().evaluate(script=script)

    async def get_page_snapshot(
        self,
        *,
        format_type: str,
        max_chars: int | None = None,
        refs_mode: str | None = None,
        interactive: bool | None = None,
        compact: bool | None = None,
        depth: int | None = None,
        selector: str | None = None,
        frame_selector: str | None = None,
    ) -> Any:
        native = await self._maybe_native_result(
            "snapshot",
            format_type=format_type,
            max_chars=max_chars,
            refs_mode=refs_mode,
            interactive=interactive,
            compact=compact,
            depth=depth,
            selector=selector,
            frame_selector=frame_selector,
        )
        if native is not None:
            return native
        return await super().get_page_snapshot(
            format_type=format_type,
            max_chars=max_chars,
            refs_mode=refs_mode,
            interactive=interactive,
            compact=compact,
            depth=depth,
            selector=selector,
            frame_selector=frame_selector,
        )

    async def set_input_files(self, *, ref: str, paths: list[str]) -> dict[str, Any]:
        native = await self._maybe_native_result("upload", ref=ref, paths=paths)
        if isinstance(native, dict):
            return native
        return await super().set_input_files(ref=ref, paths=paths)


def _load_native_handlers() -> dict[str, NativeActionHandler]:
    module_name = os.getenv(
        ENV_NATIVE_HANDLER_MODULE,
        DEFAULT_NATIVE_HANDLER_MODULE,
    ).strip()
    if not module_name:
        return {}
    try:
        module = import_module(module_name)
    except Exception as exc:
        logger.warning(
            "Native handler module '%s' failed to load: %s. "
            "Proceeding with controller-backed fallbacks.",
            module_name,
            exc,
        )
        return {}

    factory = getattr(module, "get_native_runtime_handlers", None)
    if not callable(factory):
        logger.warning(
            "Native handler module '%s' does not expose get_native_runtime_handlers(). "
            "Proceeding with controller-backed fallbacks.",
            module_name,
        )
        return {}

    try:
        handlers = factory()
    except Exception as exc:
        logger.warning(
            "Native handler module '%s' handler factory failed: %s. "
            "Proceeding with controller-backed fallbacks.",
            module_name,
            exc,
        )
        return {}

    if not isinstance(handlers, Mapping):
        logger.warning(
            "Native handler module '%s' returned non-mapping handlers. "
            "Proceeding with controller-backed fallbacks.",
            module_name,
        )
        return {}

    normalized: dict[str, NativeActionHandler] = {}
    for action, handler in handlers.items():
        if not isinstance(action, str):
            continue
        action_key = action.strip().lower()
        if not action_key or not callable(handler):
            continue
        normalized[action_key] = handler
    return normalized


def create_browser_use_native_runtime_provider(
    controller: Any,
) -> BrowserRuntimeProvider | None:
    """Return Browser Use-native runtime provider when available.

    Phase 2 note: returned provider still delegates to controller-backed methods.
    """

    if find_spec("browser_use") is None:
        return None
    native_handlers = _load_native_handlers()
    return BrowserUseNativeRuntimeProvider(
        controller,
        native_handlers=native_handlers,
    )
