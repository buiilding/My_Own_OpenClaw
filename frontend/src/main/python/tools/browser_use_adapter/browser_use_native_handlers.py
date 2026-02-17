"""Browser Use native-runtime handler registry."""

from __future__ import annotations

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
                "Browser is not connected. Run browser_control connect first."
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
