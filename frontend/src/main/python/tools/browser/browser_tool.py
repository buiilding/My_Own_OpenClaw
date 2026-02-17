"""
Browser control tool implementation for WindieOS sidecar.

Provides web browser automation capabilities including:
- User Chrome control via CDP
- Managed Chromium instance
- Page snapshots with element references
- Click, type, scroll, screenshot actions
"""

import base64
import json
import logging
import inspect
import re
from typing import Any, Dict, List, Optional

from tools.browser.controller import get_browser_controller
from tools.browser_use_adapter import (
    AdapterActionResult,
    get_browser_use_adapter,
)
from tools.result import ToolResult

logger = logging.getLogger(__name__)

DEFAULT_AI_SNAPSHOT_MAX_CHARS = 12_000
DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS = 4_000
DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH = 4
AI_SNAPSHOT_ZERO_REF_FALLBACK_DEPTH = 12
DEFAULT_ARIA_SNAPSHOT_MAX_CHARS = 4_000
MAX_ARIA_SNAPSHOT_MAX_CHARS = 4_000
MAX_SNAPSHOT_CAPTURE_CHARS = 120_000
SNAPSHOT_PAGINATION_OVERFETCH_CHARS = 512
SNAPSHOT_TRUNCATION_SUFFIX = "... (truncated)"
SNAPSHOT_WAIT_STATES = frozenset({"load", "domcontentloaded", "networkidle", "commit"})
DEFAULT_EXTRACT_MAX_CHARS = 12_000
MAX_EXTRACT_SOURCE_CHARS = 100_000
MAX_EXTRACT_LINKS = 200
DEFAULT_EXTRACT_MODE = "focused"
MAX_EXTRACT_STRUCTURED_TABLES = 20
MAX_EXTRACT_STRUCTURED_ROWS_PER_TABLE = 100
MAX_EXTRACT_STRUCTURED_LISTS = 20
MAX_EXTRACT_STRUCTURED_ITEMS_PER_LIST = 100

POST_ACTION_SNAPSHOT_ACTIONS = frozenset(
    {
        "connect",
        "navigate",
        "open",
        "click",
        "type",
        "press",
        "scroll",
        "wait",
        "switch_tab",
        "evaluate",
        "upload",
        "set_media",
        "set_device",
    }
)

POST_ACTION_SNAPSHOT_ACT_KINDS = frozenset(
    {
        "click",
        "type",
        "press",
        "hover",
        "drag",
        "select",
        "fill",
        "resize",
        "wait",
        "evaluate",
    }
)

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


def _extract_act_kind(args: Dict[str, Any]) -> Optional[str]:
    request = args.get("request")
    if not isinstance(request, dict):
        return None
    kind = request.get("kind")
    if not isinstance(kind, str):
        return None
    normalized = kind.strip().lower()
    return normalized or None


def _should_attach_post_action_snapshot(
    action: str,
    args: Dict[str, Any],
    result: ToolResult,
) -> bool:
    # Temporarily disabled for testing: do not auto-attach post-action snapshots.
    return False

    # Keep existing logic in place for easy re-enable.
    if not result.success or not isinstance(result.data, dict):
        return False

    if action == "act":
        kind = _extract_act_kind(args)
        return kind in POST_ACTION_SNAPSHOT_ACT_KINDS

    return action in POST_ACTION_SNAPSHOT_ACTIONS


def _resolve_snapshot_wait_until(
    args: Dict[str, Any], default: str = "load"
) -> tuple[str, Optional[str]]:
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


def _snapshot_ref_count(snapshot: Any) -> int:
    ref_count = getattr(snapshot, "ref_count", None)
    if isinstance(ref_count, int) and ref_count >= 0:
        return ref_count
    return 0


async def _capture_ai_snapshot_with_zero_ref_fallback(
    controller,
    *,
    max_chars: int,
    refs_mode: Optional[str],
    interactive: Optional[bool],
    compact: Optional[bool],
    depth: Optional[int],
    selector: Optional[str],
    frame_selector: Optional[str],
    enable_zero_ref_fallback: bool,
) -> Any:
    snapshot = await controller.get_page_snapshot(
        format_type="ai",
        max_chars=max_chars,
        refs_mode=refs_mode,
        interactive=interactive,
        compact=compact,
        depth=depth,
        selector=selector,
        frame_selector=frame_selector,
    )
    if not enable_zero_ref_fallback or _snapshot_ref_count(snapshot) > 0:
        return snapshot

    fallback_snapshot = snapshot

    # First retry: preserve role snapshot semantics but increase depth.
    is_role_snapshot_path = (
        refs_mode in ("role", "aria")
        or interactive is True
        or compact is True
        or depth is not None
        or bool((selector or "").strip())
        or bool((frame_selector or "").strip())
    )
    effective_depth = (
        max(depth, AI_SNAPSHOT_ZERO_REF_FALLBACK_DEPTH)
        if isinstance(depth, int)
        else AI_SNAPSHOT_ZERO_REF_FALLBACK_DEPTH
    )
    should_retry_role_depth = is_role_snapshot_path and depth != effective_depth
    if should_retry_role_depth:
        try:
            fallback_snapshot = await controller.get_page_snapshot(
                format_type="ai",
                max_chars=max_chars,
                refs_mode=refs_mode,
                interactive=interactive,
                compact=compact,
                depth=effective_depth,
                selector=selector,
                frame_selector=frame_selector,
            )
            if _snapshot_ref_count(fallback_snapshot) > 0:
                return fallback_snapshot
        except Exception as exc:
            logger.warning("Efficient AI snapshot depth retry failed: %s", exc)

    # Second retry: switch to flat AI snapshot (unscoped only) to bypass role-tree filtering.
    if selector or frame_selector:
        return fallback_snapshot
    try:
        flat_snapshot = await controller.get_page_snapshot(
            format_type="ai",
            max_chars=max_chars,
            refs_mode=None,
            interactive=None,
            compact=None,
            depth=None,
            selector=None,
            frame_selector=None,
        )
        if _snapshot_ref_count(flat_snapshot) > 0:
            return flat_snapshot
        return flat_snapshot
    except Exception as exc:
        logger.warning("Efficient AI snapshot flat retry failed: %s", exc)
        return fallback_snapshot


