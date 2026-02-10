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
from typing import Any, Dict

from tools.browser.controller import get_browser_controller
from tools.result import ToolResult

logger = logging.getLogger(__name__)


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
        elif action == "navigate":
            return await _handle_navigate(raw_args)
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
        elif action == "close":
            return await _handle_close(raw_args)
        else:
            return ToolResult.error_result(f"Unhandled action: {action}")
    except Exception as e:
        logger.exception(f"Browser action '{action}' failed")
        return ToolResult.error_result(f"Action failed: {str(e)}")


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


async def _handle_navigate(args: Dict[str, Any]) -> ToolResult:
    """Handle browser navigate action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    url = args.get("url")
    if not isinstance(url, str) or not url:
        return ToolResult.error_result("Missing required 'url' parameter")

    result = await controller.navigate(url, args.get("wait_until", "networkidle"))
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "navigate",
            "url": result["url"],
            "title": result["title"],
            "status": result.get("status"),
        })
    else:
        return ToolResult.error_result(result.get("error", "Navigation failed"))


async def _handle_snapshot(args: Dict[str, Any]) -> ToolResult:
    """Handle browser snapshot action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    snapshot = await controller.get_page_snapshot(
        format_type=args.get("format", "ai"),
        max_chars=args.get("max_chars", 5000),
    )
    
    return ToolResult.success_result({
        "action": "snapshot",
        "format": args.get("format", "ai"),
        "url": snapshot.url,
        "title": snapshot.title,
        "snapshot": snapshot.text,
        "ref_count": snapshot.ref_count,
    })


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

    try:
        image_bytes = await controller.screenshot(
            full_page=full_page,
            ref=ref,
        )
        
        # Convert to base64 for JSON serialization
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        return ToolResult.success_result({
            "action": "screenshot",
            "format": "png",
            "full_page": full_page,
            "ref": ref,
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
    
    target_id = args.get("target_id")
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


async def _handle_close(args: Dict[str, Any]) -> ToolResult:
    """Handle browser close action."""
    controller = get_browser_controller()
    
    await controller.close()
    
    return ToolResult.success_result({
        "action": "close",
        "status": "closed",
    })
