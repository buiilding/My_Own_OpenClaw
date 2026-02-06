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

from pydantic import ValidationError

from tools.browser.controller import get_browser_controller
from tools.browser.schemas import (
    BrowserConnectArgs,
    BrowserNavigateArgs,
    BrowserSnapshotArgs,
    BrowserClickArgs,
    BrowserTypeArgs,
    BrowserPressArgs,
    BrowserScrollArgs,
    BrowserScreenshotArgs,
    BrowserWaitArgs,
    BrowserGetTabsArgs,
    BrowserSwitchTabArgs,
    BrowserEvaluateArgs,
    BrowserCloseArgs,
    get_browser_schema,
)
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
    action = raw_args.get("action")
    if not action:
        return ToolResult.error_result("Missing required 'action' parameter")
    
    # Validate arguments
    schema_class = get_browser_schema(action)
    if not schema_class:
        return ToolResult.error_result(f"Unknown browser action: {action}")
    
    try:
        validated_args = schema_class(**raw_args)
    except ValidationError as e:
        errors = "; ".join(
            f"{'.'.join(str(x) for x in err.get('loc', []))}: {err.get('msg', 'error')}"
            for err in e.errors()
        )
        return ToolResult.error_result(f"Validation error: {errors}")
    except Exception as e:
        return ToolResult.error_result(f"Argument validation failed: {str(e)}")
    
    # Route to appropriate handler
    try:
        if action == "connect":
            return await _handle_connect(validated_args)
        elif action == "navigate":
            return await _handle_navigate(validated_args)
        elif action == "snapshot":
            return await _handle_snapshot(validated_args)
        elif action == "click":
            return await _handle_click(validated_args)
        elif action == "type":
            return await _handle_type(validated_args)
        elif action == "press":
            return await _handle_press(validated_args)
        elif action == "scroll":
            return await _handle_scroll(validated_args)
        elif action == "screenshot":
            return await _handle_screenshot(validated_args)
        elif action == "wait":
            return await _handle_wait(validated_args)
        elif action == "get_tabs":
            return await _handle_get_tabs(validated_args)
        elif action == "switch_tab":
            return await _handle_switch_tab(validated_args)
        elif action == "evaluate":
            return await _handle_evaluate(validated_args)
        elif action == "close":
            return await _handle_close(validated_args)
        else:
            return ToolResult.error_result(f"Unhandled action: {action}")
    except Exception as e:
        logger.exception(f"Browser action '{action}' failed")
        return ToolResult.error_result(f"Action failed: {str(e)}")


async def _handle_connect(args: BrowserConnectArgs) -> ToolResult:
    """Handle browser connect action."""
    controller = get_browser_controller()
    
    # Close existing connection if any
    if controller.is_connected:
        await controller.close()
    
    try:
        if args.mode == "user_chrome":
            result = await controller.connect_to_user_chrome(
                cdp_url=args.cdp_url,
            )
        else:
            result = await controller.launch_managed_browser(
                headless=args.headless,
                executable_path=args.executable_path,
            )
        
        return ToolResult.success_result({
            "status": result["status"],
            "mode": result["mode"],
            "url": result["url"],
            "title": result.get("title", ""),
            "message": f"Browser {result['status']} in {result['mode']} mode",
        })
    except ConnectionError as e:
        return ToolResult.error_result(
            f"Cannot connect to Chrome. Make sure Chrome is running with "
            f"--remote-debugging-port=9222. Error: {str(e)}"
        )
    except RuntimeError as e:
        return ToolResult.error_result(str(e))


async def _handle_navigate(args: BrowserNavigateArgs) -> ToolResult:
    """Handle browser navigate action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    result = await controller.navigate(args.url, args.wait_until)
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "navigate",
            "url": result["url"],
            "title": result["title"],
            "status": result.get("status"),
        })
    else:
        return ToolResult.error_result(result.get("error", "Navigation failed"))


async def _handle_snapshot(args: BrowserSnapshotArgs) -> ToolResult:
    """Handle browser snapshot action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    snapshot = await controller.get_page_snapshot(
        format_type=args.format,
        max_chars=args.max_chars,
    )
    
    return ToolResult.success_result({
        "action": "snapshot",
        "format": args.format,
        "url": snapshot.url,
        "title": snapshot.title,
        "snapshot": snapshot.text,
        "refs": snapshot.refs,
        "ref_count": len(snapshot.refs),
    })


