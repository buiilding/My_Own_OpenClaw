"""Phase 2 browser adapter routing through the current browser controller seam.

This module defines the Browser Use adapter boundary and a compatibility
implementation that preserves existing browser_control payload contracts while
we migrate internals incrementally.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
from typing import Any, Mapping, Protocol

from tools.browser_use_adapter.types import AdapterActionResult

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
    ):
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
        if action == "profiles":
            return await self.profiles()
        if action == "navigate":
            return await self.navigate(args)
        if action == "open":
            return await self.open(args)
        if action == "snapshot":
            return await self.snapshot(args)
        if action == "extract":
            return await self.extract(args)
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
        if action == "act":
            return await self.act(args)
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

        wait_result = await self._controller.wait_for_load(wait_until)
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
            snapshot = await self._controller.get_page_snapshot(
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

        wait_result = await self._controller.wait_for_load(wait_until)
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

        eval_result = await self._controller.evaluate(script)
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
            click_args = {"action": "click", **merged}
            click_result = await self.click(click_args)
            return self._retag_action(click_result, "click")

        if kind == "type":
            type_args = {"action": "type", **merged}
            type_result = await self.type_text(type_args)
            return self._retag_action(type_result, "type")

        if kind == "press":
            press_args = {"action": "press", "key": merged.get("key"), **merged}
            press_result = await self.press(press_args)
            return self._retag_action(press_result, "press")

        if kind == "hover":
            if not self._controller.is_connected:
                return self._not_connected("act")
            focus_error = await self._focus_target_if_requested(merged)
            if focus_error:
                return focus_error
            ref = self._value_as_str(merged.get("ref"))
            if not ref:
                return self._invalid_argument("act", "act.hover requires 'ref'")
            result = await self._controller.hover(ref=ref)
            if result.get("success"):
                return AdapterActionResult(
                    success=True,
                    action="hover",
                    decision="compat",
                    data=result,
                )
            return AdapterActionResult(
                success=False,
                action="hover",
                decision="compat",
                error=result.get("error", "Hover failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if kind == "drag":
            if not self._controller.is_connected:
                return self._not_connected("act")
            focus_error = await self._focus_target_if_requested(merged)
            if focus_error:
                return focus_error
            start_ref = self._value_as_str(merged.get("startRef"))
            end_ref = self._value_as_str(merged.get("endRef"))
            if not start_ref or not end_ref:
                return self._invalid_argument(
                    "act",
                    "act.drag requires 'startRef' and 'endRef'",
                )
            result = await self._controller.drag(start_ref=start_ref, end_ref=end_ref)
            if result.get("success"):
                return AdapterActionResult(
                    success=True,
                    action="drag",
                    decision="compat",
                    data=result,
                )
            return AdapterActionResult(
                success=False,
                action="drag",
                decision="compat",
                error=result.get("error", "Drag failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if kind == "select":
            if not self._controller.is_connected:
                return self._not_connected("act")
            focus_error = await self._focus_target_if_requested(merged)
            if focus_error:
                return focus_error
            ref = self._value_as_str(merged.get("ref"))
            values = merged.get("values")
            if not ref:
                return self._invalid_argument("act", "act.select requires 'ref'")
            if not isinstance(values, list) or not values:
                return self._invalid_argument(
                    "act",
                    "act.select requires non-empty 'values' array",
                )
            result = await self._controller.select_options(
                ref=ref,
                values=[str(value) for value in values],
            )
            if result.get("success"):
                return AdapterActionResult(
                    success=True,
                    action="select",
                    decision="compat",
                    data=result,
                )
            return AdapterActionResult(
                success=False,
                action="select",
                decision="compat",
                error=result.get("error", "Select failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if kind == "fill":
            if not self._controller.is_connected:
                return self._not_connected("act")
            focus_error = await self._focus_target_if_requested(merged)
            if focus_error:
                return focus_error
            fields = merged.get("fields")
            if not isinstance(fields, list):
                return self._invalid_argument(
                    "act",
                    "act.fill requires 'fields' array",
                )
            result = await self._controller.fill_fields(fields)
            if result.get("success"):
                return AdapterActionResult(
                    success=True,
                    action="fill",
                    decision="compat",
                    data=result,
                )
            return AdapterActionResult(
                success=False,
                action="fill",
                decision="compat",
                error="Fill completed with errors",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if kind == "resize":
            if not self._controller.is_connected:
                return self._not_connected("act")
            width = merged.get("width")
            height = merged.get("height")
            if not isinstance(width, (int, float)) or not isinstance(
                height, (int, float)
            ):
                return self._invalid_argument(
                    "act",
                    "act.resize requires numeric width/height",
                )
            result = await self._controller.resize_viewport(int(width), int(height))
            if result.get("success"):
                return AdapterActionResult(
                    success=True,
                    action="resize",
                    decision="compat",
                    data=result,
                )
            return AdapterActionResult(
                success=False,
                action="resize",
                decision="compat",
                error=result.get("error", "Resize failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if kind == "wait":
            time_ms = merged.get("timeMs")
            if isinstance(time_ms, (int, float)):
                wait_result = await self.wait(
                    {
                        "action": "wait",
                        "seconds": max(0.0, float(time_ms) / 1000.0),
                        **merged,
                    }
                )
            else:
                wait_result = await self.wait({"action": "wait", **merged})
            return self._retag_action(wait_result, "wait")

        if kind == "evaluate":
            fn = merged.get("fn")
            if isinstance(fn, str):
                evaluate_result = await self.evaluate(
                    {"action": "evaluate", "script": fn, **merged}
                )
            else:
                evaluate_result = await self.evaluate({"action": "evaluate", **merged})
            return self._retag_action(evaluate_result, "evaluate")

        if kind == "close":
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
        snapshot = await self._controller.get_page_snapshot(
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
                fallback_snapshot = await self._controller.get_page_snapshot(
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
            flat_snapshot = await self._controller.get_page_snapshot(
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
) -> BrowserUseCompatibilityAdapter:
    """Factory seam for adapter injection in tests."""
    return BrowserUseCompatibilityAdapter(
        controller,
    )
