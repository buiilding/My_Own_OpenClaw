"""Scroll Control Tool - targeted coarse scrolling using pyautogui.

Vertical scrolling defaults to an executor-owned OS-default literal click
count, with explicit `clicks` retained as a literal override.
Horizontal scrolling continues to use click-based behavior.
"""

import asyncio
import logging
import time
from typing import Dict, Any

from core.executors import get_interactive_executor
from tools.result import ToolResult
from .scroll_config import (
    calculate_scroll_clicks,
    get_default_scroll_clicks,
)

logger = logging.getLogger(__name__)


async def execute_scroll_control(args: Dict[str, Any]) -> ToolResult:
    """Execute scroll control action with targeted coarse vertical scrolling.

    Args:
        args: Dictionary with:
            - 'action': "scroll", "scroll_up", or "scroll_down"
            - 'x': Required X coordinate to move to before scrolling
            - 'y': Required Y coordinate to move to before scrolling
        - 'clicks': Optional explicit literal OS click override
            - 'direction': "up", "down", "left", or "right" (for "scroll" action)

    Returns:
        ToolResult with scroll result data including:
        - 'scroll_mode': Whether the executor used coarse auto scrolling or
          explicit clicks
        - 'os_clicks': Actual literal wheel clicks sent to OS
    """
    action = args.get("action")
    x = args.get("x")
    y = args.get("y")
    requested_clicks = args.get("clicks")
    direction = args.get("direction")

    if not action:
        return ToolResult.error_result("action is required")

    try:
        import pyautogui

        # Disable pyautogui failsafe
        pyautogui.FAILSAFE = False

        def _resolve_vertical_scroll(direction_name: str) -> tuple[int, Dict[str, Any]]:
            if requested_clicks is None:
                os_clicks = get_default_scroll_clicks()
                return os_clicks, {
                    "scroll_mode": "default_clicks",
                    "requested_clicks": None,
                    "direction": direction_name,
                }

            os_clicks = calculate_scroll_clicks(requested_clicks, direction_name)
            return os_clicks, {
                "scroll_mode": "manual_clicks",
                "requested_clicks": requested_clicks,
                "direction": direction_name,
            }

        def _execute_action():
            if x is None or y is None:
                raise ValueError("x and y are required for scroll_control")

            pyautogui.moveTo(x, y)
            # Let cursor/window settle before scroll (consistent across polling rates)
            time.sleep(0.5)

            if action == "scroll":
                if not direction:
                    raise ValueError("direction required for scroll action")

                if direction in {"up", "down"}:
                    clicks, scroll_meta = _resolve_vertical_scroll(direction)
                else:
                    clicks = calculate_scroll_clicks(requested_clicks, direction)
                    scroll_meta = {
                        "scroll_mode": (
                            "manual_clicks"
                            if requested_clicks is not None
                            else "default_clicks"
                        ),
                        "requested_clicks": requested_clicks,
                        "direction": direction,
                    }

                # vscroll: positive=up, negative=down.
                # hscroll: positive=right, negative=left.
                if direction == "up":
                    pyautogui.vscroll(clicks)
                elif direction == "down":
                    pyautogui.vscroll(-clicks)
                elif direction == "left":
                    try:
                        pyautogui.hscroll(-clicks)
                    except AttributeError:
                        # Fallback on platforms without hscroll
                        pyautogui.vscroll(-clicks)
                elif direction == "right":
                    try:
                        pyautogui.hscroll(clicks)
                    except AttributeError:
                        # Fallback on platforms without hscroll
                        pyautogui.vscroll(clicks)
                else:
                    raise ValueError(f"Invalid scroll direction: {direction}")

                return {
                    "action": "scroll",
                    "os_clicks": clicks,
                    "coordinates": [x, y],
                    "direction": direction,
                    "message": (
                        f"Scrolled {direction} with {scroll_meta['scroll_mode']}"
                    ),
                    "output": (
                        f"Scrolled {direction} using {scroll_meta['scroll_mode']} "
                        f"({clicks} OS clicks)"
                    ),
                    **scroll_meta,
                }

            elif action == "scroll_up":
                clicks, scroll_meta = _resolve_vertical_scroll("up")
                pyautogui.vscroll(clicks)
                return {
                    "action": "scroll_up",
                    "os_clicks": clicks,
                    "coordinates": [x, y],
                    "message": f"Scrolled up with {scroll_meta['scroll_mode']}",
                    "output": (
                        f"Scrolled up using {scroll_meta['scroll_mode']} "
                        f"({clicks} OS clicks)"
                    ),
                    **scroll_meta,
                }

            elif action == "scroll_down":
                clicks, scroll_meta = _resolve_vertical_scroll("down")
                pyautogui.vscroll(-clicks)
                return {
                    "action": "scroll_down",
                    "os_clicks": clicks,
                    "coordinates": [x, y],
                    "message": f"Scrolled down with {scroll_meta['scroll_mode']}",
                    "output": (
                        f"Scrolled down using {scroll_meta['scroll_mode']} "
                        f"({clicks} OS clicks)"
                    ),
                    **scroll_meta,
                }

            else:
                raise ValueError(f"Unknown scroll action: {action}")

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(get_interactive_executor(), _execute_action)

        return ToolResult.success_result(result)
    except ImportError:
        logger.error("pyautogui not available, cannot execute scroll control")
        return ToolResult.error_result("pyautogui library not available")
    except Exception as e:
        logger.error(f"Scroll control failed: {e}", exc_info=True)
        return ToolResult.error_result(f"Scroll control failed: {str(e)}")