async def _handle_click(args: BrowserClickArgs) -> ToolResult:
    """Handle browser click action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    result = await controller.click(
        ref=args.ref,
        double_click=args.double_click,
        button=args.button,
    )
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "click",
            "ref": args.ref,
            "double_click": args.double_click,
            "button": args.button,
        })
    else:
        return ToolResult.error_result(result.get("error", "Click failed"))


async def _handle_type(args: BrowserTypeArgs) -> ToolResult:
    """Handle browser type action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    result = await controller.type_text(
        ref=args.ref,
        text=args.text,
        submit=args.submit,
        clear_first=args.clear_first,
    )
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "type",
            "ref": args.ref,
            "text": args.text,
            "submit": args.submit,
        })
    else:
        return ToolResult.error_result(result.get("error", "Type failed"))


async def _handle_press(args: BrowserPressArgs) -> ToolResult:
    """Handle browser press action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    result = await controller.press_key(args.key)
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "press",
            "key": args.key,
        })
    else:
        return ToolResult.error_result(result.get("error", "Key press failed"))


async def _handle_scroll(args: BrowserScrollArgs) -> ToolResult:
    """Handle browser scroll action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    result = await controller.scroll(args.direction, args.amount)
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "scroll",
            "direction": args.direction,
            "amount": args.amount,
        })
    else:
        return ToolResult.error_result(result.get("error", "Scroll failed"))


async def _handle_screenshot(args: BrowserScreenshotArgs) -> ToolResult:
    """Handle browser screenshot action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    try:
        image_bytes = await controller.screenshot(
            full_page=args.full_page,
            ref=args.ref,
        )
        
        # Convert to base64 for JSON serialization
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        return ToolResult.success_result({
            "action": "screenshot",
            "format": "png",
            "full_page": args.full_page,
            "ref": args.ref,
            "image_data": image_b64,
            "image_size_bytes": len(image_bytes),
        })
    except Exception as e:
        return ToolResult.error_result(f"Screenshot failed: {str(e)}")


async def _handle_wait(args: BrowserWaitArgs) -> ToolResult:
    """Handle browser wait action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    if args.seconds is not None:
        # Fixed time wait
        import asyncio
        await asyncio.sleep(args.seconds)
        return ToolResult.success_result({
            "action": "wait",
            "type": "time",
            "seconds": args.seconds,
        })
    else:
        # Wait for load state
        result = await controller.wait_for_load(args.state)
        
        if result.get("success"):
            return ToolResult.success_result({
                "action": "wait",
                "type": "load_state",
                "state": args.state,
            })
        else:
            return ToolResult.error_result(result.get("error", "Wait failed"))


async def _handle_get_tabs(args: BrowserGetTabsArgs) -> ToolResult:
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


async def _handle_switch_tab(args: BrowserSwitchTabArgs) -> ToolResult:
    """Handle browser switch_tab action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    success = await controller.switch_tab(args.target_id)
    
    if success:
        return ToolResult.success_result({
            "action": "switch_tab",
            "target_id": args.target_id,
            "url": controller.current_url,
            "title": controller.current_title,
        })
    else:
        return ToolResult.error_result(f"Tab not found: {args.target_id}")


async def _handle_evaluate(args: BrowserEvaluateArgs) -> ToolResult:
    """Handle browser evaluate action."""
    controller = get_browser_controller()
    
    if not controller.is_connected:
        return ToolResult.error_result(
            "Browser not connected. Run 'connect' action first."
        )
    
    result = await controller.evaluate(args.script)
    
    if result.get("success"):
        return ToolResult.success_result({
            "action": "evaluate",
            "script": args.script,
            "result": result.get("result"),
        })
    else:
        return ToolResult.error_result(result.get("error", "Evaluate failed"))


async def _handle_close(args: BrowserCloseArgs) -> ToolResult:
    """Handle browser close action."""
    controller = get_browser_controller()
    
    await controller.close()
    
    return ToolResult.success_result({
        "action": "close",
        "status": "closed",
    })
