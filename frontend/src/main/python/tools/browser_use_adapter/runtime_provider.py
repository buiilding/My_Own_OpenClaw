"""Runtime-provider seam for Browser Use adapter internals.

Phase 2 keeps behavior controller-backed by default while introducing an
adapter-owned runtime interface that can later be replaced action-by-action
with Browser Use-native execution.
"""

from __future__ import annotations

import asyncio
from importlib import import_module
from importlib.util import find_spec
import logging
import os
from typing import Any, Protocol

logger = logging.getLogger(__name__)

ENV_RUNTIME = "WINDIE_BROWSER_USE_RUNTIME"
ENV_RUNTIME_STRICT = "WINDIE_BROWSER_USE_RUNTIME_STRICT"
_CONTROLLER_RUNTIME_ALIASES = {"", "controller", "legacy_controller"}
_BROWSER_USE_RUNTIME_ALIASES = {"browser_use", "browser_use_native"}


class ControllerRuntimeLike(Protocol):
    is_connected: bool

    async def close(self) -> None: ...
    async def auto_connect_to_chrome(self, *, cdp_url: str, auto_launch: bool) -> dict[str, Any]: ...
    async def launch_managed_browser(
        self,
        *,
        headless: bool,
        executable_path: str | None,
    ) -> dict[str, Any]: ...
    async def get_status(self) -> dict[str, Any]: ...
    async def navigate(self, url: str, wait_until: str) -> dict[str, Any]: ...
    async def open_tab(self, *, url: str) -> dict[str, Any]: ...
    async def get_tabs(self) -> list[Any]: ...
    async def switch_tab(self, target_id: str) -> bool: ...
    async def click(
        self,
        *,
        ref: str,
        double_click: bool,
        button: str,
    ) -> dict[str, Any]: ...
    async def type_text(
        self,
        *,
        ref: str,
        text: str,
        submit: bool,
        clear_first: bool,
    ) -> dict[str, Any]: ...
    async def press_key(self, key: str) -> dict[str, Any]: ...
    async def scroll(self, direction: str, amount: int) -> dict[str, Any]: ...
    async def screenshot(
        self,
        *,
        full_page: bool,
        ref: str | None,
        element: str | None,
        image_type: str,
        quality: int | None,
    ) -> bytes: ...
    async def wait_for_load(self, state: str) -> dict[str, Any]: ...
    async def evaluate(self, script: str) -> dict[str, Any]: ...
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
    ) -> Any: ...
    async def set_input_files(
        self,
        *,
        ref: str,
        paths: list[str],
    ) -> dict[str, Any]: ...


class BrowserRuntimeProvider(Protocol):
    @property
    def is_connected(self) -> bool: ...

    async def close(self) -> None: ...
    async def connect_user_chrome(self, *, cdp_url: str, auto_launch: bool) -> dict[str, Any]: ...
    async def connect_managed(
        self,
        *,
        headless: bool,
        executable_path: str | None,
    ) -> dict[str, Any]: ...
    async def get_status(self) -> dict[str, Any]: ...
    async def navigate(self, *, url: str, wait_until: str) -> dict[str, Any]: ...
    async def open_tab(self, *, url: str) -> dict[str, Any]: ...
    async def get_tabs(self) -> list[Any]: ...
    async def switch_tab(self, target_id: str) -> bool: ...
    async def click(
        self,
        *,
        ref: str,
        double_click: bool,
        button: str,
    ) -> dict[str, Any]: ...
    async def type_text(
        self,
        *,
        ref: str,
        text: str,
        submit: bool,
        clear_first: bool,
    ) -> dict[str, Any]: ...
    async def press_key(self, key: str) -> dict[str, Any]: ...
    async def scroll(self, *, direction: str, amount: int) -> dict[str, Any]: ...
    async def screenshot(
        self,
        *,
        full_page: bool,
        ref: str | None,
        element: str | None,
        image_type: str,
        quality: int | None,
    ) -> bytes: ...
    async def wait_for_load(self, *, state: str) -> dict[str, Any]: ...
    async def wait_seconds(self, *, seconds: float) -> dict[str, Any]: ...
    async def evaluate(self, *, script: str) -> dict[str, Any]: ...
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
    ) -> Any: ...
    async def set_input_files(self, *, ref: str, paths: list[str]) -> dict[str, Any]: ...


