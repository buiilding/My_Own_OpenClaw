"""
Browser control tool implementation for WindieOS sidecar.

Provides web browser automation capabilities including:
- User Chrome control via CDP
- Managed Chromium instance
- Page snapshots with element references
- Click, type, scroll, screenshot actions
"""

import base64
import logging
import inspect
from typing import Any, Dict, List, Optional

from tools.browser.controller import get_browser_controller
from tools.result import ToolResult

logger = logging.getLogger(__name__)

DEFAULT_AI_SNAPSHOT_MAX_CHARS = 12_000
DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS = 8_000
DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH = 4


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
        if action == "connect":
            return await _handle_connect(raw_args)
        elif action == "status":
            return await _handle_status(raw_args)
        elif action == "profiles":
            return await _handle_profiles(raw_args)
        elif action == "navigate":
            return await _handle_navigate(raw_args)
        elif action == "open":
            return await _handle_open(raw_args)
        elif action == "snapshot":
            return await _handle_snapshot(raw_args)
        elif action == "click":
            return await _handle_click(raw_args)
        elif action == "type":
            return await _handle_type(raw_args)
        elif action == "press":
            return await _handle_press(raw_args)
        elif action == "scroll":
            return await _handle_scroll(raw_args)
        elif action == "screenshot":
            return await _handle_screenshot(raw_args)
        elif action == "wait":
            return await _handle_wait(raw_args)
        elif action == "get_tabs":
            return await _handle_get_tabs(raw_args)
        elif action == "switch_tab":
            return await _handle_switch_tab(raw_args)
        elif action == "evaluate":
            return await _handle_evaluate(raw_args)
        elif action == "console":
            return await _handle_console(raw_args)
        elif action == "errors":
            return await _handle_errors(raw_args)
        elif action == "requests":
            return await _handle_requests(raw_args)
        elif action == "trace_start":
            return await _handle_trace_start(raw_args)
        elif action == "trace_stop":
            return await _handle_trace_stop(raw_args)
        elif action == "pdf":
            return await _handle_pdf(raw_args)
        elif action == "upload":
            return await _handle_upload(raw_args)
        elif action == "dialog":
            return await _handle_dialog(raw_args)
        elif action == "cookies":
            return await _handle_cookies(raw_args)
        elif action == "cookies_set":
            return await _handle_cookies_set(raw_args)
        elif action == "cookies_clear":
            return await _handle_cookies_clear(raw_args)
        elif action == "storage_get":
            return await _handle_storage_get(raw_args)
        elif action == "storage_set":
            return await _handle_storage_set(raw_args)
        elif action == "storage_clear":
            return await _handle_storage_clear(raw_args)
        elif action == "set_offline":
            return await _handle_set_offline(raw_args)
        elif action == "set_headers":
            return await _handle_set_headers(raw_args)
        elif action == "set_credentials":
            return await _handle_set_credentials(raw_args)
        elif action == "set_geolocation":
            return await _handle_set_geolocation(raw_args)
        elif action == "set_media":
            return await _handle_set_media(raw_args)
        elif action == "set_timezone":
            return await _handle_set_timezone(raw_args)
        elif action == "set_locale":
            return await _handle_set_locale(raw_args)
        elif action == "set_device":
            return await _handle_set_device(raw_args)
        elif action == "highlight":
            return await _handle_highlight(raw_args)
        elif action == "act":
            return await _handle_act(raw_args)
        elif action == "close":
            return await _handle_close(raw_args)
        else:
            return ToolResult.error_result(f"Unhandled action: {action}")
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


async def _focus_target_if_requested(controller, args: Dict[str, Any]) -> Optional[ToolResult]:
    target_id = _extract_target_id(args)
    if not target_id:
        return None
    switched = await controller.switch_tab(target_id)
    if not switched:
        return ToolResult.error_result(f"Tab not found: {target_id}")
    return None


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
        
        return ToolResult.success_result({
            "status": result["status"],
            "mode": result["mode"],
            "url": result["url"],
            "title": result.get("title", ""),
            "auto_launched": result.get("auto_launched", False),
            "message": message,
        })
    except ConnectionError as e:
        return ToolResult.error_result(
            f"Failed to connect to Chrome. {str(e)}"
        )
    except RuntimeError as e:
        return ToolResult.error_result(str(e))


async def _handle_status(args: Dict[str, Any]) -> ToolResult:
    """Handle browser status action."""
    controller = get_browser_controller()
    status = await controller.get_status()
    return ToolResult.success_result({
        "action": "status",
        "connected": status["connected"],
        "mode": status.get("mode"),
        "url": status.get("url", ""),
        "title": status.get("title", ""),
        "tab_count": status.get("tab_count", 0),
        "target_id": status.get("target_id"),
    })