async def _attach_post_action_snapshot_if_needed(
    action: str,
    args: Dict[str, Any],
    result: ToolResult,
) -> ToolResult:
    if not _should_attach_post_action_snapshot(action, args, result):
        return result

    controller = get_browser_controller()
    if not controller.is_connected:
        return result

    wait_until, wait_error = _resolve_snapshot_wait_until(args, default="load")
    if wait_error:
        wait_until = "load"

    try:
        snapshot_result = await _handle_snapshot(
            {
                "action": "snapshot",
                "format": "ai",
                "wait_until": wait_until,
            }
        )
    except Exception as exc:
        logger.warning("Post-action snapshot failed for '%s': %s", action, exc)
        return result

    if not snapshot_result.success or not isinstance(snapshot_result.data, dict):
        return result

    assert isinstance(result.data, dict)
    result.data["post_action_snapshot"] = dict(snapshot_result.data)
    return result


def _adapter_result_to_tool_result(result: AdapterActionResult) -> ToolResult:
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


async def execute_browser_control(raw_args: Dict[str, Any]) -> ToolResult:
    """
    Execute browser control action based on arguments.

    Args:
        raw_args: Raw arguments from tool call

    Returns:
        ToolResult with execution result
    """
    if not isinstance(raw_args, dict):
        return ToolResult.error_result("Arguments must be an object")

    action = raw_args.get("action")
    if not action:
        return ToolResult.error_result("Missing required 'action' parameter")

    # Route to appropriate handler
    try:
        if action not in PHASE2_ADAPTER_ROUTED_ACTIONS:
            return ToolResult.error_result(f"Unhandled action: {action}")
        result = await _run_phase2_adapter_action(raw_args)
        return await _attach_post_action_snapshot_if_needed(action, raw_args, result)
    except Exception as e:
        logger.exception(f"Browser action '{action}' failed")
        return ToolResult.error_result(f"Action failed: {str(e)}")


