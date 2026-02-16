"""Phase 2 browser adapter routing through the current browser controller seam.

This module defines the Browser Use adapter boundary and a compatibility
implementation that preserves existing browser_control payload contracts while
we migrate internals incrementally.
"""

from __future__ import annotations

import asyncio
import base64
from typing import Any, Mapping, Protocol

from tools.browser_use_adapter.types import AdapterActionResult


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


class BrowserUseCompatibilityAdapter:
    """Compatibility adapter for Phase 2 routing.

    This adapter intentionally keeps existing payload contracts stable while
    moving browser action execution behind an adapter seam.
    """

    def __init__(self, controller: BrowserControllerLike):
        self._controller = controller

    async def execute(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult:
        if action == "connect":
            return await self.connect(args)
        if action == "status":
            return await self.status()
        if action == "navigate":
            return await self.navigate(args)
        if action == "open":
            return await self.open(args)
        if action == "click":
            return await self.click(args)
        if action == "type":
            return await self.type_text(args)
        if action == "press":
            return await self.press(args)
        if action == "scroll":
            return await self.scroll(args)
        if action == "screenshot":
            return await self.screenshot(args)
        if action == "wait":
            return await self.wait(args)
        if action == "get_tabs":
            return await self.get_tabs()
        if action == "switch_tab":
            return await self.switch_tab(args)
        if action == "evaluate":
            return await self.evaluate(args)
        if action == "console":
            return await self.console(args)
        if action == "errors":
            return await self.errors(args)
        if action == "requests":
            return await self.requests(args)
        if action == "trace_start":
            return await self.trace_start(args)
        if action == "trace_stop":
            return await self.trace_stop()
        if action == "pdf":
            return await self.pdf(args)
        if action == "upload":
            return await self.upload(args)
        if action == "dialog":
            return await self.dialog(args)
        if action == "cookies":
            return await self.cookies()
        if action == "cookies_set":
            return await self.cookies_set(args)
        if action == "cookies_clear":
            return await self.cookies_clear()
        if action == "storage_get":
            return await self.storage_get(args)
        if action == "storage_set":
            return await self.storage_set(args)
        if action == "storage_clear":
            return await self.storage_clear(args)
        if action == "set_offline":
            return await self.set_offline(args)
        if action == "set_headers":
            return await self.set_headers(args)
        if action == "set_credentials":
            return await self.set_credentials(args)
        if action == "set_geolocation":
            return await self.set_geolocation(args)
        if action == "set_media":
            return await self.set_media(args)
        if action == "set_timezone":
            return await self.set_timezone(args)
        if action == "set_locale":
            return await self.set_locale(args)
        if action == "set_device":
            return await self.set_device(args)
        if action == "close":
            return await self.close()

        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=f"Unhandled action: {action}",
            error_code="ACTION_UNSUPPORTED",
        )

    async def connect(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if self._controller.is_connected:
            await self._controller.close()

        mode = self._value_as_str(args.get("mode")) or "user_chrome"
        try:
            if mode == "user_chrome":
                result = await self._controller.auto_connect_to_chrome(
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
                result = await self._controller.launch_managed_browser(
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
        status = await self._controller.get_status()
        return AdapterActionResult(
            success=True,
            action="status",
            decision="compat",
            data={
                "action": "status",
                "connected": status["connected"],
                "mode": status.get("mode"),
                "url": status.get("url", ""),
                "title": status.get("title", ""),
                "tab_count": status.get("tab_count", 0),
                "target_id": status.get("target_id"),
            },
        )

    async def navigate(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("navigate")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        url = self._extract_url(args)
        if not url:
            return self._invalid_argument("navigate", "Missing required 'url' parameter")

        result = await self._controller.navigate(
            url,
            self._value_as_str(args.get("wait_until")) or "load",
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
        if not self._controller.is_connected:
            return self._not_connected("open")

        url = self._extract_url(args) or "about:blank"
        result = await self._controller.open_tab(url=url)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="open",
                decision="port",
                error=result.get("error", "Open failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="open",
            decision="port",
            data={
                "action": "open",
                "target_id": result["target_id"],
                "url": result["url"],
                "title": result["title"],
                "status": result.get("status"),
            },
        )

    async def click(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("click")

        ref = self._value_as_str(args.get("ref"))
        if not ref:
            return self._invalid_argument("click", "Missing required 'ref' parameter")

        double_click = bool(args.get("double_click", False))
        button = self._value_as_str(args.get("button")) or "left"
        result = await self._controller.click(
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
        if not self._controller.is_connected:
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

        submit = bool(args.get("submit", False))
        clear_first = bool(args.get("clear_first", False))
        result = await self._controller.type_text(
            ref=ref,
            text=text,
            submit=submit,
            clear_first=clear_first,
        )
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="type",
                decision="compat",
                error=result.get("error", "Type failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )
        return AdapterActionResult(
            success=True,
            action="type",
            decision="compat",
            data={
                "action": "type",
                "ref": ref,
                "text": text,
                "submit": submit,
            },
        )

    async def press(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("press")

        key = self._value_as_str(args.get("key"))
        if not key:
            return self._invalid_argument("press", "Missing required 'key' parameter")

        result = await self._controller.press_key(key)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="press",
                decision="port",
                error=result.get("error", "Key press failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="press",
            decision="port",
            data={
                "action": "press",
                "key": key,
            },
        )

    async def scroll(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("scroll")

        direction = self._value_as_str(args.get("direction")) or "down"
        amount_raw = args.get("amount")
        amount = amount_raw if isinstance(amount_raw, int) else 500
        result = await self._controller.scroll(direction, amount)
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
            image_bytes = await self._controller.screenshot(
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
            await asyncio.sleep(float(seconds))
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
        result = await self._controller.wait_for_load(state)
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
        if not self._controller.is_connected:
            return self._not_connected("get_tabs")

        tabs = await self._controller.get_tabs()
        return AdapterActionResult(
            success=True,
            action="get_tabs",
            decision="port",
            data={
                "action": "get_tabs",
                "tab_count": len(tabs),
                "tabs": [
                    {
                        "target_id": tab.target_id,
                        "title": tab.title,
                        "url": tab.url,
                    }
                    for tab in tabs
                ],
            },
        )

    async def switch_tab(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("switch_tab")

        target_id = self._extract_target_id(args)
        if not target_id:
            return self._invalid_argument(
                "switch_tab",
                "Missing required 'target_id' parameter",
            )

        switched = await self._controller.switch_tab(target_id)
        if not switched:
            return AdapterActionResult(
                success=False,
                action="switch_tab",
                decision="port",
                error=f"Tab not found: {target_id}",
                error_code="TAB_NOT_FOUND",
            )

        status = await self._controller.get_status()
        return AdapterActionResult(
            success=True,
            action="switch_tab",
            decision="port",
            data={
                "action": "switch_tab",
                "target_id": target_id,
                "url": status.get("url", "") if isinstance(status, dict) else "",
                "title": status.get("title", "") if isinstance(status, dict) else "",
            },
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

        result = await self._controller.evaluate(script)
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
        if not self._controller.is_connected:
            return self._not_connected("trace_start")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        snapshots = bool(args.get("snapshots", True))
        screenshots = bool(args.get("screenshots", True))
        sources = bool(args.get("sources", True))
        result = await self._controller.trace_start(
            snapshots=snapshots,
            screenshots=screenshots,
            sources=sources,
        )
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="trace_start",
                decision="deprecate",
                data={
                    "action": "trace_start",
                    "snapshots": snapshots,
                    "screenshots": screenshots,
                    "sources": sources,
                },
            )

        return AdapterActionResult(
            success=False,
            action="trace_start",
            decision="deprecate",
            error=result.get("error", "Trace start failed"),
            error_code="BROWSER_RUNTIME_ERROR",
        )

    async def trace_stop(self) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("trace_stop")

        result = await self._controller.trace_stop()
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="trace_stop",
                decision="deprecate",
                error=result.get("error", "Trace stop failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        trace_bytes = result.get("trace_bytes")
        if not isinstance(trace_bytes, (bytes, bytearray)):
            return AdapterActionResult(
                success=False,
                action="trace_stop",
                decision="deprecate",
                error="Trace stop failed: missing trace bytes",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        trace_b64 = base64.b64encode(bytes(trace_bytes)).decode("utf-8")
        return AdapterActionResult(
            success=True,
            action="trace_stop",
            decision="deprecate",
            data={
                "action": "trace_stop",
                "format": "zip",
                "trace_data": trace_b64,
                "trace_size_bytes": len(trace_bytes),
            },
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
        if not self._controller.is_connected:
            return self._not_connected("upload")
        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        paths_raw = args.get("paths")
        if not isinstance(paths_raw, list) or not paths_raw:
            return self._invalid_argument(
                "upload",
                "Missing required 'paths' parameter (string array)",
            )
        paths = [str(path) for path in paths_raw]

        ref = (
            self._value_as_str(args.get("inputRef"))
            or self._value_as_str(args.get("input_ref"))
            or self._value_as_str(args.get("ref"))
        )
        if not ref:
            return self._invalid_argument(
                "upload",
                "Missing required input ref ('inputRef', 'input_ref', or 'ref')",
            )

        result = await self._controller.set_input_files(ref=ref, paths=paths)
        if result.get("success"):
            return AdapterActionResult(
                success=True,
                action="upload",
                decision="compat",
                data=result,
            )
        return AdapterActionResult(
            success=False,
            action="upload",
            decision="compat",
            error=result.get("error", "Upload failed"),
            error_code="BROWSER_RUNTIME_ERROR",
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

    async def close(self) -> AdapterActionResult:
        await self._controller.close()
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
        switched = await self._controller.switch_tab(target_id)
        if switched:
            return None
        return AdapterActionResult(
            success=False,
            action="switch_tab",
            decision="port",
            error=f"Tab not found: {target_id}",
            error_code="TAB_NOT_FOUND",
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
    def _value_as_str(value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return None

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
    def _invalid_argument(action: str, message: str) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=message,
            error_code="INVALID_ARGUMENT",
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


def get_browser_use_adapter(controller: BrowserControllerLike) -> BrowserUseCompatibilityAdapter:
    """Factory seam for adapter injection in tests."""
    return BrowserUseCompatibilityAdapter(controller)