class ControllerBackedRuntimeProvider:
    """Default Phase 2 runtime provider backed by BrowserController."""

    def __init__(self, controller: ControllerRuntimeLike):
        self._controller = controller

    @property
    def is_connected(self) -> bool:
        return bool(self._controller.is_connected)

    async def close(self) -> None:
        await self._controller.close()

    async def connect_user_chrome(
        self,
        *,
        cdp_url: str,
        auto_launch: bool,
    ) -> dict[str, Any]:
        return await self._controller.auto_connect_to_chrome(
            cdp_url=cdp_url,
            auto_launch=auto_launch,
        )

    async def connect_managed(
        self,
        *,
        headless: bool,
        executable_path: str | None,
    ) -> dict[str, Any]:
        return await self._controller.launch_managed_browser(
            headless=headless,
            executable_path=executable_path,
        )

    async def get_status(self) -> dict[str, Any]:
        return await self._controller.get_status()

    async def navigate(self, *, url: str, wait_until: str) -> dict[str, Any]:
        return await self._controller.navigate(url, wait_until)

    async def open_tab(self, *, url: str) -> dict[str, Any]:
        return await self._controller.open_tab(url=url)

    async def get_tabs(self) -> list[Any]:
        return await self._controller.get_tabs()

    async def switch_tab(self, target_id: str) -> bool:
        return await self._controller.switch_tab(target_id)

    async def click(
        self,
        *,
        ref: str,
        double_click: bool,
        button: str,
    ) -> dict[str, Any]:
        return await self._controller.click(
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
        return await self._controller.type_text(
            ref=ref,
            text=text,
            submit=submit,
            clear_first=clear_first,
        )

    async def press_key(self, key: str) -> dict[str, Any]:
        return await self._controller.press_key(key)

    async def scroll(self, *, direction: str, amount: int) -> dict[str, Any]:
        return await self._controller.scroll(direction, amount)

    async def screenshot(
        self,
        *,
        full_page: bool,
        ref: str | None,
        element: str | None,
        image_type: str,
        quality: int | None,
    ) -> bytes:
        return await self._controller.screenshot(
            full_page=full_page,
            ref=ref,
            element=element,
            image_type=image_type,
            quality=quality,
        )

    async def wait_for_load(self, *, state: str) -> dict[str, Any]:
        return await self._controller.wait_for_load(state)

    async def wait_seconds(self, *, seconds: float) -> dict[str, Any]:
        await asyncio.sleep(max(0.0, float(seconds)))
        return {"success": True}

    async def evaluate(self, *, script: str) -> dict[str, Any]:
        return await self._controller.evaluate(script)

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
        return await self._controller.get_page_snapshot(
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
        return await self._controller.set_input_files(
            ref=ref,
            paths=paths,
        )


def get_browser_runtime_provider(
    controller: ControllerRuntimeLike,
) -> BrowserRuntimeProvider:
    """Return the adapter runtime provider for current configuration.

    Runtime selection behavior:

    - default (unset `WINDIE_BROWSER_USE_RUNTIME`):
      `browser_use_native` when `browser_use` is installed, otherwise controller
    - `browser_use` / `browser_use_native`: try Browser Use runtime provider
      module and fall back to controller provider if unavailable
    - strict mode (`WINDIE_BROWSER_USE_RUNTIME_STRICT=1`): unavailable requested
      runtimes raise `RuntimeError` instead of falling back
    """

    raw_requested = os.getenv(ENV_RUNTIME)
    if raw_requested is None:
        requested = (
            "browser_use_native"
            if find_spec("browser_use") is not None
            else "controller"
        )
    else:
        requested = raw_requested.strip().lower()
    strict_raw = os.getenv(ENV_RUNTIME_STRICT, "").strip().lower()
    strict = strict_raw in {"1", "true", "yes", "on"}

    if requested in _CONTROLLER_RUNTIME_ALIASES:
        return ControllerBackedRuntimeProvider(controller)

    if requested in _BROWSER_USE_RUNTIME_ALIASES:
        try:
            runtime_module = import_module(
                "tools.browser_use_adapter.browser_use_native_runtime"
            )
            factory = getattr(
                runtime_module,
                "create_browser_use_native_runtime_provider",
                None,
            )
            if callable(factory):
                native_provider = factory(controller)
                if native_provider is not None:
                    return native_provider
        except Exception as exc:
            message = (
                f"Requested browser runtime '{requested}' is unavailable "
                f"(native provider load failed: {exc})."
            )
            if strict:
                raise RuntimeError(message) from exc
            logger.warning("%s Falling back to controller-backed runtime.", message)
            return ControllerBackedRuntimeProvider(controller)

        message = (
            f"Requested browser runtime '{requested}' is unavailable "
            "(native provider not configured)."
        )
        if strict:
            raise RuntimeError(message)
        logger.warning("%s Falling back to controller-backed runtime.", message)
        return ControllerBackedRuntimeProvider(controller)

    message = (
        f"Unknown browser runtime '{requested}'. "
        f"Supported values: controller, browser_use."
    )
    if strict:
        raise RuntimeError(message)
    logger.warning("%s Falling back to controller-backed runtime.", message)
    return ControllerBackedRuntimeProvider(controller)
