"""Runtime-provider seam for Browser Use adapter internals.

Browser Use native runtime is mandatory for browser_control execution.
"""

from __future__ import annotations

import asyncio
from importlib import import_module
from importlib.util import find_spec
import os
from pathlib import Path
import sys
from typing import Any, Protocol

ENV_RUNTIME = "WINDIE_BROWSER_USE_RUNTIME"
_BROWSER_USE_RUNTIME_ALIASES = {"browser_use", "browser_use_native"}


def _is_within_path(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except Exception:
        return False


def _ensure_vendored_browser_use_on_path() -> Path:
    """Prefer and require the in-repo Browser Use package."""
    python_root = Path(__file__).resolve().parents[2]
    vendored_browser_use = python_root / "browser_use"
    if not vendored_browser_use.is_dir():
        raise RuntimeError(
            "Vendored Browser Use runtime is missing. "
            "Expected directory: frontend/src/main/python/browser_use"
        )
    root_path = str(python_root)
    try:
        existing_index = sys.path.index(root_path)
    except ValueError:
        sys.path.insert(0, root_path)
        return
    if existing_index != 0:
        sys.path.pop(existing_index)
        sys.path.insert(0, root_path)
    return vendored_browser_use


def _purge_non_vendored_browser_use_modules(vendored_browser_use: Path) -> None:
    for module_name, module in list(sys.modules.items()):
        if module_name != "browser_use" and not module_name.startswith("browser_use."):
            continue
        module_file = getattr(module, "__file__", None)
        if not isinstance(module_file, str) or not module_file.strip():
            continue
        if _is_within_path(Path(module_file), vendored_browser_use):
            continue
        del sys.modules[module_name]


def _assert_vendored_browser_use_resolves(vendored_browser_use: Path) -> None:
    _purge_non_vendored_browser_use_modules(vendored_browser_use)
    try:
        import browser_use  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            f"Failed to import vendored Browser Use runtime: {exc}"
        ) from exc

    module_file = getattr(browser_use, "__file__", None)
    if not isinstance(module_file, str) or not module_file.strip():
        raise RuntimeError(
            "Imported Browser Use module does not expose a filesystem path."
        )
    module_path = Path(module_file)
    if not _is_within_path(module_path, vendored_browser_use):
        raise RuntimeError(
            "Browser Use import resolved outside vendored runtime. "
            f"Resolved path: {module_file}"
        )


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
    async def execute_browser_use_action(
        self,
        *,
        action: str,
        params: dict[str, Any],
    ) -> dict[str, Any]: ...


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

    async def execute_browser_use_action(
        self,
        *,
        action: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        raise RuntimeError(
            f"Browser Use action '{action}' is unavailable in controller-backed runtime"
        )


def get_browser_runtime_provider(
    controller: ControllerRuntimeLike,
) -> BrowserRuntimeProvider:
    """Return the adapter runtime provider for current configuration.

    Runtime selection behavior:

    - default (unset `WINDIE_BROWSER_USE_RUNTIME`): `browser_use_native`
    - allowed explicit values: `browser_use`, `browser_use_native`
    - controller/legacy runtime aliases are no longer supported
    """

    vendored_browser_use = _ensure_vendored_browser_use_on_path()
    _assert_vendored_browser_use_resolves(vendored_browser_use)

    raw_requested = os.getenv(ENV_RUNTIME)
    if raw_requested is None:
        requested = "browser_use_native"
    else:
        requested = raw_requested.strip().lower()

    if requested not in _BROWSER_USE_RUNTIME_ALIASES:
        raise RuntimeError(
            f"Unknown browser runtime '{requested}'. "
            "Supported values: browser_use, browser_use_native."
        )

    if find_spec("browser_use") is None:
        raise RuntimeError("Vendored Browser Use runtime is unavailable.")

    try:
        runtime_module = import_module(
            "tools.browser_use_adapter.browser_use_native_runtime"
        )
        factory = getattr(
            runtime_module,
            "create_browser_use_native_runtime_provider",
            None,
        )
        if not callable(factory):
            raise RuntimeError("Browser Use native runtime factory is not configured.")
        native_provider = factory(controller)
        if native_provider is None:
            raise RuntimeError("Browser Use native runtime provider is unavailable.")
        return native_provider
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(
            f"Requested browser runtime '{requested}' is unavailable "
            f"(native provider load failed: {exc})."
        ) from exc
