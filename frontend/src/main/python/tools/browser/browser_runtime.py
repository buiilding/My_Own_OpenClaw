"""Browser Use runtime provider + native handler bridge for WindieOS browser tool."""

from __future__ import annotations

import asyncio
import inspect
from importlib import import_module
from importlib.util import find_spec
import logging
import os
from pathlib import Path
import sys
from typing import Any, Awaitable, Callable, Mapping, Protocol

from tools.browser.browser_runtime_extraction import (
    build_windie_extraction_llm,
    resolve_windie_extraction_target,
)

logger = logging.getLogger(__name__)

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
    browser_tools_root = Path(__file__).resolve().parent
    vendored_browser_use = browser_tools_root / "browser_use"
    if not vendored_browser_use.is_dir():
        raise RuntimeError(
            "Vendored Browser Use runtime is missing. "
            "Expected directory: frontend/src/main/python/tools/browser/browser_use"
        )
    root_path = str(browser_tools_root)
    try:
        existing_index = sys.path.index(root_path)
    except ValueError:
        sys.path.insert(0, root_path)
        return vendored_browser_use
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
    *,
    find_spec_fn: Callable[[str], Any] = find_spec,
    import_module_fn: Callable[[str], Any] = import_module,
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

    if find_spec_fn("browser_use") is None:
        raise RuntimeError("Vendored Browser Use runtime is unavailable.")

    try:
        native_provider = create_browser_use_native_runtime_provider(
            controller,
            find_spec_fn=find_spec_fn,
            import_module_fn=import_module_fn,
        )
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


NativeActionHandler = Callable[..., Awaitable[Any] | Any]
DEFAULT_CDP_URL = "http://127.0.0.1:9333"
DEFAULT_FILESYSTEM_DIR = Path.home() / ".config" / "desktop-assistant" / "browser-use"
DEFAULT_EXTRACTION_MODEL_ENV = "WINDIE_BROWSER_USE_EXTRACTION_MODEL"
DEFAULT_EXTRACTION_PROVIDER_ENV = "WINDIE_BROWSER_USE_EXTRACTION_PROVIDER"
DEFAULT_EXTRACTION_MODEL_ID_ENV = "WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID"
DEFAULT_EXTRACTION_API_KEY_ENV = "WINDIE_BROWSER_USE_EXTRACTION_API_KEY"
DEFAULT_EXTRACTION_BASE_URL_ENV = "WINDIE_BROWSER_USE_EXTRACTION_BASE_URL"
DEFAULT_SNAPSHOT_PAGE_LIMIT = 4_000
MAX_SNAPSHOT_WINDOW_CHARS = 120_000

_BROWSER_REQUIRED_ACTIONS = frozenset(
    {
        "search",
        "navigate",
        "go_back",
        "wait",
        "click",
        "input",
        "upload_file",
        "switch",
        "close",
        "extract",
        "search_page",
        "find_elements",
        "scroll",
        "send_keys",
        "find_text",
        "screenshot",
        "dropdown_options",
        "select_dropdown",
        "evaluate",
        "read_long_content",
    }
)
_FILESYSTEM_REQUIRED_ACTIONS = frozenset(
    {"done", "write_file", "replace_file", "read_file", "extract"}
)
_BROWSER_USE_ACTIONS = (
    "done",
    "search",
    "navigate",
    "go_back",
    "wait",
    "click",
    "input",
    "upload_file",
    "switch",
    "close",
    "extract",
    "search_page",
    "find_elements",
    "scroll",
    "send_keys",
    "find_text",
    "screenshot",
    "dropdown_options",
    "select_dropdown",
    "write_file",
    "replace_file",
    "read_file",
    "read_long_content",
    "evaluate",
)