async def _handle_profiles(args: Dict[str, Any]) -> ToolResult:
    """Return WindieOS browser profile equivalents."""
    return ToolResult.success_result({
        "action": "profiles",
        "profiles": [
            {"name": "user_chrome", "driver": "cdp"},
            {"name": "managed", "driver": "playwright"},
        ],
        "default_profile": "user_chrome",
    })


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
        return ToolResult.success_result({
            "action": "navigate",
            "url": result["url"],
            "title": result["title"],
            "status": result.get("status"),
        })
    else:
        return ToolResult.error_result(result.get("error", "Navigation failed"))


async def _handle_open(args: Dict[str, Any]) -> ToolResult:
    """OpenClaw-compatible open action: opens a new tab and navigates."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")

    url = _extract_url(args) or "about:blank"
    result = await controller.open_tab(url=url)
    if not result.get("success"):
        return ToolResult.error_result(result.get("error", "Open failed"))
    return ToolResult.success_result({
        "action": "open",
        "target_id": result["target_id"],
        "url": result["url"],
        "title": result["title"],
        "status": result.get("status"),
    })


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

    refs_mode_raw = args.get("refs")
    refs_mode = refs_mode_raw if refs_mode_raw in ("role", "aria") else None

    interactive = args.get("interactive") if isinstance(args.get("interactive"), bool) else None
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

    snapshot = await controller.get_page_snapshot(
        format_type=format_type,
        max_chars=resolved_max_chars or DEFAULT_AI_SNAPSHOT_MAX_CHARS,
        refs_mode=refs_mode,
        interactive=interactive,
        compact=compact,
        depth=depth,
        selector=selector,
        frame_selector=frame_selector,
    )

    result: Dict[str, Any] = {
        "action": "snapshot",
        "format": format_type,
        "url": snapshot.url,
        "title": snapshot.title,
        "snapshot": snapshot.text,
        "ref_count": snapshot.ref_count,
    }

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
        return ToolResult.success_result({
            "action": "click",
            "ref": ref,
            "double_click": double_click,
            "button": button,
        })
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
        return ToolResult.success_result({
            "action": "type",
            "ref": ref,
            "text": text,
            "submit": submit,
        })
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
        return ToolResult.success_result({
            "action": "press",
            "key": key,
        })
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
        return ToolResult.success_result({
            "action": "scroll",
            "direction": direction,
            "amount": amount,
        })
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
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        return ToolResult.success_result({
            "action": "screenshot",
            "format": image_type,
            "full_page": full_page,
            "ref": ref,
            "element": element if isinstance(element, str) else None,
            "image_data": image_b64,
            "image_size_bytes": len(image_bytes),
        })
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
        return ToolResult.success_result({
            "action": "wait",
            "type": "time",
            "seconds": seconds,
        })
    else:
        # Wait for load state
        state = args.get("state", "networkidle")
        result = await controller.wait_for_load(state)
        
        if result.get("success"):
            return ToolResult.success_result({
                "action": "wait",
                "type": "load_state",
                "state": state,
            })
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
    
    return ToolResult.success_result({
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
    })


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
        return ToolResult.success_result({
            "action": "switch_tab",
            "target_id": target_id,
            "url": controller.current_url,
            "title": controller.current_title,
        })
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
        return ToolResult.success_result({
            "action": "evaluate",
            "script": script,
            "result": result.get("result"),
        })
    else:
        return ToolResult.error_result(result.get("error", "Evaluate failed"))


async def _handle_console(args: Dict[str, Any]) -> ToolResult:
    """Return console logs for the current tab."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")

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

    return ToolResult.success_result({
        "action": "console",
        "level": level,
        "count": len(messages),
        "messages": messages,
        "cleared": clear,
    })


async def _handle_errors(args: Dict[str, Any]) -> ToolResult:
    """Return captured page errors for the current tab."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    limit_raw = args.get("limit")
    limit = int(limit_raw) if isinstance(limit_raw, (int, float)) else 100
    clear = bool(args.get("clear", False))
    errors = await _maybe_await(controller.get_page_errors(limit=limit, clear=clear))
    if not isinstance(errors, list):
        errors = []
    return ToolResult.success_result({
        "action": "errors",
        "count": len(errors),
        "errors": errors,
        "cleared": clear,
    })


async def _handle_requests(args: Dict[str, Any]) -> ToolResult:
    """Return captured network requests for the current tab."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
    return ToolResult.success_result({
        "action": "requests",
        "count": len(requests),
        "requests": requests,
        "cleared": clear,
    })


