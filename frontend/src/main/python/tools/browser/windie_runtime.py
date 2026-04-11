"""Windie-owned browser runtime and action dispatch."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
import logging
import re
from typing import Any, Awaitable, Callable
from urllib.parse import quote_plus

from tools.browser.content_extraction import (
    DEFAULT_EXTRACT_CHARS,
    DEFAULT_LONG_CONTENT_CHARS,
    MAX_EXTRACT_CHARS,
    capture_scoped_html,
    extract_page_content,
    html_to_markdown,
)
from tools.browser.file_store import (
    read_text,
    replace_text,
    resolve_browser_path,
    write_text,
)

logger = logging.getLogger(__name__)

DEFAULT_SNAPSHOT_PAGE_LIMIT = 4_000
MAX_SNAPSHOT_WINDOW_CHARS = 120_000
RUNTIME_SOURCE = "windie.browser"
_RUNTIME_HANDLER_BINDINGS: tuple[tuple[str, str], ...] = (
    ("connect", "_handle_connect"),
    ("status", "_handle_status"),
    ("profiles", "_handle_profiles"),
    ("navigate", "_handle_navigate"),
    ("snapshot", "_handle_snapshot"),
    ("extract", "_handle_extract"),
    ("click", "_handle_click"),
    ("input", "_handle_input"),
    ("send_keys", "_handle_send_keys"),
    ("scroll", "_handle_scroll"),
    ("screenshot", "_handle_screenshot"),
    ("wait", "_handle_wait"),
    ("get_tabs", "_handle_get_tabs"),
    ("switch", "_handle_switch"),
    ("evaluate", "_handle_evaluate"),
    ("done", "_handle_done"),
    ("search", "_handle_search"),
    ("go_back", "_handle_go_back"),
    ("search_page", "_handle_search_page"),
    ("find_elements", "_handle_find_elements"),
    ("find_text", "_handle_find_text"),
    ("close_tab", "_handle_close_tab"),
    ("dropdown_options", "_handle_dropdown_options"),
    ("select_dropdown", "_handle_select_dropdown"),
    ("upload_file", "_handle_upload_file"),
    ("write_file", "_handle_write_file"),
    ("replace_file", "_handle_replace_file"),
    ("read_file", "_handle_read_file"),
    ("read_long_content", "_handle_read_long_content"),
    ("close", "_handle_close"),
)
BROWSER_RUNTIME_ACTIONS = frozenset(
    action for action, _handler_name in _RUNTIME_HANDLER_BINDINGS
)


@dataclass(slots=True)
class BrowserActionError(Exception):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _normalize_target_id(raw: str | None) -> str | None:
    if not isinstance(raw, str):
        return None
    stripped = raw.strip()
    if not stripped:
        return None
    return stripped


def _normalize_ref(ref: str | None, index: int | None) -> str | None:
    if isinstance(ref, str) and ref.strip():
        return ref.strip()
    if isinstance(index, int) and index >= 0:
        return str(index)
    return None


def _normalize_upload_path(path: str | None) -> str | None:
    if isinstance(path, str) and path.strip():
        return path.strip()
    return None


def _serialize_tabs(tabs: list[Any]) -> list[dict[str, str]]:
    serialized: list[dict[str, str]] = []
    for tab in tabs:
        serialized.append(
            {
                "target_id": str(getattr(tab, "target_id", "") or ""),
                "title": str(getattr(tab, "title", "") or ""),
                "url": str(getattr(tab, "url", "") or ""),
            }
        )
    return serialized


def _match_page_id(page: Any, target_id: str) -> bool:
    page_id = str(id(page))
    return (
        page_id == target_id
        or page_id.endswith(target_id)
        or target_id.endswith(page_id)
    )


def _search_url(query: str, engine: str | None) -> str:
    normalized_engine = (engine or "google").strip().lower()
    encoded = quote_plus(query)
    if normalized_engine == "duckduckgo":
        return f"https://duckduckgo.com/?q={encoded}"
    if normalized_engine == "bing":
        return f"https://www.bing.com/search?q={encoded}"
    return f"https://www.google.com/search?q={encoded}"


def _bounded_limit(value: int | None, *, default: int, maximum: int) -> int:
    if not isinstance(value, int):
        return default
    return max(1, min(value, maximum))


def _build_search_matches(
    content: str,
    *,
    pattern: str,
    regex: bool,
    case_sensitive: bool,
    context_chars: int,
    max_results: int,
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    if regex:
        flags = 0 if case_sensitive else re.IGNORECASE
        matcher = re.compile(pattern, flags)
        for match in list(matcher.finditer(content))[:max_results]:
            start = match.start()
            end = match.end()
            snippet_start = max(0, start - context_chars)
            snippet_end = min(len(content), end + context_chars)
            matches.append(
                {
                    "match": match.group(0),
                    "start": start,
                    "end": end,
                    "snippet": content[snippet_start:snippet_end],
                }
            )
        return matches

    haystack = content if case_sensitive else content.lower()
    needle = pattern if case_sensitive else pattern.lower()
    start = 0
    while len(matches) < max_results:
        found = haystack.find(needle, start)
        if found < 0:
            break
        end = found + len(pattern)
        snippet_start = max(0, found - context_chars)
        snippet_end = min(len(content), end + context_chars)
        matches.append(
            {
                "match": content[found:end],
                "start": found,
                "end": end,
                "snippet": content[snippet_start:snippet_end],
            }
        )
        start = end
    return matches


class WindieBrowserRuntime:
    """First-party browser runtime built directly on BrowserController."""

    def __init__(self, controller: Any):
        self._controller = controller
        self._handlers = self._build_handlers()

    @classmethod
    def supported_actions(cls) -> frozenset[str]:
        return BROWSER_RUNTIME_ACTIONS

    def _build_handlers(self) -> dict[str, Callable[[Any], Awaitable[dict[str, Any]]]]:
        return {
            action: getattr(self, handler_name)
            for action, handler_name in _RUNTIME_HANDLER_BINDINGS
        }

    async def execute(self, args: Any) -> dict[str, Any]:
        handler = self._handlers.get(args.action)
        if handler is None:
            raise BrowserActionError(
                code="ACTION_UNSUPPORTED",
                message=f"Unsupported browser action: {args.action}",
            )
        payload = await handler(args)
        payload.setdefault("action", args.action)
        payload.setdefault("native_source", RUNTIME_SOURCE)
        return payload

    async def _require_connected_page(self) -> Any:
        page = getattr(self._controller, "_page", None)
        if page is None or not getattr(self._controller, "is_connected", False):
            raise BrowserActionError(
                code="BROWSER_NOT_CONNECTED",
                message="Browser not connected. Run 'connect' action first.",
            )
        return page

    async def _resolve_target_page(self, target_id: str) -> Any:
        context = getattr(self._controller, "_context", None)
        if context is None:
            raise BrowserActionError(
                code="BROWSER_NOT_CONNECTED",
                message="Browser not connected. Run 'connect' action first.",
            )
        for page in context.pages:
            if _match_page_id(page, target_id):
                return page
        raise BrowserActionError(
            code="INVALID_ARGUMENT",
            message=f"No browser tab matches target_id '{target_id}'.",
        )

    async def _handle_connect(self, args: Any) -> dict[str, Any]:
        if getattr(self._controller, "is_connected", False):
            await self._controller.close()
        result = await self._controller.auto_connect_to_chrome(
            cdp_url="http://127.0.0.1:9333",
            auto_launch=True,
            headless=False,
        )
        return {
            "success": True,
            "status": result.get("status", "connected"),
            "mode": result.get("mode", "user_chrome"),
            "url": result.get("url", ""),
            "title": result.get("title", ""),
            "auto_launched": bool(result.get("auto_launched", False)),
            "scope": "windie_dedicated_browser",
        }

    async def _handle_status(self, _args: Any) -> dict[str, Any]:
        status = await self._controller.get_status()
        status["success"] = True
        return status

    async def _handle_profiles(self, _args: Any) -> dict[str, Any]:
        return {
            "success": True,
            "profiles": [
                {
                    "name": "windie_browser",
                    "driver": "playwright",
                    "scope": "windie_dedicated_browser",
                }
            ],
            "default_profile": "windie_browser",
        }

    async def _handle_navigate(self, args: Any) -> dict[str, Any]:
        if args.new_tab:
            result = await self._controller.open_tab(
                url=args.url,
                wait_until="load",
            )
        else:
            result = await self._controller.navigate(
                args.url,
                wait_until="load",
            )
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser navigation failed.")),
            )
        result["success"] = True
        return result

    async def _handle_snapshot(self, args: Any) -> dict[str, Any]:
        page = await self._require_connected_page()
        wait_result = await self._controller.wait_for_load("load")
        if not wait_result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(wait_result.get("error", "Snapshot wait failed.")),
            )
        capture_limit = min(
            MAX_SNAPSHOT_WINDOW_CHARS,
            max(DEFAULT_SNAPSHOT_PAGE_LIMIT, args.offset + args.limit),
        )

        snapshot = await self._controller.get_page_snapshot(
            format_type="ai",
            max_chars=capture_limit,
        )
        if hasattr(snapshot, "text"):
            snapshot_text = str(snapshot.text)
            url = str(getattr(snapshot, "url", "") or "")
            title = str(getattr(snapshot, "title", "") or "")
            ref_count = int(getattr(snapshot, "ref_count", 0) or 0)
            refs = getattr(snapshot, "refs", {}) or {}
            stats = getattr(snapshot, "stats", None)
        elif isinstance(snapshot, dict):
            snapshot_text = str(snapshot.get("snapshot", "") or "")
            url = str(snapshot.get("url", "") or "")
            title = str(snapshot.get("title", "") or "")
            ref_count = int(snapshot.get("ref_count", 0) or 0)
            refs = snapshot.get("refs", {}) or {}
            stats = snapshot.get("stats")
        else:
            snapshot_text = str(snapshot or "")
            url = getattr(page, "url", "")
            title = await page.title()
            ref_count = 0
            refs = {}
            stats = None

        offset = args.offset or 0
        limit = _bounded_limit(
            args.limit,
            default=DEFAULT_SNAPSHOT_PAGE_LIMIT,
            maximum=MAX_SNAPSHOT_WINDOW_CHARS,
        )
        if offset + limit > MAX_SNAPSHOT_WINDOW_CHARS:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="snapshot offset + limit exceeds maximum window (120000).",
            )
        total_chars = len(snapshot_text)
        window_start = min(offset, total_chars)
        window_end = min(total_chars, window_start + limit)
        payload = {
            "success": True,
            "format": "ai",
            "snapshot": snapshot_text[window_start:window_end],
            "url": url,
            "title": title,
            "ref_count": ref_count,
            "refs": refs,
            "stats": stats,
            "offset": window_start,
            "limit": limit,
            "returned_chars": window_end - window_start,
            "total_chars": total_chars,
            "has_more": window_end < total_chars,
            "next_offset": window_end if window_end < total_chars else None,
        }
        if args.include_screenshot:
            screenshot_bytes = await self._controller.screenshot(image_type="png")
            screenshot_name = (
                f"browser-snapshot-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
            )
            screenshot_path = resolve_browser_path(screenshot_name, ensure_parent=True)
            screenshot_path.write_bytes(screenshot_bytes)
            payload["screenshot_path"] = str(screenshot_path)
            payload["screenshot_content_type"] = "image/png"
        return payload

    async def _handle_extract(self, args: Any) -> dict[str, Any]:
        page = await self._require_connected_page()
        wait_result = await self._controller.wait_for_load("load")
        if not wait_result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(wait_result.get("error", "Extract wait failed.")),
            )
        extraction_mode = "structured" if args.output_schema else "focused"
        max_chars = _bounded_limit(
            DEFAULT_EXTRACT_CHARS,
            default=DEFAULT_EXTRACT_CHARS,
            maximum=MAX_EXTRACT_CHARS,
        )
        extracted = await extract_page_content(
            page,
            query=args.query,
            mode=extraction_mode,
            extract_links=bool(args.extract_links),
            start_from_char=args.start_from_char,
            max_chars=max_chars,
        )
        return {
            "success": True,
            "extracted_content": extracted["content"],
            "metadata": {
                **extracted["metadata"],
                "schema_enforced": bool(args.output_schema),
                "output_schema": args.output_schema,
            },
            "total_chars": extracted["total_chars"],
            "returned_chars": extracted["returned_chars"],
            "has_more": extracted["has_more"],
            "next_offset": extracted["next_offset"],
        }

    async def _handle_click(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        ref = _normalize_ref(args.ref, args.index)
        if ref is not None:
            result = await self._controller.click(
                ref=ref,
                double_click=bool(args.double_click),
                button=args.button,
            )
        else:
            result = await self._controller.click_coordinates(
                x=args.coordinate_x,
                y=args.coordinate_y,
                double_click=bool(args.double_click),
                button=args.button,
            )
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser click failed.")),
            )
        result["success"] = True
        return result

    async def _handle_input(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        ref = _normalize_ref(args.ref, args.index)
        if ref is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="input requires 'ref' or 'index'.",
            )
        clear_first = True
        if isinstance(getattr(args, "clear", None), bool):
            clear_first = bool(args.clear)
        result = await self._controller.type_text(
            ref=ref,
            text=args.text,
            submit=bool(args.submit),
            clear_first=clear_first,
        )
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser input failed.")),
            )
        result["success"] = True
        result["action"] = "input"
        return result

    async def _handle_send_keys(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        result = await self._controller.press_key(args.keys)
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser key press failed.")),
            )
        result["success"] = True
        result["action"] = "send_keys"
        result["keys"] = args.keys
        return result

    async def _handle_scroll(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        amount = args.amount
        if args.pages is not None:
            amount = max(100, int(round(float(args.pages) * 500)))
        direction = args.direction
        if args.down is not None:
            direction = "down" if args.down else "up"
        result = await self._controller.scroll(direction, amount)
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser scroll failed.")),
            )
        result["success"] = True
        result["amount"] = amount
        result["direction"] = direction
        return result

    async def _handle_screenshot(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        screenshot_bytes = await self._controller.screenshot(
            image_type="png",
        )
        requested_name = (
            args.file_name
            or f"browser-screenshot-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
        )
        output_path = resolve_browser_path(requested_name, ensure_parent=True)
        output_path.write_bytes(screenshot_bytes)
        return {
            "success": True,
            "path": str(output_path),
            "file_name": output_path.name,
            "image_type": "png",
            "bytes": len(screenshot_bytes),
        }

    async def _handle_wait(self, args: Any) -> dict[str, Any]:
        if args.seconds is not None:
            await asyncio.sleep(max(0.0, float(args.seconds)))
            return {"success": True, "seconds": float(args.seconds)}
        await self._require_connected_page()
        result = await self._controller.wait_for_load("networkidle")
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser wait failed.")),
            )
        result["success"] = True
        return result

    async def _handle_get_tabs(self, _args: Any) -> dict[str, Any]:
        tabs = await self._controller.get_tabs()
        return {
            "success": True,
            "tabs": _serialize_tabs(tabs),
            "tab_count": len(tabs),
        }

    async def _handle_switch(self, args: Any) -> dict[str, Any]:
        target_id = _normalize_target_id(args.tab_id)
        if target_id is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="switch requires non-empty 'tab_id'.",
            )
        page = await self._resolve_target_page(target_id)
        self._controller._page = page
        self._controller._ensure_page_observers(page)
        self._controller._get_ref_registry(page)
        if bool(getattr(args, "activate", True)):
            await page.bring_to_front()
        return {
            "success": True,
            "target_id": str(id(page)),
            "title": await page.title(),
            "url": page.url,
            "activated": bool(getattr(args, "activate", True)),
        }

    async def _handle_evaluate(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        result = await self._controller.evaluate(args.code)
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser evaluate failed.")),
            )
        result["success"] = True
        return result

    async def _handle_done(self, args: Any) -> dict[str, Any]:
        files = []
        if isinstance(args.files_to_display, list):
            files = [
                str(path).strip()
                for path in args.files_to_display
                if isinstance(path, str) and path.strip()
            ]
        return {
            "success": True,
            "text": args.text or "Done.",
            "done_success": args.success,
            "files_to_display": files,
        }

    async def _handle_search(self, args: Any) -> dict[str, Any]:
        url = _search_url(args.query, args.engine)
        await self._require_connected_page()
        result = await self._controller.navigate(url, wait_until="load")
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Browser search failed.")),
            )
        result["success"] = True
        result["query"] = args.query
        result["engine"] = args.engine or "google"
        return result

    async def _handle_go_back(self, _args: Any) -> dict[str, Any]:
        page = await self._require_connected_page()
        response = await page.go_back(wait_until="load", timeout=30_000)
        self._controller._reset_ref_registry(page)
        return {
            "success": True,
            "url": page.url,
            "title": await page.title(),
            "status": response.status if response else None,
        }

    async def _read_page_markdown(self, args: Any) -> str:
        page = await self._require_connected_page()
        html, _scope = await capture_scoped_html(
            page,
            selector=getattr(args, "css_scope", None),
        )
        return html_to_markdown(html, extract_links=False)

    async def _handle_search_page(self, args: Any) -> dict[str, Any]:
        content = await self._read_page_markdown(args)
        matches = _build_search_matches(
            content,
            pattern=args.pattern,
            regex=bool(args.regex),
            case_sensitive=bool(args.case_sensitive),
            context_chars=args.context_chars or 80,
            max_results=args.max_results or 20,
        )
        return {
            "success": True,
            "pattern": args.pattern,
            "match_count": len(matches),
            "matches": matches,
        }

    async def _handle_find_elements(self, args: Any) -> dict[str, Any]:
        page = await self._require_connected_page()
        locator = page.locator(args.selector)
        count = await locator.count()
        limit = min(count, args.max_results or 20)
        elements: list[dict[str, Any]] = []
        for index in range(limit):
            element = locator.nth(index)
            entry: dict[str, Any] = {"index": index}
            if args.include_text:
                text_content = await element.text_content()
                entry["text"] = text_content or ""
            if args.attributes:
                entry["attributes"] = {}
                for attribute in args.attributes:
                    entry["attributes"][attribute] = await element.get_attribute(
                        attribute
                    )
            elements.append(entry)
        return {
            "success": True,
            "selector": args.selector,
            "count": count,
            "elements": elements,
        }

    async def _handle_find_text(self, args: Any) -> dict[str, Any]:
        content = await self._read_page_markdown(args)
        matches = _build_search_matches(
            content,
            pattern=args.text,
            regex=False,
            case_sensitive=False,
            context_chars=80,
            max_results=args.max_results or 20,
        )
        return {
            "success": True,
            "text": args.text,
            "match_count": len(matches),
            "matches": matches,
        }

    async def _handle_close_tab(self, args: Any) -> dict[str, Any]:
        target_id = _normalize_target_id(args.tab_id)
        if target_id is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="close_tab requires non-empty 'tab_id'.",
            )
        page = await self._resolve_target_page(target_id)
        current_page = getattr(self._controller, "_page", None)
        await page.close()
        context = getattr(self._controller, "_context", None)
        remaining_pages = list(context.pages) if context else []
        if current_page is page:
            self._controller._page = remaining_pages[0] if remaining_pages else None
        return {
            "success": True,
            "closed_target_id": str(id(page)),
            "tab_count": len(remaining_pages),
        }

    async def _handle_dropdown_options(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        ref = _normalize_ref(args.ref, args.index)
        if ref is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="dropdown_options requires 'ref' or 'index'.",
            )
        result = await self._controller.get_dropdown_options(ref)
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Failed to read dropdown options.")),
            )
        result["success"] = True
        return result

    async def _handle_select_dropdown(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        ref = _normalize_ref(args.ref, args.index)
        if ref is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="select_dropdown requires 'ref' or 'index'.",
            )
        result = await self._controller.select_dropdown(ref, args.text)
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "Dropdown selection failed.")),
            )
        result["success"] = True
        return result

    async def _handle_upload_file(self, args: Any) -> dict[str, Any]:
        await self._require_connected_page()
        ref = _normalize_ref(args.ref, args.index)
        if ref is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="upload_file requires 'ref' or 'index'.",
            )
        upload_path = _normalize_upload_path(args.path)
        if upload_path is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="upload_file requires non-empty 'path'.",
            )
        result = await self._controller.set_input_files(ref, [upload_path])
        if not result.get("success", False):
            raise BrowserActionError(
                code="BROWSER_RUNTIME_ERROR",
                message=str(result.get("error", "File upload failed.")),
            )
        result["success"] = True
        return result

    async def _handle_write_file(self, args: Any) -> dict[str, Any]:
        if not args.file_name:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="write_file requires non-empty 'file_name'.",
            )
        resolved, written_chars = write_text(
            args.file_name,
            args.content,
            append=bool(args.append),
            leading_newline=bool(args.leading_newline),
            trailing_newline=bool(args.trailing_newline),
        )
        return {
            "success": True,
            "path": str(resolved),
            "written_chars": written_chars,
        }

    async def _handle_replace_file(self, args: Any) -> dict[str, Any]:
        if not args.file_name:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="replace_file requires non-empty 'file_name'.",
            )
        if args.old_str is None or args.new_str is None:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="replace_file requires both 'old_str' and 'new_str'.",
            )
        resolved, replacements = replace_text(
            args.file_name,
            args.old_str,
            args.new_str,
        )
        return {
            "success": True,
            "path": str(resolved),
            "replacements": replacements,
        }

    async def _handle_read_file(self, args: Any) -> dict[str, Any]:
        if not args.file_name:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="read_file requires non-empty 'file_name'.",
            )
        resolved, content = read_text(args.file_name)
        return {
            "success": True,
            "path": str(resolved),
            "content": content,
            "chars": len(content),
        }

    async def _handle_read_long_content(self, args: Any) -> dict[str, Any]:
        page = await self._require_connected_page()
        query = " ".join(
            part
            for part in (args.goal, args.source, args.context)
            if isinstance(part, str) and part.strip()
        )
        extracted = await extract_page_content(
            page,
            query=query,
            mode="focused",
            extract_links=True,
            start_from_char=0,
            max_chars=DEFAULT_LONG_CONTENT_CHARS,
        )
        return {
            "success": True,
            "extracted_content": extracted["content"],
            "metadata": {
                **extracted["metadata"],
                "goal": args.goal,
                "source": args.source,
                "context": args.context,
            },
            "total_chars": extracted["total_chars"],
            "returned_chars": extracted["returned_chars"],
            "has_more": extracted["has_more"],
            "next_offset": extracted["next_offset"],
        }

    async def _handle_close(self, _args: Any) -> dict[str, Any]:
        await self._controller.close()
        return {"success": True, "status": "closed"}