class _BrowserUseActionBridge:
    """Thin bridge around Browser Use `Tools` action execution."""

    def __init__(
        self,
        controller: Any | None = None,
        *,
        import_module_fn: Callable[[str], Any] = import_module,
    ):
        self._controller = controller
        self._import_module = import_module_fn
        self._tools: Any | None = None
        self._execute_action: Any | None = None
        self._file_system_type: Any | None = None
        self._browser_session_type: Any | None = None
        self._browser_session: Any | None = None
        self._file_system: Any | None = None
        self._session_mode: str | None = None
        self._session_cdp_url: str | None = None
        self._page_extraction_llm: Any | None = None
        self._lock = asyncio.Lock()

    def _ensure_browser_use_modules(self) -> None:
        if self._execute_action is not None:
            return

        service_module = self._import_module("browser_use.tools.service")
        tools_type = getattr(service_module, "Tools", None)
        if not inspect.isclass(tools_type):
            raise RuntimeError("browser_use.tools.service.Tools is unavailable")

        tools_instance = tools_type()
        set_coordinate_clicking = getattr(tools_instance, "set_coordinate_clicking", None)
        if callable(set_coordinate_clicking):
            set_coordinate_clicking(True)
        registry = getattr(tools_instance, "registry", None)
        execute_action = getattr(registry, "execute_action", None)
        if not callable(execute_action):
            raise RuntimeError("Browser Use action registry execute_action is unavailable")

        browser_module = self._import_module("browser_use.browser")
        browser_session_type = getattr(browser_module, "BrowserSession", None)
        if not inspect.isclass(browser_session_type):
            raise RuntimeError("browser_use.browser.BrowserSession is unavailable")

        fs_module = self._import_module("browser_use.filesystem.file_system")
        file_system_type = getattr(fs_module, "FileSystem", None)
        if not inspect.isclass(file_system_type):
            raise RuntimeError("browser_use.filesystem.file_system.FileSystem is unavailable")

        self._tools = tools_instance
        self._execute_action = execute_action
        self._browser_session_type = browser_session_type
        self._file_system_type = file_system_type

    async def _stop_browser_session(self) -> None:
        session = self._browser_session
        self._browser_session = None
        self._session_mode = None
        self._session_cdp_url = None
        if session is None:
            return
        stop = getattr(session, "stop", None)
        if not callable(stop):
            return
        try:
            maybe = stop()
            if inspect.isawaitable(maybe):
                await maybe
        except Exception as exc:
            logger.debug("Ignoring Browser Use session stop failure: %s", exc)

    def _controller_mode(self) -> str | None:
        mode_raw = getattr(self._controller, "_mode", None)
        if not isinstance(mode_raw, str):
            return None
        mode = mode_raw.strip().lower()
        if mode in {"user_chrome", "managed"}:
            return mode
        return None

    def _controller_cdp_url(self) -> str | None:
        cdp_raw = getattr(self._controller, "_cdp_url", None)
        if not isinstance(cdp_raw, str):
            return None
        cdp = cdp_raw.strip()
        return cdp or None

    async def _ensure_browser_session(self) -> Any:
        self._ensure_browser_use_modules()

        controller_connected = bool(getattr(self._controller, "is_connected", False))
        mode = self._controller_mode()
        cdp_url = self._controller_cdp_url()

        if not controller_connected:
            await self._stop_browser_session()
            raise RuntimeError(
                "Browser is not connected. Run browser connect first."
            )

        if mode == "user_chrome":
            desired_cdp_url = (
                cdp_url
                or os.getenv("WINDIE_BROWSER_USE_CDP_URL", DEFAULT_CDP_URL).strip()
                or DEFAULT_CDP_URL
            )
            should_reuse = (
                self._browser_session is not None
                and self._session_mode == "user_chrome"
                and self._session_cdp_url == desired_cdp_url
            )
            if should_reuse:
                return self._browser_session

            await self._stop_browser_session()
            session = self._browser_session_type(cdp_url=desired_cdp_url)
            await session.start()
            self._browser_session = session
            self._session_mode = "user_chrome"
            self._session_cdp_url = desired_cdp_url
            return session

        if mode == "managed":
            if self._browser_session is not None and self._session_mode == "managed":
                return self._browser_session

            await self._stop_browser_session()
            session = self._browser_session_type(is_local=True, headless=False)
            await session.start()
            self._browser_session = session
            self._session_mode = "managed"
            self._session_cdp_url = None
            return session

        await self._stop_browser_session()
        raise RuntimeError("Unable to infer Browser Use session mode from controller")

    def _ensure_file_system(self) -> Any:
        self._ensure_browser_use_modules()
        if self._file_system is not None:
            return self._file_system

        base_dir_env = os.getenv("WINDIE_BROWSER_USE_FILES_DIR")
        if isinstance(base_dir_env, str) and base_dir_env.strip():
            base_dir = Path(base_dir_env.strip()).expanduser()
        else:
            base_dir = DEFAULT_FILESYSTEM_DIR
        self._file_system = self._file_system_type(str(base_dir), create_default_files=True)
        return self._file_system

    def _build_windie_extraction_llm(self) -> tuple[Any | None, str | None]:
        provider_name, model_id, api_key, base_url = resolve_windie_extraction_target(
            self._import_module,
            provider_env=DEFAULT_EXTRACTION_PROVIDER_ENV,
            model_id_env=DEFAULT_EXTRACTION_MODEL_ID_ENV,
            api_key_env=DEFAULT_EXTRACTION_API_KEY_ENV,
            base_url_env=DEFAULT_EXTRACTION_BASE_URL_ENV,
        )
        return build_windie_extraction_llm(
            self._import_module,
            provider_name=provider_name,
            model_id=model_id,
            api_key=api_key,
            base_url=base_url,
        )

    def _ensure_page_extraction_llm(self) -> Any:
        if self._page_extraction_llm is not None:
            return self._page_extraction_llm

        model_name_raw = os.getenv(DEFAULT_EXTRACTION_MODEL_ENV, "")
        model_name = model_name_raw.strip()
        if model_name:
            llm_models_module = self._import_module("browser_use.llm.models")
            get_llm_by_name = getattr(llm_models_module, "get_llm_by_name", None)
            if not callable(get_llm_by_name):
                raise RuntimeError("browser_use.llm.models.get_llm_by_name is unavailable")
            llm = get_llm_by_name(model_name)
            self._page_extraction_llm = llm
            return llm

        windie_llm, windie_resolution_error = self._build_windie_extraction_llm()
        if windie_llm is not None:
            self._page_extraction_llm = windie_llm
            return windie_llm

        error_suffix = (
            f" {windie_resolution_error}" if isinstance(windie_resolution_error, str) else ""
        )
        raise RuntimeError(
            "Browser Use extraction actions require a native page_extraction_llm. "
            "Configure WindieOS extraction settings via "
            f"{DEFAULT_EXTRACTION_PROVIDER_ENV}/{DEFAULT_EXTRACTION_MODEL_ID_ENV} "
            "(optionally with "
            f"{DEFAULT_EXTRACTION_API_KEY_ENV}/{DEFAULT_EXTRACTION_BASE_URL_ENV}), "
            "or set "
            f"{DEFAULT_EXTRACTION_MODEL_ENV} to a Browser Use model name "
            "(for example: openai_gpt_4o_mini)."
            f"{error_suffix}"
        )

    @staticmethod
    def _normalize_action_result(action_name: str, result: Any) -> dict[str, Any]:
        if isinstance(result, Mapping):
            payload = dict(result)
        elif hasattr(result, "model_dump"):
            payload = result.model_dump(exclude_none=True)
        else:
            payload = {"result": result}

        error = payload.get("error")
        success = not (isinstance(error, str) and error.strip())
        normalized: dict[str, Any] = {
            "success": success,
            "action": action_name,
            "native_source": "browser_use.tools",
        }
        if isinstance(error, str) and error.strip():
            normalized["error"] = error.strip()

        for key in (
            "extracted_content",
            "long_term_memory",
            "metadata",
            "attachments",
            "images",
            "is_done",
        ):
            value = payload.get(key)
            if value is not None:
                normalized[key] = value

        # Browser Use `ActionResult.success` is meaningful for `done`.
        if payload.get("is_done") is True and payload.get("success") is not None:
            normalized["done_success"] = payload.get("success")

        if not success and "error" not in normalized:
            normalized["error"] = f"Browser Use action '{action_name}' failed"

        return normalized

    async def execute_action(
        self,
        action_name: str,
        params: Mapping[str, Any],
    ) -> dict[str, Any]:
        self._ensure_browser_use_modules()

        normalized_action = action_name.strip().lower()
        if normalized_action not in _BROWSER_USE_ACTIONS:
            return {
                "success": False,
                "action": normalized_action,
                "error": f"Unsupported Browser Use action: {normalized_action}",
            }

        async with self._lock:
            needs_browser = normalized_action in _BROWSER_REQUIRED_ACTIONS
            needs_file_system = normalized_action in _FILESYSTEM_REQUIRED_ACTIONS

            try:
                browser_session = (
                    await self._ensure_browser_session() if needs_browser else None
                )
                file_system = self._ensure_file_system() if needs_file_system else None
                available_file_paths: list[str] = []
                if normalized_action == "upload_file":
                    raw_path = params.get("path")
                    if isinstance(raw_path, str) and raw_path.strip():
                        available_file_paths.append(raw_path.strip())
                page_extraction_llm = (
                    self._ensure_page_extraction_llm()
                    if normalized_action in {"extract", "read_long_content"}
                    else None
                )
                execute_action = self._execute_action
                assert callable(execute_action)
                result = execute_action(
                    normalized_action,
                    dict(params),
                    browser_session=browser_session,
                    file_system=file_system,
                    available_file_paths=available_file_paths,
                    page_extraction_llm=page_extraction_llm,
                )
                if inspect.isawaitable(result):
                    result = await result
                return self._normalize_action_result(normalized_action, result)
            except Exception as exc:
                return {
                    "success": False,
                    "action": normalized_action,
                    "error": f"Browser Use action '{normalized_action}' failed: {exc}",
                    "native_source": "browser_use.tools",
                }

    async def capture_snapshot(
        self,
        params: Mapping[str, Any],
    ) -> dict[str, Any]:
        async with self._lock:
            try:
                browser_session = await self._ensure_browser_session()

                include_screenshot = bool(params.get("include_screenshot", False))

                raw_offset = params.get("offset", 0)
                offset = raw_offset if isinstance(raw_offset, int) and raw_offset >= 0 else 0
                raw_limit = params.get("limit", DEFAULT_SNAPSHOT_PAGE_LIMIT)
                limit = (
                    raw_limit
                    if isinstance(raw_limit, int) and raw_limit > 0
                    else DEFAULT_SNAPSHOT_PAGE_LIMIT
                )
                if offset + limit > MAX_SNAPSHOT_WINDOW_CHARS:
                    return {
                        "success": False,
                        "action": "snapshot",
                        "error": "offset + limit exceeds maximum snapshot window (120000)",
                        "native_source": "browser_use.state",
                    }

                state = await browser_session.get_browser_state_summary(
                    include_screenshot=include_screenshot
                )
                dom_state = getattr(state, "dom_state", None)
                snapshot_text = ""
                ref_count = 0
                if dom_state is not None:
                    llm_representation = getattr(dom_state, "llm_representation", None)
                    if callable(llm_representation):
                        rendered = llm_representation()
                        if isinstance(rendered, str):
                            snapshot_text = rendered
                    selector_map = getattr(dom_state, "selector_map", None)
                    if isinstance(selector_map, dict):
                        ref_count = len(selector_map)

                total_chars = len(snapshot_text)
                window_start = min(offset, total_chars)
                window_end = min(total_chars, window_start + limit)
                window_text = snapshot_text[window_start:window_end]
                has_more = window_end < total_chars

                payload: dict[str, Any] = {
                    "success": True,
                    "action": "snapshot",
                    "native_source": "browser_use.state",
                    "format": "browser_use_state",
                    "url": str(getattr(state, "url", "") or ""),
                    "title": str(getattr(state, "title", "") or ""),
                    "snapshot": window_text,
                    "ref_count": ref_count,
                    "offset": offset,
                    "limit": limit,
                    "returned_chars": len(window_text),
                    "total_chars": total_chars,
                    "has_more": has_more,
                }

                if has_more:
                    payload["next_offset"] = window_end

                screenshot = getattr(state, "screenshot", None)
                if include_screenshot and isinstance(screenshot, str) and screenshot:
                    payload["screenshot"] = screenshot

                return payload
            except Exception as exc:
                return {
                    "success": False,
                    "action": "snapshot",
                    "error": f"Browser Use snapshot failed: {exc}",
                    "native_source": "browser_use.state",
                }

    @staticmethod
    def _serialize_tab(tab: Any) -> dict[str, str]:
        url = ""
        title = ""
        target_id = ""
        if isinstance(tab, Mapping):
            url_raw = tab.get("url")
            title_raw = tab.get("title")
            target_raw = tab.get("target_id") or tab.get("tab_id")
            url = str(url_raw) if url_raw is not None else ""
            title = str(title_raw) if title_raw is not None else ""
            target_id = str(target_raw) if target_raw is not None else ""
        else:
            url_raw = getattr(tab, "url", "")
            title_raw = getattr(tab, "title", "")
            target_raw = getattr(tab, "target_id", "")
            url = str(url_raw) if url_raw is not None else ""
            title = str(title_raw) if title_raw is not None else ""
            target_id = str(target_raw) if target_raw is not None else ""
        if len(target_id) > 4:
            target_id = target_id[-4:]
        return {"target_id": target_id, "title": title, "url": url}

    async def capture_tabs(self) -> dict[str, Any]:
        async with self._lock:
            try:
                state = await self._current_state_summary()
                tabs_raw = getattr(state, "tabs", None)
                tabs = []
                if isinstance(tabs_raw, list):
                    tabs = [self._serialize_tab(tab) for tab in tabs_raw]
                return {
                    "success": True,
                    "action": "get_tabs",
                    "native_source": "browser_use.state",
                    "tab_count": len(tabs),
                    "tabs": tabs,
                }
            except Exception as exc:
                return {
                    "success": False,
                    "action": "get_tabs",
                    "error": f"Browser Use get_tabs failed: {exc}",
                    "native_source": "browser_use.state",
                }

    async def capture_status(self) -> dict[str, Any]:
        async with self._lock:
            connected = bool(getattr(self._controller, "is_connected", False))
            mode = self._controller_mode()
            if not connected:
                return {
                    "success": True,
                    "action": "status",
                    "native_source": "browser_use.state",
                    "connected": False,
                    "mode": mode,
                    "url": "",
                    "title": "",
                    "tab_count": 0,
                    "target_id": None,
                }
            try:
                state = await self._current_state_summary()
                tabs_raw = getattr(state, "tabs", None)
                tabs: list[dict[str, str]] = []
                if isinstance(tabs_raw, list):
                    tabs = [self._serialize_tab(tab) for tab in tabs_raw]
                return {
                    "success": True,
                    "action": "status",
                    "native_source": "browser_use.state",
                    "connected": True,
                    "mode": mode,
                    "url": str(getattr(state, "url", "") or ""),
                    "title": str(getattr(state, "title", "") or ""),
                    "tab_count": len(tabs),
                    "target_id": tabs[0]["target_id"] if tabs else None,
                }
            except Exception as exc:
                return {
                    "success": False,
                    "action": "status",
                    "error": f"Browser Use status failed: {exc}",
                    "native_source": "browser_use.state",
                }

    async def _current_state_summary(self) -> Any:
        browser_session = await self._ensure_browser_session()
        return await browser_session.get_browser_state_summary(include_screenshot=False)