async def _handle_trace_start(args: Dict[str, Any]) -> ToolResult:
    """Start Playwright tracing."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.success_result({
            "action": "trace_start",
            "snapshots": snapshots,
            "screenshots": screenshots,
            "sources": sources,
        })
    return ToolResult.error_result(result.get("error", "Trace start failed"))


async def _handle_trace_stop(args: Dict[str, Any]) -> ToolResult:
    """Stop Playwright tracing and return trace artifact bytes."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")

    result = await controller.trace_stop()
    if not result.get("success"):
        return ToolResult.error_result(result.get("error", "Trace stop failed"))
    trace_bytes = result.get("trace_bytes")
    if not isinstance(trace_bytes, (bytes, bytearray)):
        return ToolResult.error_result("Trace stop failed: missing trace bytes")
    trace_b64 = base64.b64encode(bytes(trace_bytes)).decode("utf-8")
    return ToolResult.success_result({
        "action": "trace_stop",
        "format": "zip",
        "trace_data": trace_b64,
        "trace_size_bytes": len(trace_bytes),
    })


async def _handle_pdf(args: Dict[str, Any]) -> ToolResult:
    """Generate page PDF."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    pdf_bytes = await controller.pdf()
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return ToolResult.success_result({
        "action": "pdf",
        "format": "pdf",
        "pdf_data": pdf_b64,
        "pdf_size_bytes": len(pdf_bytes),
    })


async def _handle_cookies(args: Dict[str, Any]) -> ToolResult:
    """Get browser cookies."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    cookies = await controller.get_cookies()
    return ToolResult.success_result({
        "action": "cookies",
        "count": len(cookies),
        "cookies": cookies,
    })


async def _handle_cookies_set(args: Dict[str, Any]) -> ToolResult:
    """Set browser cookies."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    kind = _normalize_storage_kind(args)
    data = await controller.get_storage(kind)
    return ToolResult.success_result({
        "action": "storage_get",
        "kind": kind,
        "count": len(data),
        "values": data,
    })


async def _handle_storage_set(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    kind = _normalize_storage_kind(args)
    values = args.get("values")
    if not isinstance(values, dict):
        key = args.get("key")
        value = args.get("value")
        if isinstance(key, str):
            values = {key: "" if value is None else str(value)}
        else:
            return ToolResult.error_result("storage_set requires 'values' object or 'key'/'value'")
    normalized = {str(k): str(v) for k, v in values.items()}
    result = await controller.set_storage(kind, normalized)
    return ToolResult.success_result({"action": "storage_set", "kind": kind, **result})


async def _handle_storage_clear(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    kind = _normalize_storage_kind(args)
    result = await controller.clear_storage(kind)
    return ToolResult.success_result({"action": "storage_clear", "kind": kind, **result})


async def _handle_set_offline(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    offline = bool(args.get("offline", args.get("enabled", True)))
    result = await controller.set_offline(offline)
    if result.get("success"):
        return ToolResult.success_result({"action": "set_offline", **result})
    return ToolResult.error_result(result.get("error", "set_offline failed"))


async def _handle_set_headers(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    if bool(args.get("clear", False)):
        result = await controller.set_headers({})
    else:
        headers = args.get("headers")
        if not isinstance(headers, dict):
            return ToolResult.error_result("set_headers requires 'headers' object or clear=true")
        result = await controller.set_headers({str(k): str(v) for k, v in headers.items()})
    if result.get("success"):
        return ToolResult.success_result({"action": "set_headers", **result})
    return ToolResult.error_result(result.get("error", "set_headers failed"))


async def _handle_set_credentials(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
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
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    device = args.get("device")
    if not isinstance(device, str) or not device.strip():
        return ToolResult.error_result("set_device requires non-empty 'device'")
    result = await controller.set_device(device.strip())
    if result.get("success"):
        return ToolResult.success_result({"action": "set_device", **result})
    return ToolResult.error_result(result.get("error", "set_device failed"))


async def _handle_highlight(args: Dict[str, Any]) -> ToolResult:
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error
    ref = args.get("ref")
    if not isinstance(ref, str) or not ref.strip():
        return ToolResult.error_result("highlight requires 'ref'")
    duration_raw = args.get("duration_ms")
    if duration_raw is None:
        duration_raw = args.get("durationMs")
    duration_ms = int(duration_raw) if isinstance(duration_raw, (int, float)) else 1000
    result = await controller.highlight(ref=ref.strip(), duration_ms=duration_ms)
    if result.get("success"):
        return ToolResult.success_result({"action": "highlight", **result})
    return ToolResult.error_result(result.get("error", "highlight failed"))


async def _handle_upload(args: Dict[str, Any]) -> ToolResult:
    """Set file inputs by element ref."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    paths_raw = args.get("paths")
    if not isinstance(paths_raw, list) or not paths_raw:
        return ToolResult.error_result("Missing required 'paths' parameter (string array)")
    paths: List[str] = [str(p) for p in paths_raw]

    ref = args.get("inputRef") or args.get("input_ref") or args.get("ref")
    if not isinstance(ref, str) or not ref:
        return ToolResult.error_result("Missing required input ref ('inputRef', 'input_ref', or 'ref')")

    result = await controller.set_input_files(ref=ref, paths=paths)
    if result.get("success"):
        return ToolResult.success_result(result)
    return ToolResult.error_result(result.get("error", "Upload failed"))