def _extract_url(args: Dict[str, Any]) -> Optional[str]:
    for key in ("url", "target_url", "targetUrl"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extract_target_id(args: Dict[str, Any]) -> Optional[str]:
    for key in ("target_id", "targetId"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def _focus_target_if_requested(
    controller, args: Dict[str, Any]
) -> Optional[ToolResult]:
    target_id = _extract_target_id(args)
    if not target_id:
        return None
    switched = await controller.switch_tab(target_id)
    if not switched:
        return ToolResult.error_result(f"Tab not found: {target_id}")
    return None


def _build_extract_script(
    *,
    extract_links: bool,
    max_links: int,
    selector: Optional[str],
    frame_selector: Optional[str],
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


def _resolve_extract_mode(raw_mode: Any) -> Optional[str]:
    if raw_mode is None:
        return DEFAULT_EXTRACT_MODE
    if not isinstance(raw_mode, str):
        return None
    normalized = raw_mode.strip().lower()
    if normalized in ("focused", "full_text", "structured"):
        return normalized
    return None


def _extract_relevant_content(source: str, query: str) -> str:
    source = (source or "").strip()
    if not source:
        return ""

    query_text = query.strip().lower()
    tokens = _query_tokens(query)
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


async def _handle_connect(args: Dict[str, Any]) -> ToolResult:
    """Handle browser connect action with auto-launch support."""
    controller = get_browser_controller()

    # Close existing connection if any
    if controller.is_connected:
        await controller.close()

    try:
        mode = args.get("mode", "user_chrome")
        if mode == "user_chrome":
            # Use auto_connect which handles launching if needed
            result = await controller.auto_connect_to_chrome(
                cdp_url=args.get("cdp_url", "http://127.0.0.1:9222"),
                auto_launch=True,
            )

            # Build user-friendly message
            if result.get("auto_launched"):
                message = (
                    f"Browser {result['status']} in {result['mode']} mode "
                    f"(Chrome was auto-launched)"
                )
            else:
                message = (
                    f"Browser {result['status']} in {result['mode']} mode "
                    f"(connected to existing Chrome)"
                )
        elif mode == "managed":
            result = await controller.launch_managed_browser(
                headless=bool(args.get("headless", False)),
                executable_path=args.get("executable_path"),
            )
            message = f"Browser {result['status']} in {result['mode']} mode"
        else:
            return ToolResult.error_result(f"Unknown browser mode: {mode}")

        return ToolResult.success_result(
            {
                "status": result["status"],
                "mode": result["mode"],
                "url": result["url"],
                "title": result.get("title", ""),
                "auto_launched": result.get("auto_launched", False),
                "message": message,
            }
        )
    except ConnectionError as e:
        return ToolResult.error_result(f"Failed to connect to Chrome. {str(e)}")
    except RuntimeError as e:
        return ToolResult.error_result(str(e))


async def _handle_status(args: Dict[str, Any]) -> ToolResult:
    """Handle browser status action."""
    controller = get_browser_controller()
    status = await controller.get_status()
    return ToolResult.success_result(
        {
            "action": "status",
            "connected": status["connected"],
            "mode": status.get("mode"),
            "url": status.get("url", ""),
            "title": status.get("title", ""),
            "tab_count": status.get("tab_count", 0),
            "target_id": status.get("target_id"),
        }
    )


async def _handle_profiles(args: Dict[str, Any]) -> ToolResult:
    """Return WindieOS browser profile equivalents."""
    return ToolResult.success_result(
        {
            "action": "profiles",
            "profiles": [
                {"name": "user_chrome", "driver": "cdp"},
                {"name": "managed", "driver": "playwright"},
            ],
            "default_profile": "user_chrome",
        }
    )


async def _handle_navigate(args: Dict[str, Any]) -> ToolResult:
    """Handle browser navigate action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    url = _extract_url(args)
    if not isinstance(url, str) or not url:
        return ToolResult.error_result("Missing required 'url' parameter")

    result = await controller.navigate(url, args.get("wait_until", "load"))

    if result.get("success"):
        return ToolResult.success_result(
            {
                "action": "navigate",
                "url": result["url"],
                "title": result["title"],
                "status": result.get("status"),
            }
        )
    else:
        return ToolResult.error_result(result.get("error", "Navigation failed"))


async def _handle_open(args: Dict[str, Any]) -> ToolResult:
    """OpenClaw-compatible open action: opens a new tab and navigates."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    url = _extract_url(args) or "about:blank"
    result = await controller.open_tab(url=url)
    if not result.get("success"):
        return ToolResult.error_result(result.get("error", "Open failed"))
    return ToolResult.success_result(
        {
            "action": "open",
            "target_id": result["target_id"],
            "url": result["url"],
            "title": result["title"],
            "status": result.get("status"),
        }
    )


async def _handle_snapshot(args: Dict[str, Any]) -> ToolResult:
    """Handle browser snapshot action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    format_type = args.get("format", args.get("snapshotFormat", "ai"))
    if format_type not in ("ai", "aria"):
        return ToolResult.error_result("Invalid snapshot format. Use 'ai' or 'aria'.")

    wait_until, wait_error = _resolve_snapshot_wait_until(args, default="load")
    if wait_error:
        return ToolResult.error_result(wait_error)

    wait_result = await controller.wait_for_load(wait_until)
    if isinstance(wait_result, dict) and not wait_result.get("success", False):
        return ToolResult.error_result(
            wait_result.get("error", f"wait_for_load({wait_until}) failed")
        )

    mode_raw = args.get("mode")
    mode: str | None = None
    if mode_raw == "efficient":
        mode = "efficient"
    elif format_type == "ai" and mode_raw in (None, "", "user_chrome"):
        # Keep default snapshots compact/actionable unless caller explicitly opts out.
        mode = "efficient"

    if mode == "efficient" and format_type == "aria":
        return ToolResult.error_result("mode='efficient' requires format='ai'.")

    max_chars_raw = args.get("max_chars")
    max_chars: int | None = None
    if isinstance(max_chars_raw, int) and max_chars_raw > 0:
        max_chars = max_chars_raw

    offset_raw = args.get("offset")
    offset = 0
    if offset_raw is not None:
        if not isinstance(offset_raw, int) or offset_raw < 0:
            return ToolResult.error_result("offset must be a non-negative integer")
        offset = offset_raw

    limit_raw = args.get("limit")
    limit: int | None = None
    if limit_raw is not None:
        if not isinstance(limit_raw, int) or limit_raw <= 0:
            return ToolResult.error_result("limit must be a positive integer")
        limit = limit_raw

    refs_mode_raw = args.get("refs")
    refs_mode = refs_mode_raw if refs_mode_raw in ("role", "aria") else None

    interactive = (
        args.get("interactive") if isinstance(args.get("interactive"), bool) else None
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
            resolved_max_chars = min(resolved_max_chars, MAX_ARIA_SNAPSHOT_MAX_CHARS)

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
            return ToolResult.error_result(
                f"offset + limit exceeds maximum snapshot window ({MAX_SNAPSHOT_CAPTURE_CHARS})"
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
        snapshot = await _capture_ai_snapshot_with_zero_ref_fallback(
            controller,
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
        snapshot = await controller.get_page_snapshot(
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

    result: Dict[str, Any] = {
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

    return ToolResult.success_result(result)


async def _handle_extract(args: Dict[str, Any]) -> ToolResult:
    """Extract query-focused content from current page text."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    query = args.get("query")
    if not isinstance(query, str) or not query.strip():
        return ToolResult.error_result("Missing required 'query' parameter")
    query = query.strip()

    mode = _resolve_extract_mode(args.get("mode"))
    if mode is None:
        return ToolResult.error_result(
            "mode must be one of: focused, full_text, structured"
        )

    selector = args.get("selector")
    if selector is not None and (
        not isinstance(selector, str) or not selector.strip()
    ):
        return ToolResult.error_result("selector must be a non-empty string when set")
    selector_value = selector.strip() if isinstance(selector, str) else None

    frame_selector = args.get("frame")
    if frame_selector is not None and (
        not isinstance(frame_selector, str) or not frame_selector.strip()
    ):
        return ToolResult.error_result("frame must be a non-empty string when set")
    frame_selector_value = (
        frame_selector.strip() if isinstance(frame_selector, str) else None
    )

    start_from_char = args.get("start_from_char", 0)
    if not isinstance(start_from_char, int) or start_from_char < 0:
        return ToolResult.error_result("start_from_char must be a non-negative integer")

    max_chars_raw = args.get("max_chars")
    max_chars = DEFAULT_EXTRACT_MAX_CHARS
    if max_chars_raw is not None:
        if not isinstance(max_chars_raw, int) or max_chars_raw <= 0:
            return ToolResult.error_result("max_chars must be a positive integer")
        max_chars = min(max_chars_raw, MAX_SNAPSHOT_CAPTURE_CHARS)

    wait_until, wait_error = _resolve_snapshot_wait_until(args, default="load")
    if wait_error:
        return ToolResult.error_result(wait_error)

    wait_result = await controller.wait_for_load(wait_until)
    if isinstance(wait_result, dict) and not wait_result.get("success", False):
        return ToolResult.error_result(
            wait_result.get("error", f"wait_for_load({wait_until}) failed")
        )

    extract_links = bool(args.get("extract_links", False))
    script = _build_extract_script(
        extract_links=extract_links,
        max_links=MAX_EXTRACT_LINKS,
        selector=selector_value,
        frame_selector=frame_selector_value,
        max_tables=MAX_EXTRACT_STRUCTURED_TABLES,
        max_rows_per_table=MAX_EXTRACT_STRUCTURED_ROWS_PER_TABLE,
        max_lists=MAX_EXTRACT_STRUCTURED_LISTS,
        max_items_per_list=MAX_EXTRACT_STRUCTURED_ITEMS_PER_LIST,
    )
    eval_result = await controller.evaluate(script)
    if not isinstance(eval_result, dict) or not eval_result.get("success", False):
        if isinstance(eval_result, dict):
            return ToolResult.error_result(
                eval_result.get("error", "Extract evaluate failed")
            )
        return ToolResult.error_result("Extract evaluate failed")

    payload = eval_result.get("result")
    if not isinstance(payload, dict):
        return ToolResult.error_result("Extract evaluate returned invalid result")
    if isinstance(payload.get("error"), str) and payload["error"].strip():
        return ToolResult.error_result(f"Extract failed: {payload['error']}")

    source_content = payload.get("content")
    if not isinstance(source_content, str):
        source_content = ""
    structured_payload = payload.get("structured")
    if not isinstance(structured_payload, (dict, list)):
        structured_payload = None

    source_for_mode = source_content
    if mode == "structured":
        if structured_payload is not None:
            source_for_mode = json.dumps(structured_payload, ensure_ascii=True, indent=2)
        else:
            source_for_mode = source_content

    total_source_chars = len(source_for_mode)
    if start_from_char > total_source_chars:
        return ToolResult.error_result(
            f"start_from_char ({start_from_char}) exceeds content length {total_source_chars}"
        )

    source_window_end = min(
        total_source_chars, start_from_char + MAX_EXTRACT_SOURCE_CHARS
    )
    source_window = source_for_mode[start_from_char:source_window_end]
    source_has_more = source_window_end < total_source_chars
    next_start_char = source_window_end if source_has_more else None

    if mode == "focused":
        relevant_content = _extract_relevant_content(source_window, query)
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

    result: Dict[str, Any] = {
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
    if selector_value:
        result["selector"] = selector_value
    if frame_selector_value:
        result["frame"] = frame_selector_value
    if mode == "structured" and structured_payload is not None:
        result["structured"] = structured_payload

    output_schema = args.get("output_schema")
    if output_schema is not None:
        result["output_schema_applied"] = False
        result["output_schema_note"] = (
            "output_schema is accepted as metadata only; structured validation is not applied in sidecar extract."
        )

    return ToolResult.success_result(result)


async def _handle_click(args: Dict[str, Any]) -> ToolResult:
    """Handle browser click action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    ref = args.get("ref")
    if not isinstance(ref, str) or not ref:
        return ToolResult.error_result("Missing required 'ref' parameter")

    double_click = bool(args.get("double_click", False))
    button = args.get("button", "left")

    result = await controller.click(
        ref=ref,
        double_click=double_click,
        button=button,
    )

    if result.get("success"):
        payload: Dict[str, Any] = {
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
        return ToolResult.success_result(payload)
    else:
        return ToolResult.error_result(result.get("error", "Click failed"))


async def _handle_type(args: Dict[str, Any]) -> ToolResult:
    """Handle browser type action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    ref = args.get("ref")
    text = args.get("text")
    if not isinstance(ref, str) or not ref:
        return ToolResult.error_result("Missing required 'ref' parameter")
    if not isinstance(text, str):
        return ToolResult.error_result("Missing required 'text' parameter")

    submit = bool(args.get("submit", False))
    clear_first = bool(args.get("clear_first", False))

    result = await controller.type_text(
        ref=ref,
        text=text,
        submit=submit,
        clear_first=clear_first,
    )

    if result.get("success"):
        return ToolResult.success_result(
            {
                "action": "type",
                "ref": ref,
                "text": text,
                "submit": submit,
            }
        )
    else:
        return ToolResult.error_result(result.get("error", "Type failed"))


async def _handle_press(args: Dict[str, Any]) -> ToolResult:
    """Handle browser press action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    key = args.get("key")
    if not isinstance(key, str) or not key:
        return ToolResult.error_result("Missing required 'key' parameter")

    result = await controller.press_key(key)

    if result.get("success"):
        return ToolResult.success_result(
            {
                "action": "press",
                "key": key,
            }
        )
    else:
        return ToolResult.error_result(result.get("error", "Key press failed"))


async def _handle_scroll(args: Dict[str, Any]) -> ToolResult:
    """Handle browser scroll action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    direction = args.get("direction", "down")
    amount = args.get("amount", 500)
    result = await controller.scroll(direction, amount)

    if result.get("success"):
        return ToolResult.success_result(
            {
                "action": "scroll",
                "direction": direction,
                "amount": amount,
            }
        )
    else:
        return ToolResult.error_result(result.get("error", "Scroll failed"))


async def _handle_screenshot(args: Dict[str, Any]) -> ToolResult:
    """Handle browser screenshot action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    full_page = bool(args.get("full_page", False))
    ref = args.get("ref")
    element = args.get("element")
    image_type = args.get("type", "png")
    if image_type not in ("png", "jpeg"):
        return ToolResult.error_result("Invalid screenshot type. Use 'png' or 'jpeg'.")
    quality_raw = args.get("quality")
    quality = int(quality_raw) if isinstance(quality_raw, (int, float)) else None

    try:
        image_bytes = await controller.screenshot(
            full_page=full_page,
            ref=ref,
            element=element if isinstance(element, str) else None,
            image_type=image_type,
            quality=quality,
        )

        # Convert to base64 for JSON serialization
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")

        return ToolResult.success_result(
            {
                "action": "screenshot",
                "format": image_type,
                "full_page": full_page,
                "ref": ref,
                "element": element if isinstance(element, str) else None,
                "image_data": image_b64,
                "image_size_bytes": len(image_bytes),
            }
        )
    except Exception as e:
        return ToolResult.error_result(f"Screenshot failed: {str(e)}")


async def _handle_wait(args: Dict[str, Any]) -> ToolResult:
    """Handle browser wait action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    seconds = args.get("seconds")
    if seconds is not None:
        # Fixed time wait
        import asyncio

        await asyncio.sleep(seconds)
        return ToolResult.success_result(
            {
                "action": "wait",
                "type": "time",
                "seconds": seconds,
            }
        )
    else:
        # Wait for load state
        state = args.get("state", "networkidle")
        result = await controller.wait_for_load(state)

        if result.get("success"):
            return ToolResult.success_result(
                {
                    "action": "wait",
                    "type": "load_state",
                    "state": state,
                }
            )
        else:
            return ToolResult.error_result(result.get("error", "Wait failed"))


async def _handle_get_tabs(args: Dict[str, Any]) -> ToolResult:
    """Handle browser get_tabs action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    tabs = await controller.get_tabs()

    return ToolResult.success_result(
        {
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
        }
    )


async def _handle_switch_tab(args: Dict[str, Any]) -> ToolResult:
    """Handle browser switch_tab action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    target_id = _extract_target_id(args)
    if not isinstance(target_id, str) or not target_id:
        return ToolResult.error_result("Missing required 'target_id' parameter")

    success = await controller.switch_tab(target_id)

    if success:
        status = await controller.get_status()
        url = status.get("url", "") if isinstance(status, dict) else ""
        title = status.get("title", "") if isinstance(status, dict) else ""
        return ToolResult.success_result(
            {
                "action": "switch_tab",
                "target_id": target_id,
                "url": url,
                "title": title,
            }
        )
    else:
        return ToolResult.error_result(f"Tab not found: {target_id}")


async def _handle_evaluate(args: Dict[str, Any]) -> ToolResult:
    """Handle browser evaluate action."""
    controller = get_browser_controller()

    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    script = args.get("script")
    if not isinstance(script, str):
        return ToolResult.error_result("Missing required 'script' parameter")

    result = await controller.evaluate(script)

    if result.get("success"):
        return ToolResult.success_result(
            {
                "action": "evaluate",
                "script": script,
                "result": result.get("result"),
            }
        )
    else:
        return ToolResult.error_result(result.get("error", "Evaluate failed"))


async def _handle_console(args: Dict[str, Any]) -> ToolResult:
    """Return console logs for the current tab."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    level = args.get("level")
    if not isinstance(level, str):
        level = None

    limit_raw = args.get("limit")
    limit = int(limit_raw) if isinstance(limit_raw, (int, float)) else 100
    clear = bool(args.get("clear", False))
    messages = await _maybe_await(
        controller.get_console_messages(level=level, limit=limit, clear=clear)
    )
    if not isinstance(messages, list):
        messages = []

    return ToolResult.success_result(
        {
            "action": "console",
            "level": level,
            "count": len(messages),
            "messages": messages,
            "cleared": clear,
        }
    )


async def _handle_errors(args: Dict[str, Any]) -> ToolResult:
    """Return captured page errors for the current tab."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    limit_raw = args.get("limit")
    limit = int(limit_raw) if isinstance(limit_raw, (int, float)) else 100
    clear = bool(args.get("clear", False))
    errors = await _maybe_await(controller.get_page_errors(limit=limit, clear=clear))
    if not isinstance(errors, list):
        errors = []
    return ToolResult.success_result(
        {
            "action": "errors",
            "count": len(errors),
            "errors": errors,
            "cleared": clear,
        }
    )


async def _handle_requests(args: Dict[str, Any]) -> ToolResult:
    """Return captured network requests for the current tab."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    limit_raw = args.get("limit")
    limit = int(limit_raw) if isinstance(limit_raw, (int, float)) else 100
    contains = args.get("contains")
    if contains is None:
        contains = args.get("filter")
    if contains is not None and not isinstance(contains, str):
        contains = None
    clear = bool(args.get("clear", False))
    requests = await _maybe_await(
        controller.get_network_requests(limit=limit, contains=contains, clear=clear)
    )
    if not isinstance(requests, list):
        requests = []
    return ToolResult.success_result(
        {
            "action": "requests",
            "count": len(requests),
            "requests": requests,
            "cleared": clear,
        }
    )


async def _handle_trace_start(args: Dict[str, Any]) -> ToolResult:
    """Start Playwright tracing."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    snapshots = bool(args.get("snapshots", True))
    screenshots = bool(args.get("screenshots", True))
    sources = bool(args.get("sources", True))
    result = await controller.trace_start(
        snapshots=snapshots,
        screenshots=screenshots,
        sources=sources,
    )
    if result.get("success"):
        return ToolResult.success_result(
            {
                "action": "trace_start",
                "snapshots": snapshots,
                "screenshots": screenshots,
                "sources": sources,
            }
        )
    return ToolResult.error_result(result.get("error", "Trace start failed"))


async def _handle_trace_stop(args: Dict[str, Any]) -> ToolResult:
    """Stop Playwright tracing and return trace artifact bytes."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    result = await controller.trace_stop()
    if not result.get("success"):
        return ToolResult.error_result(result.get("error", "Trace stop failed"))
    trace_bytes = result.get("trace_bytes")
    if not isinstance(trace_bytes, (bytes, bytearray)):
        return ToolResult.error_result("Trace stop failed: missing trace bytes")
    trace_b64 = base64.b64encode(bytes(trace_bytes)).decode("utf-8")
    return ToolResult.success_result(
        {
            "action": "trace_stop",
            "format": "zip",
            "trace_data": trace_b64,
            "trace_size_bytes": len(trace_bytes),
        }
    )


async def _handle_pdf(args: Dict[str, Any]) -> ToolResult:
    """Generate page PDF."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    pdf_bytes = await controller.pdf()
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return ToolResult.success_result(
        {
            "action": "pdf",
            "format": "pdf",
            "pdf_data": pdf_b64,
            "pdf_size_bytes": len(pdf_bytes),
        }
    )


async def _handle_cookies(args: Dict[str, Any]) -> ToolResult:
    """Get browser cookies."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    cookies = await controller.get_cookies()
    return ToolResult.success_result(
        {
            "action": "cookies",
            "count": len(cookies),
            "cookies": cookies,
        }
    )


async def _handle_cookies_set(args: Dict[str, Any]) -> ToolResult:
    """Set browser cookies."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    cookies = args.get("cookies")
    if not isinstance(cookies, list) or not cookies:
        return ToolResult.error_result("cookies_set requires non-empty 'cookies' array")
    result = await controller.set_cookies(cookies)
    if result.get("success"):
        return ToolResult.success_result({"action": "cookies_set", **result})
    return ToolResult.error_result(result.get("error", "Setting cookies failed"))


async def _handle_cookies_clear(args: Dict[str, Any]) -> ToolResult:
    """Clear browser cookies."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    result = await controller.clear_cookies()
    if result.get("success"):
        return ToolResult.success_result({"action": "cookies_clear"})
    return ToolResult.error_result(result.get("error", "Clearing cookies failed"))


def _normalize_storage_kind(args: Dict[str, Any]) -> str:
    kind = args.get("kind")
    if not isinstance(kind, str):
        kind = "local"
    kind = kind.strip().lower()
    return "session" if kind == "session" else "local"


async def _handle_storage_get(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    kind = _normalize_storage_kind(args)
    data = await controller.get_storage(kind)
    return ToolResult.success_result(
        {
            "action": "storage_get",
            "kind": kind,
            "count": len(data),
            "values": data,
        }
    )


async def _handle_storage_set(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    kind = _normalize_storage_kind(args)
    values = args.get("values")
    if not isinstance(values, dict):
        key = args.get("key")
        value = args.get("value")
        if isinstance(key, str):
            values = {key: "" if value is None else str(value)}
        else:
            return ToolResult.error_result(
                "storage_set requires 'values' object or 'key'/'value'"
            )
    normalized = {str(k): str(v) for k, v in values.items()}
    result = await controller.set_storage(kind, normalized)
    return ToolResult.success_result({"action": "storage_set", "kind": kind, **result})


async def _handle_storage_clear(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    kind = _normalize_storage_kind(args)
    result = await controller.clear_storage(kind)
    return ToolResult.success_result(
        {"action": "storage_clear", "kind": kind, **result}
    )


async def _handle_set_offline(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    offline = bool(args.get("offline", args.get("enabled", True)))
    result = await controller.set_offline(offline)
    if result.get("success"):
        return ToolResult.success_result({"action": "set_offline", **result})
    return ToolResult.error_result(result.get("error", "set_offline failed"))


async def _handle_set_headers(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    if bool(args.get("clear", False)):
        result = await controller.set_headers({})
    else:
        headers = args.get("headers")
        if not isinstance(headers, dict):
            return ToolResult.error_result(
                "set_headers requires 'headers' object or clear=true"
            )
        result = await controller.set_headers(
            {str(k): str(v) for k, v in headers.items()}
        )
    if result.get("success"):
        return ToolResult.success_result({"action": "set_headers", **result})
    return ToolResult.error_result(result.get("error", "set_headers failed"))


async def _handle_set_credentials(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    clear = bool(args.get("clear", False))
    username = args.get("username")
    password = args.get("password")
    if username is None:
        username = args.get("user")
    result = await controller.set_http_credentials(
        username=str(username) if username is not None else None,
        password=str(password) if password is not None else None,
        clear=clear,
    )
    if result.get("success"):
        return ToolResult.success_result({"action": "set_credentials", **result})
    return ToolResult.error_result(result.get("error", "set_credentials failed"))


async def _handle_set_geolocation(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    clear = bool(args.get("clear", False))
    lat = args.get("latitude")
    lon = args.get("longitude")
    acc = args.get("accuracy")
    result = await controller.set_geolocation(
        latitude=float(lat) if isinstance(lat, (int, float)) else None,
        longitude=float(lon) if isinstance(lon, (int, float)) else None,
        accuracy=float(acc) if isinstance(acc, (int, float)) else None,
        clear=clear,
    )
    if result.get("success"):
        return ToolResult.success_result({"action": "set_geolocation", **result})
    return ToolResult.error_result(result.get("error", "set_geolocation failed"))


async def _handle_set_media(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    media = args.get("media")
    if media is not None and not isinstance(media, str):
        media = None
    color_scheme = args.get("color_scheme")
    if color_scheme is None:
        color_scheme = args.get("colorScheme")
    if color_scheme is not None and not isinstance(color_scheme, str):
        color_scheme = None
    result = await controller.set_media(media=media, color_scheme=color_scheme)
    if result.get("success"):
        return ToolResult.success_result({"action": "set_media", **result})
    return ToolResult.error_result(result.get("error", "set_media failed"))


async def _handle_set_timezone(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    timezone = args.get("timezone")
    if not isinstance(timezone, str) or not timezone.strip():
        return ToolResult.error_result("set_timezone requires non-empty 'timezone'")
    result = await controller.set_timezone(timezone.strip())
    if result.get("success"):
        return ToolResult.success_result({"action": "set_timezone", **result})
    return ToolResult.error_result(result.get("error", "set_timezone failed"))


async def _handle_set_locale(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    locale = args.get("locale")
    if not isinstance(locale, str) or not locale.strip():
        return ToolResult.error_result("set_locale requires non-empty 'locale'")
    result = await controller.set_locale(locale.strip())
    if result.get("success"):
        return ToolResult.success_result({"action": "set_locale", **result})
    return ToolResult.error_result(result.get("error", "set_locale failed"))


async def _handle_set_device(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    device = args.get("device")
    if not isinstance(device, str) or not device.strip():
        return ToolResult.error_result("set_device requires non-empty 'device'")
    result = await controller.set_device(device.strip())
    if result.get("success"):
        return ToolResult.success_result({"action": "set_device", **result})
    return ToolResult.error_result(result.get("error", "set_device failed"))


async def _handle_upload(args: Dict[str, Any]) -> ToolResult:
    """Set file inputs by element ref."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    paths_raw = args.get("paths")
    if not isinstance(paths_raw, list) or not paths_raw:
        return ToolResult.error_result(
            "Missing required 'paths' parameter (string array)"
        )
    paths: List[str] = [str(p) for p in paths_raw]

    ref = args.get("inputRef") or args.get("input_ref") or args.get("ref")
    if not isinstance(ref, str) or not ref:
        return ToolResult.error_result(
            "Missing required input ref ('inputRef', 'input_ref', or 'ref')"
        )

    result = await controller.set_input_files(ref=ref, paths=paths)
    if result.get("success"):
        return ToolResult.success_result(result)
    return ToolResult.error_result(result.get("error", "Upload failed"))


async def _handle_dialog(args: Dict[str, Any]) -> ToolResult:
    """Arm and/or wait for JS dialogs (alert/confirm/prompt)."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    accept = bool(args.get("accept", True))
    prompt_text = args.get("promptText")
    if prompt_text is None:
        prompt_text = args.get("prompt_text")
    if prompt_text is not None and not isinstance(prompt_text, str):
        return ToolResult.error_result(
            "promptText/prompt_text must be a string when provided"
        )

    timeout_raw = args.get("timeoutMs")
    if timeout_raw is None:
        timeout_raw = args.get("timeout_ms")
    timeout_ms = int(timeout_raw) if isinstance(timeout_raw, (int, float)) else 0

    clear = bool(args.get("clear", False))
    if clear:
        _ = await _maybe_await(controller.get_dialog_events(clear=True))

    controller.arm_dialog(accept=accept, prompt_text=prompt_text)

    if timeout_ms > 0:
        event = await controller.wait_for_dialog(timeout_ms=timeout_ms)
        if not event:
            return ToolResult.error_result(f"No dialog received within {timeout_ms}ms")
        return ToolResult.success_result(
            {
                "action": "dialog",
                "armed": False,
                "accept": accept,
                "handled": event,
            }
        )

    return ToolResult.success_result(
        {
            "action": "dialog",
            "armed": True,
            "accept": accept,
            "prompt_text": prompt_text,
            "recent": (
                await _maybe_await(controller.get_dialog_events(limit=10, clear=False))
            )
            or [],
        }
    )


async def _handle_act(args: Dict[str, Any]) -> ToolResult:
    """OpenClaw-style action envelope."""
    request = args.get("request")
    if not isinstance(request, dict):
        return ToolResult.error_result("act requires a 'request' object")

    kind = request.get("kind")
    if not isinstance(kind, str) or not kind:
        return ToolResult.error_result("act.request.kind is required")

    kind = kind.strip().lower()
    merged = {**args, **request}

    if kind == "click":
        return await _handle_click(merged)
    if kind == "type":
        return await _handle_type(merged)
    if kind == "press":
        return await _handle_press(
            {"action": "press", "key": merged.get("key"), **merged}
        )
    if kind == "hover":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result(
                "Browser not connected. Run 'connect' action first."
            )
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        ref = merged.get("ref")
        if not isinstance(ref, str) or not ref:
            return ToolResult.error_result("act.hover requires 'ref'")
        result = await controller.hover(ref=ref)
        return (
            ToolResult.success_result(result)
            if result.get("success")
            else ToolResult.error_result(result.get("error", "Hover failed"))
        )
    if kind == "drag":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result(
                "Browser not connected. Run 'connect' action first."
            )
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        start_ref = merged.get("startRef")
        end_ref = merged.get("endRef")
        if not isinstance(start_ref, str) or not isinstance(end_ref, str):
            return ToolResult.error_result("act.drag requires 'startRef' and 'endRef'")
        result = await controller.drag(start_ref=start_ref, end_ref=end_ref)
        return (
            ToolResult.success_result(result)
            if result.get("success")
            else ToolResult.error_result(result.get("error", "Drag failed"))
        )
    if kind == "select":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result(
                "Browser not connected. Run 'connect' action first."
            )
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        ref = merged.get("ref")
        values = merged.get("values")
        if not isinstance(ref, str):
            return ToolResult.error_result("act.select requires 'ref'")
        if not isinstance(values, list) or not values:
            return ToolResult.error_result(
                "act.select requires non-empty 'values' array"
            )
        result = await controller.select_options(
            ref=ref, values=[str(v) for v in values]
        )
        return (
            ToolResult.success_result(result)
            if result.get("success")
            else ToolResult.error_result(result.get("error", "Select failed"))
        )
    if kind == "fill":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result(
                "Browser not connected. Run 'connect' action first."
            )
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        fields = merged.get("fields")
        if not isinstance(fields, list):
            return ToolResult.error_result("act.fill requires 'fields' array")
        result = await controller.fill_fields(fields)
        return (
            ToolResult.success_result(result)
            if result.get("success")
            else ToolResult.error_result("Fill completed with errors")
        )
    if kind == "resize":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result(
                "Browser not connected. Run 'connect' action first."
            )
        width = merged.get("width")
        height = merged.get("height")
        if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
            return ToolResult.error_result("act.resize requires numeric width/height")
        result = await controller.resize_viewport(int(width), int(height))
        return (
            ToolResult.success_result(result)
            if result.get("success")
            else ToolResult.error_result(result.get("error", "Resize failed"))
        )
    if kind == "wait":
        time_ms = merged.get("timeMs")
        if isinstance(time_ms, (int, float)):
            return await _handle_wait(
                {
                    "action": "wait",
                    "seconds": max(0.0, float(time_ms) / 1000.0),
                    **merged,
                }
            )
        return await _handle_wait({"action": "wait", **merged})
    if kind == "evaluate":
        fn = merged.get("fn")
        if isinstance(fn, str):
            return await _handle_evaluate(
                {"action": "evaluate", "script": fn, **merged}
            )
        return await _handle_evaluate({"action": "evaluate", **merged})
    if kind == "close":
        return await _handle_close(merged)

    return ToolResult.error_result(f"Unsupported act kind: {kind}")


async def _handle_close(args: Dict[str, Any]) -> ToolResult:
    """Handle browser close action."""
    controller = get_browser_controller()

    await controller.close()

    return ToolResult.success_result(
        {
            "action": "close",
            "status": "closed",
        }
    )