def get_native_runtime_handlers(
    controller: Any | None = None,
    *,
    import_module_fn: Callable[[str], Any] = import_module,
) -> dict[str, NativeActionHandler]:
    """Return action->handler map for BrowserUseNativeRuntimeProvider."""

    bridge = _BrowserUseActionBridge(
        controller=controller,
        import_module_fn=import_module_fn,
    )
    handlers: dict[str, NativeActionHandler] = {}

    async def _wait_seconds_handler(*, seconds: float) -> dict[str, Any]:
        requested_seconds = max(0.0, float(seconds))
        wait_seconds = max(0, int(round(requested_seconds)))
        controller_connected = bool(getattr(bridge._controller, "is_connected", False))
        if not controller_connected:
            await asyncio.sleep(requested_seconds)
            return {
                "success": True,
                "action": "wait",
                "seconds": requested_seconds,
                "native_source": "windie.timer",
            }

        result = await bridge.execute_action("wait", {"seconds": wait_seconds})
        if result.get("success"):
            result["seconds"] = requested_seconds
            return result

        # Defensive fallback: if Browser Use wait fails due runtime internals,
        # preserve deterministic timed-wait behavior.
        await asyncio.sleep(requested_seconds)
        return {
            "success": True,
            "action": "wait",
            "seconds": requested_seconds,
            "native_source": "windie.timer",
            "warning": "Browser Use wait failed; timed-wait fallback applied.",
        }

    handlers["wait_seconds"] = _wait_seconds_handler

    async def _snapshot_handler(**kwargs: Any) -> dict[str, Any]:
        return await bridge.capture_snapshot(kwargs)

    handlers["snapshot"] = _snapshot_handler

    async def _status_handler(**_kwargs: Any) -> dict[str, Any]:
        return await bridge.capture_status()

    handlers["status"] = _status_handler

    async def _get_tabs_handler(**_kwargs: Any) -> dict[str, Any]:
        return await bridge.capture_tabs()

    handlers["get_tabs"] = _get_tabs_handler

    for action in _BROWSER_USE_ACTIONS:
        async def _handler(
            _action: str = action,
            **kwargs: Any,
        ) -> dict[str, Any]:
            return await bridge.execute_action(_action, kwargs)

        handlers[action] = _handler

    async def _close_tab_alias_handler(**kwargs: Any) -> dict[str, Any]:
        return await bridge.execute_action("close", kwargs)

    handlers["close_tab"] = _close_tab_alias_handler

    return handlers


ENV_NATIVE_HANDLER_MODULE = "WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE"
DEFAULT_NATIVE_HANDLER_MODULE = "tools.browser.browser_runtime"


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


def _load_native_handlers(
    controller: Any,
    *,
    import_module_fn: Callable[[str], Any] = import_module,
) -> dict[str, NativeActionHandler]:
    module_name = os.getenv(
        ENV_NATIVE_HANDLER_MODULE,
        DEFAULT_NATIVE_HANDLER_MODULE,
    ).strip()
    if not module_name:
        raise RuntimeError(
            "Native handler module is not configured. Set WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE."
        )
    try:
        module = import_module_fn(module_name)
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
    *,
    find_spec_fn: Callable[[str], Any] = find_spec,
    import_module_fn: Callable[[str], Any] = import_module,
) -> BrowserRuntimeProvider | None:
    """Return Browser Use-native runtime provider when available.

    Browser Use package availability is required by runtime_provider selection.
    """

    if find_spec_fn("browser_use") is None:
        return None
    native_handlers = _load_native_handlers(
        controller,
        import_module_fn=import_module_fn,
    )
    return BrowserUseNativeRuntimeProvider(
        controller,
        native_handlers=native_handlers,
    )
