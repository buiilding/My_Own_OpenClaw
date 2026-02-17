"""Browser control entrypoint for WindieOS sidecar.

This module keeps WindieOS orchestration/tool-loop semantics while executing
browser actions via Browser Use-native adapter/runtime implementations vendored
in-repo.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from tools.browser.controller import get_browser_controller
from tools.result import ToolResult

logger = logging.getLogger(__name__)

PHASE2_ADAPTER_ROUTED_ACTIONS = frozenset(
    {
        "connect",
        "status",
        "profiles",
        "navigate",
        "open",
        "click",
        "type",
        "press",
        "scroll",
        "screenshot",
        "wait",
        "get_tabs",
        "switch_tab",
        "evaluate",
        "console",
        "errors",
        "requests",
        "trace_start",
        "trace_stop",
        "pdf",
        "upload",
        "dialog",
        "cookies",
        "cookies_set",
        "cookies_clear",
        "storage_get",
        "storage_set",
        "storage_clear",
        "set_offline",
        "set_headers",
        "set_credentials",
        "set_geolocation",
        "set_media",
        "set_timezone",
        "set_locale",
        "set_device",
        "done",
        "search",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "write_file",
        "replace_file",
        "read_file",
        "read_long_content",
        "snapshot",
        "extract",
        "act",
        "close",
    }
)


def _adapter_result_to_tool_result(result: "AdapterActionResult") -> ToolResult:
    if result.success:
        return ToolResult.success_result(result.data)

    if result.error:
        return ToolResult.error_result(result.error)

    if result.deprecation:
        return ToolResult.error_result(result.deprecation)

    return ToolResult.error_result("Action failed")


async def _run_phase2_adapter_action(args: Dict[str, Any]) -> ToolResult:
    action = args.get("action")
    if not isinstance(action, str) or not action:
        return ToolResult.error_result("Missing required 'action' parameter")

    if action not in PHASE2_ADAPTER_ROUTED_ACTIONS:
        return ToolResult.error_result(f"Unhandled action: {action}")

    controller = get_browser_controller()
    adapter = get_browser_use_adapter(controller)
    adapter_result = await adapter.execute(action, args)
    return _adapter_result_to_tool_result(adapter_result)


async def execute_browser(raw_args: Dict[str, Any]) -> ToolResult:
    """Execute browser actions through Browser Use-native adapter/runtime."""
    if not isinstance(raw_args, dict):
        return ToolResult.error_result("Arguments must be an object")

    action = raw_args.get("action")
    if not action:
        return ToolResult.error_result("Missing required 'action' parameter")

    try:
        if action not in PHASE2_ADAPTER_ROUTED_ACTIONS:
            return ToolResult.error_result(f"Unhandled action: {action}")
        return await _run_phase2_adapter_action(raw_args)
    except Exception as exc:
        logger.exception("Browser action '%s' failed", action)
        return ToolResult.error_result(f"Action failed: {str(exc)}")


"""Shared adapter result types for Browser Use compatibility routing."""


from dataclasses import dataclass, field
from typing import Any, Literal

MigrationDecision = Literal["port", "compat", "deprecate"]


@dataclass(slots=True)
class AdapterActionResult:
    """Normalized adapter action result consumed by browser_tool."""

    success: bool
    action: str
    decision: MigrationDecision
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    warnings: list[str] = field(default_factory=list)
    deprecation: str | None = None

"""Runtime-provider seam for Browser Use adapter internals.

Browser Use native runtime is mandatory for browser execution.
"""


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
            "tools.browser.browser_tool"
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
"""Browser Use native-runtime handler registry."""


import asyncio
import inspect
from importlib import import_module
import logging
import os
from pathlib import Path
from typing import Any, Awaitable, Callable, Mapping

logger = logging.getLogger(__name__)

NativeActionHandler = Callable[..., Awaitable[Any] | Any]
DEFAULT_CDP_URL = "http://127.0.0.1:9222"
DEFAULT_FILESYSTEM_DIR = Path.home() / ".config" / "desktop-assistant" / "browser-use"
DEFAULT_EXTRACTION_MODEL_ENV = "WINDIE_BROWSER_USE_EXTRACTION_MODEL"
DEFAULT_SNAPSHOT_PAGE_LIMIT = 4_000
MAX_SNAPSHOT_WINDOW_CHARS = 120_000

_BROWSER_REQUIRED_ACTIONS = frozenset(
    {
        "search",
        "navigate",
        "go_back",
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

    def __init__(self, controller: Any | None = None):
        self._controller = controller
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

        service_module = import_module("browser_use.tools.service")
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

        browser_module = import_module("browser_use.browser")
        browser_session_type = getattr(browser_module, "BrowserSession", None)
        if not inspect.isclass(browser_session_type):
            raise RuntimeError("browser_use.browser.BrowserSession is unavailable")

        fs_module = import_module("browser_use.filesystem.file_system")
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

    def _ensure_page_extraction_llm(self) -> Any:
        if self._page_extraction_llm is not None:
            return self._page_extraction_llm

        model_name_raw = os.getenv(DEFAULT_EXTRACTION_MODEL_ENV, "")
        model_name = model_name_raw.strip()
        if not model_name:
            raise RuntimeError(
                "Browser Use extraction actions require a native page_extraction_llm. "
                f"Set {DEFAULT_EXTRACTION_MODEL_ENV} to a Browser Use model name "
                "(for example: openai_gpt_4o_mini)."
            )

        llm_models_module = import_module("browser_use.llm.models")
        get_llm_by_name = getattr(llm_models_module, "get_llm_by_name", None)
        if not callable(get_llm_by_name):
            raise RuntimeError("browser_use.llm.models.get_llm_by_name is unavailable")

        llm = get_llm_by_name(model_name)
        self._page_extraction_llm = llm
        return llm

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
) -> dict[str, NativeActionHandler]:
    """Return action->handler map for BrowserUseNativeRuntimeProvider."""

    bridge = _BrowserUseActionBridge(controller=controller)
    handlers: dict[str, NativeActionHandler] = {}

    async def _wait_seconds_handler(*, seconds: float) -> dict[str, Any]:
        requested_seconds = max(0.0, float(seconds))
        wait_seconds = max(0, int(round(requested_seconds)))
        result = await bridge.execute_action("wait", {"seconds": wait_seconds})
        if result.get("success"):
            result["seconds"] = requested_seconds
        return result

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
"""Browser Use-native runtime provider factory.

Browser Use action names are executed strictly via native handlers.
Controller-backed methods are retained for non-Browser-Use compatibility actions.
"""


import inspect
from importlib import import_module
from importlib.util import find_spec
import os
from typing import Any, Awaitable, Callable, Mapping


ENV_NATIVE_HANDLER_MODULE = "WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE"
DEFAULT_NATIVE_HANDLER_MODULE = "tools.browser.browser_tool"
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
"""Phase 2 browser adapter routing through the current browser controller seam.