async def _handle_dialog(args: Dict[str, Any]) -> ToolResult:
    """Arm and/or wait for JS dialogs (alert/confirm/prompt)."""
    controller = get_browser_controller()
    if not controller.is_connected:
        return ToolResult.error_result("Browser not connected. Run 'connect' action first.")

    focus_error = await _focus_target_if_requested(controller, args)
    if focus_error:
        return focus_error

    accept = bool(args.get("accept", True))
    prompt_text = args.get("promptText")
    if prompt_text is None:
        prompt_text = args.get("prompt_text")
    if prompt_text is not None and not isinstance(prompt_text, str):
        return ToolResult.error_result("promptText/prompt_text must be a string when provided")

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
        return ToolResult.success_result({
            "action": "dialog",
            "armed": False,
            "accept": accept,
            "handled": event,
        })

    return ToolResult.success_result({
        "action": "dialog",
        "armed": True,
        "accept": accept,
        "prompt_text": prompt_text,
        "recent": (
            await _maybe_await(controller.get_dialog_events(limit=10, clear=False))
        ) or [],
    })


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
        return await _handle_press({"action": "press", "key": merged.get("key"), **merged})
    if kind == "hover":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        ref = merged.get("ref")
        if not isinstance(ref, str) or not ref:
            return ToolResult.error_result("act.hover requires 'ref'")
        result = await controller.hover(ref=ref)
        return ToolResult.success_result(result) if result.get("success") else ToolResult.error_result(result.get("error", "Hover failed"))
    if kind == "drag":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        start_ref = merged.get("startRef")
        end_ref = merged.get("endRef")
        if not isinstance(start_ref, str) or not isinstance(end_ref, str):
            return ToolResult.error_result("act.drag requires 'startRef' and 'endRef'")
        result = await controller.drag(start_ref=start_ref, end_ref=end_ref)
        return ToolResult.success_result(result) if result.get("success") else ToolResult.error_result(result.get("error", "Drag failed"))
    if kind == "select":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        ref = merged.get("ref")
        values = merged.get("values")
        if not isinstance(ref, str):
            return ToolResult.error_result("act.select requires 'ref'")
        if not isinstance(values, list) or not values:
            return ToolResult.error_result("act.select requires non-empty 'values' array")
        result = await controller.select_options(ref=ref, values=[str(v) for v in values])
        return ToolResult.success_result(result) if result.get("success") else ToolResult.error_result(result.get("error", "Select failed"))
    if kind == "fill":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
        focus_error = await _focus_target_if_requested(controller, merged)
        if focus_error:
            return focus_error
        fields = merged.get("fields")
        if not isinstance(fields, list):
            return ToolResult.error_result("act.fill requires 'fields' array")
        result = await controller.fill_fields(fields)
        return ToolResult.success_result(result) if result.get("success") else ToolResult.error_result("Fill completed with errors")
    if kind == "resize":
        controller = get_browser_controller()
        if not controller.is_connected:
            return ToolResult.error_result("Browser not connected. Run 'connect' action first.")
        width = merged.get("width")
        height = merged.get("height")
        if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
            return ToolResult.error_result("act.resize requires numeric width/height")
        result = await controller.resize_viewport(int(width), int(height))
        return ToolResult.success_result(result) if result.get("success") else ToolResult.error_result(result.get("error", "Resize failed"))
    if kind == "wait":
        time_ms = merged.get("timeMs")
        if isinstance(time_ms, (int, float)):
            return await _handle_wait({"action": "wait", "seconds": max(0.0, float(time_ms) / 1000.0), **merged})
        return await _handle_wait({"action": "wait", **merged})
    if kind == "evaluate":
        fn = merged.get("fn")
        if isinstance(fn, str):
            return await _handle_evaluate({"action": "evaluate", "script": fn, **merged})
        return await _handle_evaluate({"action": "evaluate", **merged})
    if kind == "close":
        return await _handle_close(merged)

    return ToolResult.error_result(f"Unsupported act kind: {kind}")


async def _handle_close(args: Dict[str, Any]) -> ToolResult:
    """Handle browser close action."""
    controller = get_browser_controller()
    
    await controller.close()
    
    return ToolResult.success_result({
        "action": "close",
        "status": "closed",
    })