This module defines the Browser Use adapter boundary and a compatibility
implementation that preserves existing browser payload contracts while
we migrate internals incrementally.
"""


import base64
import json
import re
from typing import Any, Mapping, Protocol
from weakref import WeakKeyDictionary


SNAPSHOT_WAIT_STATES = frozenset({"load", "domcontentloaded", "networkidle", "commit"})
SNAPSHOT_TRUNCATION_SUFFIX = "... (truncated)"
MAX_SNAPSHOT_CAPTURE_CHARS = 120_000
SNAPSHOT_PAGINATION_OVERFETCH_CHARS = 512
DEFAULT_AI_SNAPSHOT_MAX_CHARS = 12_000
DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS = 4_000
DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH = 4
AI_SNAPSHOT_ZERO_REF_FALLBACK_DEPTH = 12
DEFAULT_ARIA_SNAPSHOT_MAX_CHARS = 4_000
MAX_ARIA_SNAPSHOT_MAX_CHARS = 4_000
DEFAULT_EXTRACT_MAX_CHARS = 12_000
MAX_EXTRACT_SOURCE_CHARS = 100_000
MAX_EXTRACT_LINKS = 200
DEFAULT_EXTRACT_MODE = "focused"
MAX_EXTRACT_STRUCTURED_TABLES = 20
MAX_EXTRACT_STRUCTURED_ROWS_PER_TABLE = 100
MAX_EXTRACT_STRUCTURED_LISTS = 20
MAX_EXTRACT_STRUCTURED_ITEMS_PER_LIST = 100
TRACE_DEPRECATION_MESSAGE = (
    "trace_start/trace_stop are deprecated in Browser Use runtime mode. "
    "Use requests/errors capture and HAR-style runbook workflows instead."
)
LEGACY_ACTION_DEPRECATION_MESSAGE = (
    "This browser action is deprecated in Browser Use-only runtime mode. "
    "Use Browser Use native actions instead."
)
BROWSER_USE_DIRECT_ACTIONS = frozenset(
    {
        "done",
        "search",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "write_file",
        "replace_file",
        "read_file",
        "read_long_content",
    }
)
BROWSER_USE_ACTIONS_REQUIRING_CONNECTION = frozenset(
    {
        "snapshot",
        "navigate",
        "click",
        "extract",
        "scroll",
        "screenshot",
        "evaluate",
        "close",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "read_long_content",
        "get_tabs",
    }
)
ACT_EXECUTE_FORWARD_ACTIONS = frozenset({"navigate", "extract", "scroll", "screenshot"})
DEPRECATED_LEGACY_ACTIONS = frozenset(
    {
        "console",
        "errors",
        "requests",
        "pdf",
        "dialog",
        "cookies",
        "cookies_set",
        "cookies_clear",
        "storage_get",
        "storage_set",
        "storage_clear",
        "set_offline",
        "set_headers",
        "set_credentials",
        "set_geolocation",
        "set_media",
        "set_timezone",
        "set_locale",
        "set_device",
    }
)
DEPRECATED_LEGACY_ACT_KINDS = frozenset({"hover", "drag", "select", "fill", "resize"})
_ADAPTER_CACHE_BY_CONTROLLER: "WeakKeyDictionary[Any, BrowserUseCompatibilityAdapter]" = (
    WeakKeyDictionary()
)


class BrowserControllerLike(Protocol):
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
    async def switch_tab(self, target_id: str) -> bool: ...
    async def navigate(self, url: str, wait_until: str) -> dict[str, Any]: ...
    async def open_tab(self, *, url: str) -> dict[str, Any]: ...
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
    async def get_tabs(self) -> list[Any]: ...
    async def evaluate(self, script: str) -> dict[str, Any]: ...
    async def get_console_messages(
        self,
        *,
        level: str | None,
        limit: int,
        clear: bool,
    ) -> list[dict[str, Any]]: ...
    async def get_page_errors(
        self,
        *,
        limit: int,
        clear: bool,
    ) -> list[dict[str, Any]]: ...
    async def get_network_requests(
        self,
        *,
        limit: int,
        contains: str | None,
        clear: bool,
    ) -> list[dict[str, Any]]: ...
    async def trace_start(
        self,
        *,
        snapshots: bool,
        screenshots: bool,
        sources: bool,
    ) -> dict[str, Any]: ...
    async def trace_stop(self) -> dict[str, Any]: ...
    async def pdf(self) -> bytes: ...
    async def set_input_files(
        self,
        *,
        ref: str,
        paths: list[str],
    ) -> dict[str, Any]: ...
    async def get_dialog_events(
        self,
        *,
        limit: int = 20,
        clear: bool = False,
    ) -> list[dict[str, Any]]: ...
    def arm_dialog(
        self,
        *,
        accept: bool,
        prompt_text: str | None,
    ) -> None: ...
    async def wait_for_dialog(self, *, timeout_ms: int) -> dict[str, Any] | None: ...
    async def get_cookies(self) -> list[dict[str, Any]]: ...
    async def set_cookies(self, cookies: list[dict[str, Any]]) -> dict[str, Any]: ...
    async def clear_cookies(self) -> dict[str, Any]: ...
    async def get_storage(self, kind: str) -> dict[str, str]: ...
    async def set_storage(self, kind: str, values: dict[str, str]) -> dict[str, Any]: ...
    async def clear_storage(self, kind: str) -> dict[str, Any]: ...
    async def set_offline(self, offline: bool) -> dict[str, Any]: ...
    async def set_headers(self, headers: dict[str, str]) -> dict[str, Any]: ...
    async def set_http_credentials(
        self,
        *,
        username: str | None,
        password: str | None,
        clear: bool,
    ) -> dict[str, Any]: ...
    async def set_geolocation(
        self,
        *,
        latitude: float | None,
        longitude: float | None,
        accuracy: float | None,
        clear: bool,
    ) -> dict[str, Any]: ...
    async def set_media(
        self,
        *,
        media: str | None,
        color_scheme: str | None,
    ) -> dict[str, Any]: ...
    async def set_timezone(self, timezone: str) -> dict[str, Any]: ...
    async def set_locale(self, locale: str) -> dict[str, Any]: ...
    async def set_device(self, device: str) -> dict[str, Any]: ...
    async def hover(self, ref: str) -> dict[str, Any]: ...
    async def drag(self, start_ref: str, end_ref: str) -> dict[str, Any]: ...
    async def select_options(self, ref: str, values: list[str]) -> dict[str, Any]: ...
    async def fill_fields(self, fields: list[dict[str, Any]]) -> dict[str, Any]: ...
    async def resize_viewport(self, width: int, height: int) -> dict[str, Any]: ...


class BrowserUseCompatibilityAdapter:
    """Compatibility adapter for Phase 2 routing.

    This adapter intentionally keeps existing payload contracts stable while
    moving browser action execution behind an adapter seam.
    """

    def __init__(
        self,
        controller: BrowserControllerLike,
        runtime_provider: BrowserRuntimeProvider | None = None,
    ):
        self._controller = controller
        self._runtime = runtime_provider or get_browser_runtime_provider(controller)

    async def execute(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult:
        if action in DEPRECATED_LEGACY_ACTIONS:
            return self._deprecated_action(
                action,
                LEGACY_ACTION_DEPRECATION_MESSAGE,
            )
        if action == "connect":
            return await self.connect(args)
        if action == "status":
            return await self.status()
        if action == "profiles":
            return await self.profiles()
        if action == "navigate":
            return await self.execute_browser_use_action(action, args)
        if action == "open":
            return await self.open(args)
        if action == "snapshot":
            return await self.execute_browser_use_action(action, args)
        if action == "extract":
            return await self.execute_browser_use_action(action, args)
        if action == "click":
            return await self.execute_browser_use_action(action, args)
        if action == "type":
            return await self.type_text(args)
        if action == "press":
            return await self.press(args)
        if action == "scroll":
            return await self.execute_browser_use_action(action, args)
        if action == "screenshot":
            return await self.execute_browser_use_action(action, args)
        if action == "wait":
            return await self.execute_browser_use_action(action, args)
        if action == "get_tabs":
            return await self.get_tabs()
        if action == "switch_tab":
            return await self.switch_tab(args)
        if action == "evaluate":
            return await self.execute_browser_use_action(action, args)
        if action in BROWSER_USE_DIRECT_ACTIONS:
            return await self.execute_browser_use_action(action, args)
        if action == "trace_start":
            return await self.trace_start(args)
        if action == "trace_stop":
            return await self.trace_stop()
        if action == "upload":
            return await self.upload(args)
        if action == "act":
            return await self.act(args)
        if action == "close":
            if self._extract_tab_id(args):
                return await self.execute_browser_use_action("close", args)
            return await self.close()

        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=f"Unhandled action: {action}",
            error_code="ACTION_UNSUPPORTED",
        )

    async def connect(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if self._runtime.is_connected:
            await self._runtime.close()

        mode = self._value_as_str(args.get("mode")) or "user_chrome"
        try:
            if mode == "user_chrome":
                result = await self._runtime.connect_user_chrome(
                    cdp_url=self._value_as_str(args.get("cdp_url"))
                    or "http://127.0.0.1:9222",
                    auto_launch=True,
                )
                if result.get("auto_launched"):
                    message = (
                        f"Browser {result['status']} in {result['mode']} mode "
                        "(Chrome was auto-launched)"
                    )
                else:
                    message = (
                        f"Browser {result['status']} in {result['mode']} mode "
                        "(connected to existing Chrome)"
                    )
            elif mode == "managed":
                result = await self._runtime.connect_managed(
                    headless=bool(args.get("headless", False)),
                    executable_path=self._value_as_str(args.get("executable_path")),
                )
                message = f"Browser {result['status']} in {result['mode']} mode"
            else:
                return AdapterActionResult(
                    success=False,
                    action="connect",
                    decision="compat",
                    error=f"Unknown browser mode: {mode}",
                    error_code="INVALID_ARGUMENT",
                )
        except ConnectionError as exc:
            return AdapterActionResult(
                success=False,
                action="connect",
                decision="compat",
                error=f"Failed to connect to Chrome. {str(exc)}",
                error_code="BROWSER_RUNTIME_ERROR",
            )
        except RuntimeError as exc:
            return AdapterActionResult(
                success=False,
                action="connect",
                decision="compat",
                error=str(exc),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="connect",
            decision="compat",
            data={
                "status": result["status"],
                "mode": result["mode"],
                "url": result["url"],
                "title": result.get("title", ""),
                "auto_launched": result.get("auto_launched", False),
                "message": message,
            },
        )

    async def status(self) -> AdapterActionResult:
        return await self.execute_browser_use_action("status", {"action": "status"})

    async def profiles(self) -> AdapterActionResult:
        return AdapterActionResult(
            success=True,
            action="profiles",
            decision="compat",
            data={
                "action": "profiles",
                "profiles": [
                    {"name": "user_chrome", "driver": "cdp"},
                    {"name": "managed", "driver": "playwright"},
                ],
                "default_profile": "user_chrome",
            },
        )

    async def snapshot(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("snapshot")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        format_type = args.get("format", args.get("snapshotFormat", "ai"))
        if format_type not in ("ai", "aria"):
            return self._invalid_argument(
                "snapshot",
                "Invalid snapshot format. Use 'ai' or 'aria'.",
            )

        wait_until, wait_error = self._resolve_wait_until(args, default="load")
        if wait_error:
            return self._invalid_argument("snapshot", wait_error)

        wait_result = await self._runtime.wait_for_load(state=wait_until)
        if isinstance(wait_result, dict) and not wait_result.get("success", False):
            return AdapterActionResult(
                success=False,
                action="snapshot",
                decision="compat",
                error=wait_result.get("error", f"wait_for_load({wait_until}) failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        mode_raw = args.get("mode")
        mode: str | None = None
        if mode_raw == "efficient":
            mode = "efficient"
        elif format_type == "ai" and mode_raw in (None, "", "user_chrome"):
            mode = "efficient"

        if mode == "efficient" and format_type == "aria":
            return self._invalid_argument(
                "snapshot",
                "mode='efficient' requires format='ai'.",
            )

        max_chars_raw = args.get("max_chars")
        max_chars: int | None = None
        if isinstance(max_chars_raw, int) and max_chars_raw > 0:
            max_chars = max_chars_raw

        offset_raw = args.get("offset")
        offset = 0
        if offset_raw is not None:
            if not isinstance(offset_raw, int) or offset_raw < 0:
                return self._invalid_argument(
                    "snapshot",
                    "offset must be a non-negative integer",
                )
            offset = offset_raw

        limit_raw = args.get("limit")
        limit: int | None = None
        if limit_raw is not None:
            if not isinstance(limit_raw, int) or limit_raw <= 0:
                return self._invalid_argument(
                    "snapshot",
                    "limit must be a positive integer",
                )
            limit = limit_raw

        refs_mode_raw = args.get("refs")
        refs_mode = refs_mode_raw if refs_mode_raw in ("role", "aria") else None

        interactive = (
            args.get("interactive")
            if isinstance(args.get("interactive"), bool)
            else None
        )
        compact = args.get("compact") if isinstance(args.get("compact"), bool) else None
        depth = args.get("depth") if isinstance(args.get("depth"), int) else None
        selector = args.get("selector") if isinstance(args.get("selector"), str) else None
        frame_selector = args.get("frame") if isinstance(args.get("frame"), str) else None

        if mode == "efficient":
            if interactive is None:
                interactive = True
            if compact is None:
                compact = True
            if depth is None:
                depth = DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH

        resolved_max_chars = max_chars
        if format_type == "ai" and resolved_max_chars is None:
            resolved_max_chars = (
                DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS
                if mode == "efficient"
                else DEFAULT_AI_SNAPSHOT_MAX_CHARS
            )
        elif format_type == "aria":
            if resolved_max_chars is None:
                resolved_max_chars = DEFAULT_ARIA_SNAPSHOT_MAX_CHARS
            else:
                resolved_max_chars = min(
                    resolved_max_chars,
                    MAX_ARIA_SNAPSHOT_MAX_CHARS,
                )

        page_limit = (
            limit
            if limit is not None
            else (resolved_max_chars or DEFAULT_AI_SNAPSHOT_MAX_CHARS)
        )
        if format_type == "aria":
            page_limit = min(page_limit, MAX_ARIA_SNAPSHOT_MAX_CHARS)

        capture_max_chars = resolved_max_chars or DEFAULT_AI_SNAPSHOT_MAX_CHARS
        pagination_requested = offset > 0 or limit is not None
        if pagination_requested:
            requested_window_end = offset + page_limit
            if requested_window_end > MAX_SNAPSHOT_CAPTURE_CHARS:
                return self._invalid_argument(
                    "snapshot",
                    "offset + limit exceeds maximum snapshot window (120000)",
                )
            capture_max_chars = max(
                capture_max_chars,
                min(
                    MAX_SNAPSHOT_CAPTURE_CHARS,
                    requested_window_end + SNAPSHOT_PAGINATION_OVERFETCH_CHARS,
                ),
            )
        else:
            capture_max_chars = min(capture_max_chars, MAX_SNAPSHOT_CAPTURE_CHARS)

        if format_type == "ai":
            snapshot = await self._capture_ai_snapshot_with_zero_ref_fallback(
                max_chars=capture_max_chars,
                refs_mode=refs_mode,
                interactive=interactive,
                compact=compact,
                depth=depth,
                selector=selector,
                frame_selector=frame_selector,
                enable_zero_ref_fallback=(mode == "efficient"),
            )
        else:
            snapshot = await self._runtime.get_page_snapshot(
                format_type=format_type,
                max_chars=capture_max_chars,
                refs_mode=refs_mode,
                interactive=interactive,
                compact=compact,
                depth=depth,
                selector=selector,
                frame_selector=frame_selector,
            )

        full_snapshot = snapshot.text if isinstance(snapshot.text, str) else ""
        total_chars = len(full_snapshot)
        window_start = min(offset, total_chars)
        window_end = min(total_chars, window_start + page_limit)
        window_text = full_snapshot[window_start:window_end]
        is_truncated_capture = full_snapshot.rstrip().endswith(SNAPSHOT_TRUNCATION_SUFFIX)
        has_more = window_end < total_chars or (
            is_truncated_capture and window_end >= total_chars
        )
        next_offset = window_end if has_more else None

        result: dict[str, Any] = {
            "action": "snapshot",
            "format": format_type,
            "wait_until": wait_until,
            "url": snapshot.url,
            "title": snapshot.title,
            "snapshot": window_text,
            "ref_count": snapshot.ref_count,
            "offset": offset,
            "limit": page_limit,
            "returned_chars": len(window_text),
            "total_chars": total_chars,
            "has_more": has_more,
        }
        if next_offset is not None:
            result["next_offset"] = next_offset

        return AdapterActionResult(
            success=True,
            action="snapshot",
            decision="compat",
            data=result,
        )

    async def extract(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("extract")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        query = self._value_as_str(args.get("query"))
        if not query:
            return self._invalid_argument("extract", "Missing required 'query' parameter")

        mode = self._resolve_extract_mode(args.get("mode"))
        if mode is None:
            return self._invalid_argument(
                "extract",
                "mode must be one of: focused, full_text, structured",
            )

        selector_raw = args.get("selector")
        if selector_raw is not None and (
            not isinstance(selector_raw, str) or not selector_raw.strip()
        ):
            return self._invalid_argument(
                "extract",
                "selector must be a non-empty string when set",
            )
        selector = selector_raw.strip() if isinstance(selector_raw, str) else None

        frame_raw = args.get("frame")
        if frame_raw is not None and (
            not isinstance(frame_raw, str) or not frame_raw.strip()
        ):
            return self._invalid_argument(
                "extract",
                "frame must be a non-empty string when set",
            )
        frame_selector = frame_raw.strip() if isinstance(frame_raw, str) else None

        start_from_char = args.get("start_from_char", 0)
        if not isinstance(start_from_char, int) or start_from_char < 0:
            return self._invalid_argument(
                "extract",
                "start_from_char must be a non-negative integer",
            )

        max_chars_raw = args.get("max_chars")
        max_chars = DEFAULT_EXTRACT_MAX_CHARS
        if max_chars_raw is not None:
            if not isinstance(max_chars_raw, int) or max_chars_raw <= 0:
                return self._invalid_argument(
                    "extract",
                    "max_chars must be a positive integer",
                )
            max_chars = min(max_chars_raw, MAX_SNAPSHOT_CAPTURE_CHARS)

        wait_until, wait_error = self._resolve_wait_until(args, default="load")
        if wait_error:
            return self._invalid_argument("extract", wait_error)

        wait_result = await self._runtime.wait_for_load(state=wait_until)
        if isinstance(wait_result, dict) and not wait_result.get("success", False):
            return AdapterActionResult(
                success=False,
                action="extract",
                decision="compat",
                error=wait_result.get("error", f"wait_for_load({wait_until}) failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        extract_links = bool(args.get("extract_links", False))
        script = self._build_extract_script(
            extract_links=extract_links,
            max_links=MAX_EXTRACT_LINKS,
            selector=selector,
            frame_selector=frame_selector,
            max_tables=MAX_EXTRACT_STRUCTURED_TABLES,
            max_rows_per_table=MAX_EXTRACT_STRUCTURED_ROWS_PER_TABLE,
            max_lists=MAX_EXTRACT_STRUCTURED_LISTS,
            max_items_per_list=MAX_EXTRACT_STRUCTURED_ITEMS_PER_LIST,
        )

        eval_result = await self._runtime.evaluate(script=script)
        if not isinstance(eval_result, dict) or not eval_result.get("success", False):
            if isinstance(eval_result, dict):
                return AdapterActionResult(
                    success=False,
                    action="extract",
                    decision="compat",
                    error=eval_result.get("error", "Extract evaluate failed"),
                    error_code="BROWSER_RUNTIME_ERROR",
                )
            return AdapterActionResult(
                success=False,
                action="extract",
                decision="compat",
                error="Extract evaluate failed",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        payload = eval_result.get("result")
        if not isinstance(payload, dict):
            return AdapterActionResult(
                success=False,
                action="extract",
                decision="compat",
                error="Extract evaluate returned invalid result",
                error_code="BROWSER_RUNTIME_ERROR",
            )
        payload_error = payload.get("error")
        if isinstance(payload_error, str) and payload_error.strip():
            return AdapterActionResult(
                success=False,
                action="extract",
                decision="compat",
                error=f"Extract failed: {payload_error}",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        source_content = payload.get("content")
        if not isinstance(source_content, str):
            source_content = ""
        structured_payload = payload.get("structured")
        if not isinstance(structured_payload, (dict, list)):
            structured_payload = None

        source_for_mode = source_content
        if mode == "structured":
            if structured_payload is not None:
                source_for_mode = json.dumps(
                    structured_payload,
                    ensure_ascii=True,
                    indent=2,
                )
            else:
                source_for_mode = source_content

        total_source_chars = len(source_for_mode)
        if start_from_char > total_source_chars:
            return self._invalid_argument(
                "extract",
                f"start_from_char ({start_from_char}) exceeds content length {total_source_chars}",
            )

        source_window_end = min(
            total_source_chars,
            start_from_char + MAX_EXTRACT_SOURCE_CHARS,
        )
        source_window = source_for_mode[start_from_char:source_window_end]
        source_has_more = source_window_end < total_source_chars
        next_start_char = source_window_end if source_has_more else None

        if mode == "focused":
            relevant_content = self._extract_relevant_content(source_window, query)
        else:
            relevant_content = source_window
        if len(relevant_content) > max_chars:
            relevant_content = (
                relevant_content[:max_chars] + f"\n{SNAPSHOT_TRUNCATION_SUFFIX}"
            )

        url = payload.get("url")
        if not isinstance(url, str):
            url = ""
        title = payload.get("title")
        if not isinstance(title, str):
            title = ""

        extracted_content = (
            f"<url>\n{url}\n</url>\n"
            f"<query>\n{query}\n</query>\n"
            f"<result>\n{relevant_content}\n</result>"
        )

        result: dict[str, Any] = {
            "action": "extract",
            "query": query,
            "mode": mode,
            "wait_until": wait_until,
            "extract_links": extract_links,
            "url": url,
            "title": title,
            "result": relevant_content,
            "extracted_content": extracted_content,
            "start_from_char": start_from_char,
            "next_start_char": next_start_char,
            "has_more_source": source_has_more,
            "returned_chars": len(relevant_content),
            "source_window_chars": len(source_window),
            "total_source_chars": total_source_chars,
        }
        if selector:
            result["selector"] = selector
        if frame_selector:
            result["frame"] = frame_selector
        if mode == "structured" and structured_payload is not None:
            result["structured"] = structured_payload

        if args.get("output_schema") is not None:
            result["output_schema_applied"] = False
            result["output_schema_note"] = (
                "output_schema is accepted as metadata only; structured validation is not applied in sidecar extract."
            )

        return AdapterActionResult(
            success=True,
            action="extract",
            decision="compat",
            data=result,
        )

    async def navigate(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("navigate")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        url = self._extract_url(args)
        if not url:
            return self._invalid_argument("navigate", "Missing required 'url' parameter")

        result = await self._runtime.navigate(
            url=url,
            wait_until=self._value_as_str(args.get("wait_until")) or "load",
        )
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="navigate",
                decision="port",
                error=result.get("error", "Navigation failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="navigate",
            decision="port",
            data={
                "action": "navigate",
                "url": result["url"],
                "title": result["title"],
                "status": result.get("status"),
            },
        )

    async def open(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("open")

        url = self._extract_url(args) or "about:blank"
        open_result = await self.execute_browser_use_action(
            "navigate",
            {
                **dict(args),
                "action": "navigate",
                "url": url,
                "new_tab": True,
            },
        )
        open_result = self._retag_action(open_result, "open")
        if not open_result.success:
            return open_result
        payload = dict(open_result.data)
        payload["action"] = "open"
        payload["url"] = url
        payload["browser_use_action"] = "navigate"
        payload["new_tab"] = True
        return AdapterActionResult(
            success=True,
            action="open",
            decision=open_result.decision,
            data=payload,
            warnings=list(open_result.warnings),
        )

    async def click(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("click")

        ref = self._value_as_str(args.get("ref"))
        if not ref:
            return self._invalid_argument("click", "Missing required 'ref' parameter")

        double_click = bool(args.get("double_click", False))
        button = self._value_as_str(args.get("button")) or "left"
        result = await self._runtime.click(
            ref=ref,
            double_click=double_click,
            button=button,
        )
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="click",
                decision="compat",
                error=result.get("error", "Click failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        payload: dict[str, Any] = {
            "action": "click",
            "ref": ref,
            "double_click": double_click,
            "button": button,
        }
        for key in (
            "forced",
            "method",
            "strategy",
            "candidate_count",
            "candidate_index",
        ):
            if key in result:
                payload[key] = result[key]

        return AdapterActionResult(
            success=True,
            action="click",
            decision="compat",
            data=payload,
        )

    async def type_text(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("type")

        ref = self._value_as_str(args.get("ref"))
        text = args.get("text")
        if not ref:
            return self._invalid_argument("type", "Missing required 'ref' parameter")
        if not isinstance(text, str):
            return self._invalid_argument(
                "type",
                "Missing required 'text' parameter",
            )

        type_result = await self.execute_browser_use_action(
            "input",
            {
                **dict(args),
                "action": "input",
                "ref": ref,
                "text": text,
            },
        )
        type_result = self._retag_action(type_result, "type")
        if not type_result.success:
            return type_result

        submit = bool(args.get("submit", False))
        if submit:
            submit_result = await self.execute_browser_use_action(
                "send_keys",
                {
                    "action": "send_keys",
                    "keys": "Enter",
                },
            )
            if not submit_result.success:
                return self._retag_action(submit_result, "type")

        payload = dict(type_result.data)
        payload["action"] = "type"
        payload["ref"] = ref
        payload["text"] = text
        payload["submit"] = submit

        return AdapterActionResult(
            success=True,
            action="type",
            decision=type_result.decision,
            data=payload,
            warnings=list(type_result.warnings),
        )

    async def press(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("press")

        key = self._value_as_str(args.get("key"))
        if not key:
            return self._invalid_argument("press", "Missing required 'key' parameter")

        press_result = await self.execute_browser_use_action(
            "send_keys",
            {
                "action": "send_keys",
                "keys": key,
            },
        )
        press_result = self._retag_action(press_result, "press")
        if not press_result.success:
            return press_result
        payload = dict(press_result.data)
        payload["action"] = "press"
        payload["key"] = key
        return AdapterActionResult(
            success=True,
            action="press",
            decision=press_result.decision,
            data=payload,
            warnings=list(press_result.warnings),
        )

    async def scroll(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("scroll")

        direction = self._value_as_str(args.get("direction")) or "down"
        amount_raw = args.get("amount")
        amount = amount_raw if isinstance(amount_raw, int) else 500
        result = await self._runtime.scroll(direction=direction, amount=amount)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="scroll",
                decision="port",
                error=result.get("error", "Scroll failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="scroll",
            decision="port",
            data={
                "action": "scroll",
                "direction": direction,
                "amount": amount,
            },
        )

    async def screenshot(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("screenshot")

        full_page = bool(args.get("full_page", False))
        ref = self._value_as_str(args.get("ref"))
        element = self._value_as_str(args.get("element"))
        image_type = self._value_as_str(args.get("type")) or "png"
        if image_type not in ("png", "jpeg"):
            return self._invalid_argument(
                "screenshot",
                "Invalid screenshot type. Use 'png' or 'jpeg'.",
            )
        quality_raw = args.get("quality")
        quality = int(quality_raw) if isinstance(quality_raw, (int, float)) else None

        try:
            image_bytes = await self._runtime.screenshot(
                full_page=full_page,
                ref=ref,
                element=element,
                image_type=image_type,
                quality=quality,
            )
        except Exception as exc:
            return AdapterActionResult(
                success=False,
                action="screenshot",
                decision="compat",
                error=f"Screenshot failed: {str(exc)}",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        return AdapterActionResult(
            success=True,
            action="screenshot",
            decision="compat",
            data={
                "action": "screenshot",
                "format": image_type,
                "full_page": full_page,
                "ref": ref,
                "element": element,
                "image_data": image_b64,
                "image_size_bytes": len(image_bytes),
            },
        )

    async def wait(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("wait")

        seconds = args.get("seconds")
        if isinstance(seconds, (int, float)):
            result = await self._runtime.wait_seconds(seconds=float(seconds))
            if isinstance(result, dict) and not result.get("success", False):
                return AdapterActionResult(
                    success=False,
                    action="wait",
                    decision="compat",
                    error=result.get("error", "Wait failed"),
                    error_code="BROWSER_RUNTIME_ERROR",
                )
            return AdapterActionResult(
                success=True,
                action="wait",
                decision="compat",
                data={
                    "action": "wait",
                    "type": "time",
                    "seconds": float(seconds),
                },
            )

        state = self._value_as_str(args.get("state")) or "networkidle"
        result = await self._runtime.wait_for_load(state=state)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="wait",
                decision="compat",
                error=result.get("error", "Wait failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )
        return AdapterActionResult(
            success=True,
            action="wait",
            decision="compat",
            data={
                "action": "wait",
                "type": "load_state",
                "state": state,
            },
        )

    async def get_tabs(self) -> AdapterActionResult:
        return await self.execute_browser_use_action(
            "get_tabs",
            {"action": "get_tabs"},
        )

    async def switch_tab(self, args: Mapping[str, Any]) -> AdapterActionResult:
        switch_result = await self.execute_browser_use_action(
            "switch",
            {
                **dict(args),
                "action": "switch",
            },
        )
        switch_result = self._retag_action(switch_result, "switch_tab")
        if not switch_result.success:
            return switch_result
        payload = dict(switch_result.data)
        payload["action"] = "switch_tab"
        payload["target_id"] = self._extract_target_id(args)
        payload["browser_use_action"] = "switch"
        return AdapterActionResult(
            success=True,
            action="switch_tab",
            decision=switch_result.decision,
            data=payload,
            warnings=list(switch_result.warnings),
        )

    async def evaluate(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("evaluate")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        script = self._value_as_str(args.get("script"))
        if not script:
            return self._invalid_argument(
                "evaluate",
                "Missing required 'script' parameter",
            )

        result = await self._runtime.evaluate(script=script)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="evaluate",
                decision="port",
                error=result.get("error", "Evaluate failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="evaluate",
            decision="port",
            data={
                "action": "evaluate",
                "script": script,
                "result": result.get("result"),
            },
        )

    async def execute_browser_use_action(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult:
        normalized = action.strip().lower()
        if normalized in BROWSER_USE_ACTIONS_REQUIRING_CONNECTION:
            if not self._runtime.is_connected:
                return self._not_connected(action)

        params_or_error = self._build_browser_use_action_params(normalized, args)
        if isinstance(params_or_error, AdapterActionResult):
            return params_or_error
        params = params_or_error
        runtime_action = "close" if normalized == "close_tab" else normalized

        runtime_execute = getattr(self._runtime, "execute_browser_use_action", None)
        if not callable(runtime_execute):
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=(
                    f"Browser Use runtime does not expose execute_browser_use_action for '{runtime_action}'"
                ),
                error_code="ACTION_UNSUPPORTED",
            )

        try:
            result = await runtime_execute(
                action=runtime_action,
                params=params,
            )
        except Exception as exc:
            error_text = str(exc)
            error_code = (
                "INVALID_ARGUMENT"
                if "invalid parameters" in error_text.lower()
                else "BROWSER_RUNTIME_ERROR"
            )
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=error_text,
                error_code=error_code,
            )

        if not isinstance(result, dict):
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=f"Browser Use action '{runtime_action}' returned invalid response",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if not result.get("success", False):
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=result.get("error", f"Browser Use action '{runtime_action}' failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        payload: dict[str, Any] = dict(result)
        payload["action"] = action
        payload["browser_use_action"] = runtime_action
        return AdapterActionResult(
            success=True,
            action=action,
            decision="port",
            data=payload,
        )

    def _build_browser_use_action_params(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        if action == "done":
            text = self._value_as_str(args.get("text"))
            if not text:
                return self._invalid_argument("done", "done requires non-empty 'text'")
            params: dict[str, Any] = {"text": text}
            if isinstance(args.get("success"), bool):
                params["success"] = bool(args.get("success"))
            files_to_display = args.get("files_to_display")
            if isinstance(files_to_display, list):
                params["files_to_display"] = [
                    str(path).strip()
                    for path in files_to_display
                    if isinstance(path, str) and path.strip()
                ]
            return params

        if action == "status":
            return {}

        if action == "get_tabs":
            return {}

        if action == "navigate":
            url = self._extract_url(args)
            if not url:
                return self._invalid_argument(
                    "navigate",
                    "navigate requires non-empty 'url'",
                )
            params = {"url": url}
            if isinstance(args.get("new_tab"), bool):
                params["new_tab"] = bool(args.get("new_tab"))
            return params

        if action == "snapshot":
            compatibility_fields = (
                "format",
                "snapshotFormat",
                "wait_until",
                "state",
                "mode",
                "max_chars",
                "refs",
                "interactive",
                "compact",
                "depth",
                "selector",
                "frame",
            )
            for field in compatibility_fields:
                if field in args:
                    return self._invalid_argument(
                        "snapshot",
                        (
                            f"snapshot no longer supports compatibility '{field}'; "
                            "use Browser Use snapshot semantics"
                        ),
                    )

            offset = args.get("offset")
            if offset is None:
                resolved_offset = 0
            elif isinstance(offset, int) and offset >= 0:
                resolved_offset = offset
            else:
                return self._invalid_argument(
                    "snapshot",
                    "snapshot offset must be a non-negative integer",
                )

            limit = args.get("limit")
            if limit is None:
                resolved_limit = 4000
            elif isinstance(limit, int) and limit > 0:
                resolved_limit = limit
            else:
                return self._invalid_argument(
                    "snapshot",
                    "snapshot limit must be a positive integer",
                )

            if resolved_offset + resolved_limit > MAX_SNAPSHOT_CAPTURE_CHARS:
                return self._invalid_argument(
                    "snapshot",
                    "offset + limit exceeds maximum snapshot window (120000)",
                )

            include_screenshot = bool(args.get("include_screenshot", False))
            return {
                "offset": resolved_offset,
                "limit": resolved_limit,
                "include_screenshot": include_screenshot,
            }

        if action == "search":
            query = self._value_as_str(args.get("query"))
            if not query:
                return self._invalid_argument("search", "search requires non-empty 'query'")
            params: dict[str, Any] = {"query": query}
            engine = self._value_as_str(args.get("engine"))
            if engine:
                params["engine"] = engine
            return params

        if action == "go_back":
            description = self._value_as_str(args.get("description"))
            return {"description": description} if description else {}

        if action == "search_page":
            pattern = self._value_as_str(args.get("pattern")) or self._value_as_str(
                args.get("query")
            )
            if not pattern:
                return self._invalid_argument(
                    "search_page",
                    "search_page requires non-empty 'pattern'",
                )
            params = {"pattern": pattern}
            if isinstance(args.get("regex"), bool):
                params["regex"] = bool(args.get("regex"))
            if isinstance(args.get("case_sensitive"), bool):
                params["case_sensitive"] = bool(args.get("case_sensitive"))
            context_chars = args.get("context_chars")
            if isinstance(context_chars, int) and context_chars >= 0:
                params["context_chars"] = context_chars
            css_scope = self._value_as_str(args.get("css_scope"))
            if css_scope:
                params["css_scope"] = css_scope
            max_results = args.get("max_results")
            if isinstance(max_results, int) and max_results > 0:
                params["max_results"] = max_results
            return params

        if action == "find_elements":
            selector = self._value_as_str(args.get("selector"))
            if not selector:
                return self._invalid_argument(
                    "find_elements",
                    "find_elements requires non-empty 'selector'",
                )
            params = {"selector": selector}
            attributes = args.get("attributes")
            if isinstance(attributes, list):
                params["attributes"] = [
                    str(attribute).strip()
                    for attribute in attributes
                    if isinstance(attribute, str) and attribute.strip()
                ]
            max_results = args.get("max_results")
            if isinstance(max_results, int) and max_results > 0:
                params["max_results"] = max_results
            if isinstance(args.get("include_text"), bool):
                params["include_text"] = bool(args.get("include_text"))
            return params

        if action == "find_text":
            text = self._value_as_str(args.get("text")) or self._value_as_str(
                args.get("pattern")
            )
            if not text:
                return self._invalid_argument(
                    "find_text",
                    "find_text requires non-empty 'text'",
                )
            return {"text": text}

        if action == "extract":
            if "mode" in args:
                return self._invalid_argument(
                    "extract",
                    "extract no longer supports compatibility 'mode'; use Browser Use extract semantics",
                )
            if "selector" in args:
                return self._invalid_argument(
                    "extract",
                    "extract no longer supports compatibility 'selector'; use Browser Use extract semantics",
                )
            if "frame" in args:
                return self._invalid_argument(
                    "extract",
                    "extract no longer supports compatibility 'frame'; use Browser Use extract semantics",
                )
            query = self._value_as_str(args.get("query"))
            if not query:
                return self._invalid_argument(
                    "extract",
                    "extract requires non-empty 'query'",
                )
            params = {"query": query}
            if isinstance(args.get("extract_links"), bool):
                params["extract_links"] = bool(args.get("extract_links"))
            start_from_char = args.get("start_from_char")
            if isinstance(start_from_char, int) and start_from_char >= 0:
                params["start_from_char"] = start_from_char
            output_schema = args.get("output_schema")
            if isinstance(output_schema, dict):
                params["output_schema"] = output_schema
            return params

        if action == "click":
            index = self._extract_index(args)
            if index is None:
                coordinate_x = self._extract_coordinate(args.get("coordinate_x"))
                coordinate_y = self._extract_coordinate(args.get("coordinate_y"))
                has_coordinate_x = coordinate_x is not None
                has_coordinate_y = coordinate_y is not None
                if has_coordinate_x != has_coordinate_y:
                    return self._invalid_argument(
                        "click",
                        "click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click",
                    )
                if has_coordinate_x and has_coordinate_y:
                    return {
                        "coordinate_x": coordinate_x,
                        "coordinate_y": coordinate_y,
                    }
                return self._invalid_argument(
                    "click",
                    "click requires integer 'index', numeric 'ref', or coordinate pair 'coordinate_x'/'coordinate_y'",
                )
            return {"index": index}

        if action == "input":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "input",
                    "input requires integer 'index' or numeric 'ref'",
                )
            text = args.get("text")
            if not isinstance(text, str):
                return self._invalid_argument("input", "input requires string 'text'")
            params = {
                "index": index,
                "text": text,
            }
            if isinstance(args.get("clear"), bool):
                params["clear"] = bool(args.get("clear"))
            elif isinstance(args.get("clear_first"), bool):
                params["clear"] = bool(args.get("clear_first"))
            return params

        if action == "send_keys":
            keys = self._value_as_str(args.get("keys")) or self._value_as_str(
                args.get("key")
            )
            if not keys:
                return self._invalid_argument(
                    "send_keys",
                    "send_keys requires non-empty 'keys'",
                )
            return {"keys": keys}

        if action == "wait":
            if "state" in args:
                return self._invalid_argument(
                    "wait",
                    "wait no longer supports compatibility 'state'; provide Browser Use 'seconds'",
                )
            seconds = args.get("seconds")
            if isinstance(seconds, (int, float)):
                return {"seconds": max(0, int(round(float(seconds))))}
            return {}

        if action == "scroll":
            params: dict[str, Any] = {}
            index = self._extract_index(args)
            if index is not None:
                params["index"] = index
            pages = args.get("pages")
            if (
                isinstance(pages, (int, float))
                and not isinstance(pages, bool)
                and float(pages) > 0
            ):
                params["pages"] = float(pages)
            amount = args.get("amount")
            if (
                "pages" not in params
                and isinstance(amount, (int, float))
                and not isinstance(amount, bool)
            ):
                params["pages"] = max(0.1, abs(float(amount)) / 500.0)
            direction = self._value_as_str(args.get("direction"))
            if direction:
                params["down"] = direction.lower() not in {"up", "left"}
            elif isinstance(args.get("down"), bool):
                params["down"] = bool(args.get("down"))
            return params

        if action == "screenshot":
            if "full_page" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'full_page'; only Browser Use screenshot parameters are supported",
                )
            if "ref" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'ref'; only Browser Use screenshot parameters are supported",
                )
            if "element" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'element'; only Browser Use screenshot parameters are supported",
                )
            if "type" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'type'; only Browser Use screenshot parameters are supported",
                )
            if "quality" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'quality'; only Browser Use screenshot parameters are supported",
                )
            file_name = self._value_as_str(args.get("file_name"))
            return {"file_name": file_name} if file_name else {}

        if action == "evaluate":
            code = self._value_as_str(args.get("code")) or self._value_as_str(
                args.get("script")
            )
            if not code:
                return self._invalid_argument(
                    "evaluate",
                    "evaluate requires non-empty 'code' or 'script'",
                )
            return {"code": code}

        if action == "switch":
            tab_id = self._extract_tab_id(args)
            if not tab_id:
                return self._invalid_argument(
                    "switch",
                    "switch requires non-empty 'tab_id' or 'target_id'",
                )
            return {"tab_id": tab_id}

        if action == "close":
            tab_id = self._extract_tab_id(args)
            if not tab_id:
                return self._invalid_argument(
                    "close",
                    "close requires non-empty 'tab_id' or 'target_id'",
                )
            return {"tab_id": tab_id}

        if action == "close_tab":
            tab_id = self._extract_tab_id(args)
            if not tab_id:
                return self._invalid_argument(
                    "close_tab",
                    "close_tab requires non-empty 'tab_id' or 'target_id'",
                )
            return {"tab_id": tab_id}

        if action == "dropdown_options":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "dropdown_options",
                    "dropdown_options requires integer 'index' or numeric 'ref'",
                )
            return {"index": index}

        if action == "select_dropdown":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "select_dropdown",
                    "select_dropdown requires integer 'index' or numeric 'ref'",
                )
            text = self._value_as_str(args.get("text"))
            if not text:
                return self._invalid_argument(
                    "select_dropdown",
                    "select_dropdown requires non-empty 'text'",
                )
            return {"index": index, "text": text}

        if action == "upload_file":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "upload_file",
                    "upload_file requires integer 'index' or numeric 'ref'",
                )
            path = self._value_as_str(args.get("path"))
            if not path:
                paths = args.get("paths")
                if isinstance(paths, list) and paths:
                    first = paths[0]
                    if isinstance(first, str) and first.strip():
                        path = first.strip()
            if not path:
                return self._invalid_argument(
                    "upload_file",
                    "upload_file requires non-empty 'path' (or first entry in 'paths')",
                )
            return {"index": index, "path": path}

        if action == "write_file":
            file_name = self._value_as_str(args.get("file_name"))
            content = args.get("content")
            if not file_name:
                return self._invalid_argument(
                    "write_file",
                    "write_file requires non-empty 'file_name'",
                )
            if not isinstance(content, str):
                return self._invalid_argument(
                    "write_file",
                    "write_file requires string 'content'",
                )
            params = {"file_name": file_name, "content": content}
            for key in ("append", "trailing_newline", "leading_newline"):
                value = args.get(key)
                if isinstance(value, bool):
                    params[key] = value
            return params

        if action == "replace_file":
            file_name = self._value_as_str(args.get("file_name"))
            old_str = args.get("old_str")
            new_str = args.get("new_str")
            if not file_name:
                return self._invalid_argument(
                    "replace_file",
                    "replace_file requires non-empty 'file_name'",
                )
            if not isinstance(old_str, str) or not isinstance(new_str, str):
                return self._invalid_argument(
                    "replace_file",
                    "replace_file requires string 'old_str' and 'new_str'",
                )
            return {"file_name": file_name, "old_str": old_str, "new_str": new_str}

        if action == "read_file":
            file_name = self._value_as_str(args.get("file_name"))
            if not file_name:
                return self._invalid_argument(
                    "read_file",
                    "read_file requires non-empty 'file_name'",
                )
            return {"file_name": file_name}

        if action == "read_long_content":
            goal = self._value_as_str(args.get("goal")) or self._value_as_str(
                args.get("query")
            )
            if not goal:
                return self._invalid_argument(
                    "read_long_content",
                    "read_long_content requires non-empty 'goal'",
                )
            params = {"goal": goal}
            source = self._value_as_str(args.get("source"))
            if source:
                params["source"] = source
            context = self._value_as_str(args.get("context"))
            if context:
                params["context"] = context
            return params

        return self._invalid_argument(
            action,
            f"Unsupported Browser Use action '{action}'",
        )

    async def console(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("console")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        level = self._value_as_str(args.get("level"))
        limit = int(args["limit"]) if isinstance(args.get("limit"), (int, float)) else 100
        clear = bool(args.get("clear", False))
        messages = await self._maybe_await(
            self._controller.get_console_messages(
                level=level,
                limit=limit,
                clear=clear,
            )
        )
        if not isinstance(messages, list):
            messages = []

        return AdapterActionResult(
            success=True,
            action="console",
            decision="compat",
            data={
                "action": "console",
                "level": level,
                "count": len(messages),
                "messages": messages,
                "cleared": clear,
            },
        )

    async def errors(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("errors")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        limit = int(args["limit"]) if isinstance(args.get("limit"), (int, float)) else 100
        clear = bool(args.get("clear", False))
        errors = await self._maybe_await(
            self._controller.get_page_errors(limit=limit, clear=clear)
        )
        if not isinstance(errors, list):
            errors = []
        return AdapterActionResult(
            success=True,
            action="errors",
            decision="compat",
            data={
                "action": "errors",
                "count": len(errors),
                "errors": errors,
                "cleared": clear,
            },
        )

    async def requests(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("requests")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        limit = int(args["limit"]) if isinstance(args.get("limit"), (int, float)) else 100
        contains = args.get("contains")
        if contains is None:
            contains = args.get("filter")
        contains = contains if isinstance(contains, str) else None
        clear = bool(args.get("clear", False))
        requests = await self._maybe_await(
            self._controller.get_network_requests(
                limit=limit,
                contains=contains,
                clear=clear,
            )
        )
        if not isinstance(requests, list):
            requests = []
        return AdapterActionResult(
            success=True,
            action="requests",
            decision="compat",
            data={
                "action": "requests",
                "count": len(requests),
                "requests": requests,
                "cleared": clear,
            },
        )

    async def trace_start(self, args: Mapping[str, Any]) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action="trace_start",
            decision="deprecate",
            error=TRACE_DEPRECATION_MESSAGE,
            error_code="ACTION_DEPRECATED",
            deprecation=TRACE_DEPRECATION_MESSAGE,
        )

    async def trace_stop(self) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action="trace_stop",
            decision="deprecate",
            error=TRACE_DEPRECATION_MESSAGE,
            error_code="ACTION_DEPRECATED",
            deprecation=TRACE_DEPRECATION_MESSAGE,
        )

    async def pdf(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("pdf")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        pdf_bytes = await self._controller.pdf()
        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        return AdapterActionResult(
            success=True,
            action="pdf",
            decision="compat",
            data={
                "action": "pdf",
                "format": "pdf",
                "pdf_data": pdf_b64,
                "pdf_size_bytes": len(pdf_bytes),
            },
        )

    async def upload(self, args: Mapping[str, Any]) -> AdapterActionResult:
        ref = (
            self._value_as_str(args.get("inputRef"))
            or self._value_as_str(args.get("input_ref"))
            or self._value_as_str(args.get("ref"))
        )
        upload_result = await self.execute_browser_use_action(
            "upload_file",
            {
                **dict(args),
                "action": "upload_file",
                "ref": ref,
            },
        )
        upload_result = self._retag_action(upload_result, "upload")
        if not upload_result.success:
            return upload_result
        payload = dict(upload_result.data)
        payload["action"] = "upload"
        payload["browser_use_action"] = "upload_file"
        return AdapterActionResult(
            success=True,
            action="upload",
            decision=upload_result.decision,
            data=payload,
            warnings=list(upload_result.warnings),
        )

    async def dialog(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("dialog")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        accept = bool(args.get("accept", True))
        prompt_text = args.get("promptText")
        if prompt_text is None:
            prompt_text = args.get("prompt_text")
        if prompt_text is not None and not isinstance(prompt_text, str):
            return self._invalid_argument(
                "dialog",
                "promptText/prompt_text must be a string when provided",
            )

        timeout_raw = args.get("timeoutMs")
        if timeout_raw is None:
            timeout_raw = args.get("timeout_ms")
        timeout_ms = int(timeout_raw) if isinstance(timeout_raw, (int, float)) else 0

        clear = bool(args.get("clear", False))
        if clear:
            await self._maybe_await(self._controller.get_dialog_events(clear=True))

        self._controller.arm_dialog(accept=accept, prompt_text=prompt_text)

        if timeout_ms > 0:
            event = await self._controller.wait_for_dialog(timeout_ms=timeout_ms)
            if not event:
                return AdapterActionResult(
                    success=False,
                    action="dialog",
                    decision="compat",
                    error=f"No dialog received within {timeout_ms}ms",
                    error_code="ACTION_TIMEOUT",
                )
            return AdapterActionResult(
                success=True,
                action="dialog",
                decision="compat",
                data={
                    "action": "dialog",
                    "armed": False,
                    "accept": accept,
                    "handled": event,
                },
            )

        recent = await self._maybe_await(
            self._controller.get_dialog_events(limit=10, clear=False)
        )
        if not isinstance(recent, list):
            recent = []
        return AdapterActionResult(
            success=True,
            action="dialog",
            decision="compat",
            data={
                "action": "dialog",
                "armed": True,
                "accept": accept,
                "prompt_text": prompt_text,
                "recent": recent,
            },
        )

    async def cookies(self) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("cookies")
        cookies = await self._controller.get_cookies()
        return AdapterActionResult(
            success=True,
            action="cookies",
            decision="compat",
            data={
                "action": "cookies",
                "count": len(cookies),
                "cookies": cookies,
            },
        )

    async def cookies_set(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("cookies_set")
        cookies = args.get("cookies")
        if not isinstance(cookies, list) or not cookies:
            return self._invalid_argument(
                "cookies_set",
                "cookies_set requires non-empty 'cookies' array",
            )
        result = await self._controller.set_cookies(cookies)
        if result.get("success"):
            payload = {"action": "cookies_set", **result}
            return AdapterActionResult(
                success=True,
                action="cookies_set",
                decision="compat",
                data=payload,
            )
        return AdapterActionResult(
            success=False,
            action="cookies_set",
            decision="compat",
            error=result.get("error", "Setting cookies failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def cookies_clear(self) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("cookies_clear")
        result = await self._controller.clear_cookies()
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="cookies_clear",
                decision="compat",
                data={"action": "cookies_clear"},
            )
        return AdapterActionResult(
            success=False,
            action="cookies_clear",
            decision="compat",
            error=result.get("error", "Clearing cookies failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def storage_get(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("storage_get")
        kind = self._normalize_storage_kind(args)
        data = await self._controller.get_storage(kind)
        return AdapterActionResult(
            success=True,
            action="storage_get",
            decision="compat",
            data={
                "action": "storage_get",
                "kind": kind,
                "count": len(data),
                "values": data,
            },
        )

    async def storage_set(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("storage_set")
        kind = self._normalize_storage_kind(args)

        values = args.get("values")
        if not isinstance(values, dict):
            key = args.get("key")
            value = args.get("value")
            if isinstance(key, str):
                values = {key: "" if value is None else str(value)}
            else:
                return self._invalid_argument(
                    "storage_set",
                    "storage_set requires 'values' object or 'key'/'value'",
                )
        normalized = {str(key): str(value) for key, value in values.items()}
        result = await self._controller.set_storage(kind, normalized)
        return AdapterActionResult(
            success=True,
            action="storage_set",
            decision="compat",
            data={"action": "storage_set", "kind": kind, **result},
        )

    async def storage_clear(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("storage_clear")
        kind = self._normalize_storage_kind(args)
        result = await self._controller.clear_storage(kind)
        return AdapterActionResult(
            success=True,
            action="storage_clear",
            decision="compat",
            data={"action": "storage_clear", "kind": kind, **result},
        )

    async def set_offline(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_offline")
        offline = bool(args.get("offline", args.get("enabled", True)))
        result = await self._controller.set_offline(offline)
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_offline",
                decision="compat",
                data={"action": "set_offline", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_offline",
            decision="compat",
            error=result.get("error", "set_offline failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_headers(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_headers")
        if bool(args.get("clear", False)):
            result = await self._controller.set_headers({})
        else:
            headers = args.get("headers")
            if not isinstance(headers, dict):
                return self._invalid_argument(
                    "set_headers",
                    "set_headers requires 'headers' object or clear=true",
                )
            result = await self._controller.set_headers(
                {str(key): str(value) for key, value in headers.items()}
            )
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_headers",
                decision="compat",
                data={"action": "set_headers", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_headers",
            decision="compat",
            error=result.get("error", "set_headers failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_credentials(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_credentials")
        clear = bool(args.get("clear", False))
        username = args.get("username")
        if username is None:
            username = args.get("user")
        password = args.get("password")
        result = await self._controller.set_http_credentials(
            username=str(username) if username is not None else None,
            password=str(password) if password is not None else None,
            clear=clear,
        )
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_credentials",
                decision="compat",
                data={"action": "set_credentials", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_credentials",
            decision="compat",
            error=result.get("error", "set_credentials failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_geolocation(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_geolocation")
        clear = bool(args.get("clear", False))
        latitude = args.get("latitude")
        longitude = args.get("longitude")
        accuracy = args.get("accuracy")
        result = await self._controller.set_geolocation(
            latitude=float(latitude) if isinstance(latitude, (int, float)) else None,
            longitude=float(longitude) if isinstance(longitude, (int, float)) else None,
            accuracy=float(accuracy) if isinstance(accuracy, (int, float)) else None,
            clear=clear,
        )
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_geolocation",
                decision="compat",
                data={"action": "set_geolocation", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_geolocation",
            decision="compat",
            error=result.get("error", "set_geolocation failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_media(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_media")
        media = self._value_as_str(args.get("media"))
        color_scheme = args.get("color_scheme")
        if color_scheme is None:
            color_scheme = args.get("colorScheme")
        color_scheme = color_scheme if isinstance(color_scheme, str) else None
        result = await self._controller.set_media(
            media=media,
            color_scheme=color_scheme,
        )
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_media",
                decision="compat",
                data={"action": "set_media", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_media",
            decision="compat",
            error=result.get("error", "set_media failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_timezone(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_timezone")
        timezone = self._value_as_str(args.get("timezone"))
        if not timezone:
            return self._invalid_argument(
                "set_timezone",
                "set_timezone requires non-empty 'timezone'",
            )
        result = await self._controller.set_timezone(timezone)
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_timezone",
                decision="compat",
                data={"action": "set_timezone", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_timezone",
            decision="compat",
            error=result.get("error", "set_timezone failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_locale(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_locale")
        locale = self._value_as_str(args.get("locale"))
        if not locale:
            return self._invalid_argument(
                "set_locale",
                "set_locale requires non-empty 'locale'",
            )
        result = await self._controller.set_locale(locale)
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_locale",
                decision="compat",
                data={"action": "set_locale", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_locale",
            decision="compat",
            error=result.get("error", "set_locale failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def set_device(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("set_device")
        device = self._value_as_str(args.get("device"))
        if not device:
            return self._invalid_argument(
                "set_device",
                "set_device requires non-empty 'device'",
            )
        result = await self._controller.set_device(device)
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="set_device",
                decision="compat",
                data={"action": "set_device", **result},
            )
        return AdapterActionResult(
            success=False,
            action="set_device",
            decision="compat",
            error=result.get("error", "set_device failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def act(self, args: Mapping[str, Any]) -> AdapterActionResult:
        request = args.get("request")
        if not isinstance(request, dict):
            return self._invalid_argument("act", "act requires a 'request' object")

        kind_value = request.get("kind")
        if not isinstance(kind_value, str) or not kind_value.strip():
            return self._invalid_argument("act", "act.request.kind is required")

        kind = kind_value.strip().lower()
        merged: dict[str, Any] = dict(args)
        merged.update(request)

        if kind == "click":
            click_result = await self.execute("click", {"action": "click", **merged})
            return self._retag_action(click_result, "click")

        if kind == "type":
            type_args = {"action": "type", **merged}
            type_result = await self.type_text(type_args)
            return self._retag_action(type_result, "type")

        if kind == "press":
            press_args = {"action": "press", "key": merged.get("key"), **merged}
            press_result = await self.press(press_args)
            return self._retag_action(press_result, "press")

        if kind in ACT_EXECUTE_FORWARD_ACTIONS:
            forward_result = await self.execute(kind, {"action": kind, **merged})
            return self._retag_action(forward_result, kind)

        if kind in DEPRECATED_LEGACY_ACT_KINDS:
            return self._deprecated_action(
                "act",
                f"act.{kind} is deprecated in Browser Use-only runtime mode.",
            )

        if kind == "wait":
            time_ms = merged.get("timeMs")
            wait_args = {"action": "wait", **merged}
            if isinstance(time_ms, (int, float)):
                wait_args["seconds"] = max(0.0, float(time_ms) / 1000.0)
            wait_result = await self.execute("wait", wait_args)
            return self._retag_action(wait_result, "wait")

        if kind == "evaluate":
            fn = merged.get("fn")
            evaluate_args = {"action": "evaluate", **merged}
            if isinstance(fn, str) and fn:
                evaluate_args["script"] = fn
            evaluate_result = await self.execute("evaluate", evaluate_args)
            return self._retag_action(evaluate_result, "evaluate")

        if kind in BROWSER_USE_DIRECT_ACTIONS:
            browser_use_result = await self.execute_browser_use_action(kind, merged)
            return self._retag_action(browser_use_result, kind)

        if kind == "close":
            if self._extract_tab_id(merged):
                close_tab_result = await self.execute_browser_use_action("close", merged)
                return self._retag_action(close_tab_result, "close")
            close_result = await self.close()
            return self._retag_action(close_result, "close")

        return AdapterActionResult(
            success=False,
            action="act",
            decision="compat",
            error=f"Unsupported act kind: {kind}",
            error_code="ACTION_UNSUPPORTED",
        )

    async def close(self) -> AdapterActionResult:
        await self._runtime.close()
        return AdapterActionResult(
            success=True,
            action="close",
            decision="port",
            data={
                "action": "close",
                "status": "closed",
            },
        )

    async def _focus_target_if_requested(
        self,
        args: Mapping[str, Any],
    ) -> AdapterActionResult | None:
        target_id = self._extract_target_id(args)
        if not target_id:
            return None
        switch_result = await self.execute_browser_use_action(
            "switch",
            {
                "action": "switch",
                "target_id": target_id,
            },
        )
        if switch_result.success:
            return None
        return AdapterActionResult(
            success=False,
            action="switch_tab",
            decision="port",
            error=switch_result.error or f"Tab not found: {target_id}",
            error_code=switch_result.error_code or "TAB_NOT_FOUND",
        )

    @staticmethod
    def _extract_url(args: Mapping[str, Any]) -> str | None:
        for key in ("url", "target_url", "targetUrl"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _extract_target_id(args: Mapping[str, Any]) -> str | None:
        for key in ("target_id", "targetId"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _extract_tab_id(args: Mapping[str, Any]) -> str | None:
        raw_tab_id = args.get("tab_id")
        if isinstance(raw_tab_id, str) and raw_tab_id.strip():
            tab_id = raw_tab_id.strip()
            return tab_id[-4:] if len(tab_id) > 4 else tab_id
        target_id = BrowserUseCompatibilityAdapter._extract_target_id(args)
        if target_id:
            return target_id[-4:] if len(target_id) > 4 else target_id
        return None

    @staticmethod
    def _extract_index(args: Mapping[str, Any]) -> int | None:
        index = args.get("index")
        if isinstance(index, int) and index >= 0:
            return index
        if isinstance(index, float) and index.is_integer() and index >= 0:
            return int(index)
        ref = args.get("ref")
        if isinstance(ref, str) and ref.strip().isdigit():
            return int(ref.strip())
        return None

    @staticmethod
    def _extract_coordinate(value: Any) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(round(value))
        return None

    @staticmethod
    def _value_as_str(value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return None

    @staticmethod
    def _tab_to_payload(tab: Any) -> dict[str, str]:
        if isinstance(tab, Mapping):
            target_id = tab.get("target_id", "")
            title = tab.get("title", "")
            url = tab.get("url", "")
        else:
            target_id = getattr(tab, "target_id", "")
            title = getattr(tab, "title", "")
            url = getattr(tab, "url", "")
        return {
            "target_id": target_id if isinstance(target_id, str) else str(target_id),
            "title": title if isinstance(title, str) else str(title),
            "url": url if isinstance(url, str) else str(url),
        }

    @staticmethod
    async def _maybe_await(value: Any) -> Any:
        if hasattr(value, "__await__"):
            return await value
        return value

    @staticmethod
    def _normalize_storage_kind(args: Mapping[str, Any]) -> str:
        kind = args.get("kind")
        if not isinstance(kind, str):
            kind = "local"
        kind = kind.strip().lower()
        return "session" if kind == "session" else "local"

    @staticmethod
    def _snapshot_ref_count(snapshot: Any) -> int:
        ref_count = getattr(snapshot, "ref_count", None)
        if isinstance(ref_count, int) and ref_count >= 0:
            return ref_count
        return 0

    async def _capture_ai_snapshot_with_zero_ref_fallback(
        self,
        *,
        max_chars: int,
        refs_mode: str | None,
        interactive: bool | None,
        compact: bool | None,
        depth: int | None,
        selector: str | None,
        frame_selector: str | None,
        enable_zero_ref_fallback: bool,
    ) -> Any:
        snapshot = await self._runtime.get_page_snapshot(
            format_type="ai",
            max_chars=max_chars,
            refs_mode=refs_mode,
            interactive=interactive,
            compact=compact,
            depth=depth,
            selector=selector,
            frame_selector=frame_selector,
        )
        if not enable_zero_ref_fallback or self._snapshot_ref_count(snapshot) > 0:
            return snapshot

        fallback_snapshot = snapshot
        is_role_snapshot_path = (
            refs_mode in ("role", "aria")
            or interactive is True
            or compact is True
            or depth is not None
            or bool((selector or "").strip())
            or bool((frame_selector or "").strip())
        )
        if is_role_snapshot_path:
            try:
                fallback_snapshot = await self._runtime.get_page_snapshot(
                    format_type="ai",
                    max_chars=max_chars,
                    refs_mode=refs_mode,
                    interactive=interactive,
                    compact=compact,
                    depth=max(depth or 0, AI_SNAPSHOT_ZERO_REF_FALLBACK_DEPTH),
                    selector=selector,
                    frame_selector=frame_selector,
                )
                if self._snapshot_ref_count(fallback_snapshot) > 0:
                    return fallback_snapshot
            except Exception:
                pass

        if selector or frame_selector:
            return fallback_snapshot

        try:
            flat_snapshot = await self._runtime.get_page_snapshot(
                format_type="ai",
                max_chars=max_chars,
                refs_mode=None,
                interactive=None,
                compact=None,
                depth=None,
                selector=None,
                frame_selector=None,
            )
            return flat_snapshot
        except Exception:
            return fallback_snapshot

    @staticmethod
    def _resolve_wait_until(
        args: Mapping[str, Any],
        default: str = "load",
    ) -> tuple[str, str | None]:
        candidate = args.get("wait_until")
        if candidate is None:
            candidate = args.get("state")
        if candidate is None:
            return default, None
        if not isinstance(candidate, str):
            return (
                "",
                "wait_until must be one of: load, domcontentloaded, networkidle, commit",
            )
        wait_until = candidate.strip().lower()
        if wait_until not in SNAPSHOT_WAIT_STATES:
            return (
                "",
                "wait_until must be one of: load, domcontentloaded, networkidle, commit",
            )
        if wait_until == "commit":
            return "load", None
        return wait_until, None

    @staticmethod
    def _resolve_extract_mode(raw_mode: Any) -> str | None:
        if raw_mode is None:
            return DEFAULT_EXTRACT_MODE
        if not isinstance(raw_mode, str):
            return None
        normalized = raw_mode.strip().lower()
        if normalized in ("focused", "full_text", "structured"):
            return normalized
        return None

    @staticmethod
    def _query_tokens(query: str) -> list[str]:
        tokens = re.findall(r"[a-z0-9]{3,}", query.lower())
        seen: set[str] = set()
        unique: list[str] = []
        for token in tokens:
            if token in seen:
                continue
            seen.add(token)
            unique.append(token)
        return unique

    @classmethod
    def _extract_relevant_content(cls, source: str, query: str) -> str:
        source = (source or "").strip()
        if not source:
            return ""

        query_text = query.strip().lower()
        tokens = cls._query_tokens(query)
        lines = [line.strip() for line in source.splitlines() if line.strip()]
        if not lines:
            return ""

        selected: list[str] = []
        seen_lines: set[str] = set()

        def add_line(line: str) -> None:
            if line in seen_lines:
                return
            seen_lines.add(line)
            selected.append(line)

        for idx, line in enumerate(lines):
            lower_line = line.lower()
            matches_exact = bool(query_text) and query_text in lower_line
            matches_tokens = any(token in lower_line for token in tokens)
            if not (matches_exact or matches_tokens):
                continue
            if idx > 0:
                add_line(lines[idx - 1])
            add_line(line)
            if idx + 1 < len(lines):
                add_line(lines[idx + 1])
            if len(selected) >= 220:
                break

        if not selected:
            return source
        return "\n".join(selected)

    @staticmethod
    def _build_extract_script(
        *,
        extract_links: bool,
        max_links: int,
        selector: str | None,
        frame_selector: str | None,
        max_tables: int,
        max_rows_per_table: int,
        max_lists: int,
        max_items_per_list: int,
    ) -> str:
        include_links_js = "true" if extract_links else "false"
        max_links_js = str(max_links)
        selector_js = json.dumps(selector if selector else "")
        frame_selector_js = json.dumps(frame_selector if frame_selector else "")
        max_tables_js = str(max_tables)
        max_rows_per_table_js = str(max_rows_per_table)
        max_lists_js = str(max_lists)
        max_items_per_list_js = str(max_items_per_list)
        return f"""
() => {{
  try {{
    const scopeSelector = {selector_js};
    const frameSelector = {frame_selector_js};
    let sourceDoc = document;

    if (frameSelector) {{
      const frameEl = document.querySelector(frameSelector);
      if (!frameEl) {{
        return {{
          error: `Frame not found for selector: ${{frameSelector}}`,
          title: document.title || "",
          url: String(location.href || ""),
          content: "",
          structured: {{ tables: [], lists: [] }},
        }};
      }}
      const frameDoc = frameEl.contentDocument;
      if (!frameDoc) {{
        return {{
          error: `Frame content is not accessible for selector: ${{frameSelector}}`,
          title: document.title || "",
          url: String(location.href || ""),
          content: "",
          structured: {{ tables: [], lists: [] }},
        }};
      }}
      sourceDoc = frameDoc;
    }}

    const body = sourceDoc.body;
    const title = sourceDoc.title || document.title || "";
    let url = String(location.href || "");
    try {{
      url = String(sourceDoc.location?.href || location.href || "");
    }} catch (_e) {{
      url = String(location.href || "");
    }}

    if (!body) {{
      return {{ title, url, content: "" }};
    }}

    const root = scopeSelector ? sourceDoc.querySelector(scopeSelector) : body;
    if (!root) {{
      return {{
        error: `Selector not found: ${{scopeSelector}}`,
        title,
        url,
        content: "",
        structured: {{ tables: [], lists: [] }},
      }};
    }}

    const clone = root.cloneNode(true);
    const removeSelectors = [
      "script", "style", "noscript", "template", "svg", "canvas",
      "iframe", "object", "embed"
    ];
    for (const sel of removeSelectors) {{
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    }}

    const normalizeHeaders = (rawHeaders, width) => {{
      const headers = [];
      const used = new Map();
      const total = Math.max(rawHeaders.length, width);
      for (let idx = 0; idx < total; idx += 1) {{
        const raw = (rawHeaders[idx] || "").replace(/\\s+/g, " ").trim();
        const base = raw || `col_${{idx + 1}}`;
        const seen = used.get(base) || 0;
        used.set(base, seen + 1);
        headers.push(seen === 0 ? base : `${{base}}_${{seen + 1}}`);
      }}
      return headers;
    }};

    const tables = [];
    const tableNodes = Array.from(clone.querySelectorAll("table")).slice(0, {max_tables_js});
    for (const [tableIdx, table] of tableNodes.entries()) {{
      const caption = ((table.querySelector("caption")?.textContent) || "")
        .replace(/\\s+/g, " ")
        .trim();

      const allRows = Array.from(table.querySelectorAll("tr"));
      let headerCells = [];
      let headerRowIndex = -1;

      const theadRow = table.querySelector("thead tr");
      if (theadRow) {{
        headerRowIndex = allRows.indexOf(theadRow);
        headerCells = Array.from(theadRow.querySelectorAll("th, td"))
          .map((cell) => (cell.textContent || "").replace(/\\s+/g, " ").trim())
          .filter((cell) => Boolean(cell));
      }} else if (allRows.length > 0) {{
        const firstRowCells = Array.from(allRows[0].querySelectorAll("th, td"));
        const hasHeaderLikeCells = firstRowCells.some((cell) => cell.tagName.toLowerCase() === "th");
        if (hasHeaderLikeCells) {{
          headerRowIndex = 0;
          headerCells = firstRowCells
            .map((cell) => (cell.textContent || "").replace(/\\s+/g, " ").trim())
            .filter((cell) => Boolean(cell));
        }}
      }}

      const rows = [];
      for (const [rowIdx, row] of allRows.entries()) {{
        if (rowIdx === headerRowIndex) {{
          continue;
        }}
        const cells = Array.from(row.querySelectorAll("th, td"))
          .map((cell) => (cell.textContent || "").replace(/\\s+/g, " ").trim());
        if (!cells.some((cell) => Boolean(cell))) {{
          continue;
        }}
        rows.push(cells);
        if (rows.length >= {max_rows_per_table_js}) {{
          break;
        }}
      }}

      const tableWidth = rows.reduce((maxCols, row) => Math.max(maxCols, row.length), 0);
      const headers = normalizeHeaders(headerCells, tableWidth);
      const rowObjects = rows.map((row) => {{
        const rowObj = {{}};
        for (let idx = 0; idx < headers.length; idx += 1) {{
          rowObj[headers[idx]] = (row[idx] || "").trim();
        }}
        return rowObj;
      }});

      tables.push({{
        index: tableIdx + 1,
        caption,
        headers,
        rows,
        row_objects: rowObjects,
        row_count: rows.length,
      }});
    }}

    const lists = [];
    const listNodes = Array.from(clone.querySelectorAll("ul, ol")).slice(0, {max_lists_js});
    for (const [listIdx, list] of listNodes.entries()) {{
      const items = Array.from(list.querySelectorAll(":scope > li"))
        .map((li) => (li.textContent || "").replace(/\\s+/g, " ").trim())
        .filter((txt) => Boolean(txt))
        .slice(0, {max_items_per_list_js});
      if (!items.length) {{
        continue;
      }}
      lists.push({{
        index: listIdx + 1,
        kind: list.tagName.toLowerCase(),
        items,
      }});
    }}

    const structured = {{
      tables,
      lists,
      table_count: tables.length,
      list_count: lists.length,
    }};

    const headingLines = [];
    clone.querySelectorAll("h1, h2, h3").forEach((el) => {{
      const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
      if (text) {{
        headingLines.push(text);
      }}
    }});

    const lines = [];
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {{
      const node = walker.currentNode;
      const raw = node && node.nodeValue ? node.nodeValue : "";
      const text = raw.replace(/\\s+/g, " ").trim();
      if (!text) continue;

      const parent = node.parentElement;
      if (!parent) continue;
      const tag = String(parent.tagName || "").toLowerCase();
      if (["script", "style", "noscript", "svg", "canvas"].includes(tag)) continue;
      lines.push(text);
    }}

    const includeLinks = {include_links_js};
    const maxLinks = {max_links_js};
    const links = [];
    if (includeLinks) {{
      clone.querySelectorAll("a[href]").forEach((el) => {{
        if (links.length >= maxLinks) return;
        const href = (el.getAttribute("href") || "").trim();
        if (!href) return;
        const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
        links.push(text ? `${{text}} -> ${{href}}` : href);
      }});
    }}

    let content = "";
    if (headingLines.length) {{
      content += "Headings:\\n" + headingLines.join("\\n") + "\\n\\n";
    }}
    content += "Page Text:\\n" + lines.join("\\n");
    if (links.length) {{
      content += "\\n\\nLinks:\\n" + links.join("\\n");
    }}

    return {{
      title,
      url,
      content,
      structured,
      heading_count: headingLines.length,
      line_count: lines.length,
      link_count: links.length,
      table_count: tables.length,
      list_count: lists.length,
    }};
  }} catch (error) {{
    return {{
      error: (error && error.message) ? error.message : String(error || "unknown extract error"),
      title: document.title || "",
      url: String(location.href || ""),
      content: "",
      structured: {{ tables: [], lists: [] }},
    }};
  }}
}}
""".strip()

    @staticmethod
    def _retag_action(
        result: AdapterActionResult,
        action: str,
    ) -> AdapterActionResult:
        if result.action == action:
            return result
        data = dict(result.data)
        if result.success:
            data["action"] = action
        return AdapterActionResult(
            success=result.success,
            action=action,
            decision=result.decision,
            data=data,
            error=result.error,
            error_code=result.error_code,
            warnings=list(result.warnings),
            deprecation=result.deprecation,
        )

    @staticmethod
    def _invalid_argument(action: str, message: str) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=message,
            error_code="INVALID_ARGUMENT",
        )

    @staticmethod
    def _deprecated_action(action: str, message: str) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action=action,
            decision="deprecate",
            error=message,
            error_code="ACTION_DEPRECATED",
            deprecation=message,
        )

    @staticmethod
    def _not_connected(action: str) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error="Browser not connected. Run 'connect' action first.",
            error_code="BROWSER_NOT_CONNECTED",
        )


def get_browser_use_adapter(
    controller: BrowserControllerLike,
    runtime_provider: BrowserRuntimeProvider | None = None,
) -> BrowserUseCompatibilityAdapter:
    """Factory seam for adapter injection in tests and runtime caching."""
    if runtime_provider is not None:
        return BrowserUseCompatibilityAdapter(
            controller,
            runtime_provider=runtime_provider,
        )

    try:
        cached = _ADAPTER_CACHE_BY_CONTROLLER.get(controller)
        if cached is not None:
            return cached
    except TypeError:
        # Some test doubles (for example SimpleNamespace) are not weak-referenceable.
        # Skip caching for those objects.
        return BrowserUseCompatibilityAdapter(controller)

    adapter = BrowserUseCompatibilityAdapter(controller)
    try:
        _ADAPTER_CACHE_BY_CONTROLLER[controller] = adapter
    except TypeError:
        return adapter
    return adapter
