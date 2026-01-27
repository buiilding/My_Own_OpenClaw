"""
Scroll Control Tool - Python implementation using pyautogui.

Uses vscroll/hscroll for vertical/horizontal scroll. Includes time.sleep(0.5)
after moveTo and before scroll (agent-s pattern) for consistent behavior across
different polling rates and operating systems.
"""

import asyncio
import logging
import time
from typing import Dict, Any

logger = logging.getLogger(__name__)


async def execute_scroll_control(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute scroll control action.

    Args:
        args: Dictionary with 'action', 'x', 'y', 'clicks', 'direction'

    Returns:
        Dictionary with success status and scroll result
    """
    action = args.get("action")
    x = args.get("x")
    y = args.get("y")
    clicks = args.get("clicks", 5)
    direction = args.get("direction")

    if not action:
        return {"success": False, "error": "action is required"}

    try:
        import pyautogui

        # Disable pyautogui failsafe
        pyautogui.FAILSAFE = False

        def _execute_action():
            if action == "scroll":
                if not direction:
                    raise ValueError("direction required for scroll action")

                if x is not None and y is not None:
                    pyautogui.moveTo(x, y)
                    time.sleep(0.5)  # Let cursor/window settle before scroll (consistent across polling rates)

                # vscroll: positive=up, negative=down. hscroll: positive=right, negative=left.
                if direction == "up":
                    pyautogui.vscroll(clicks)
                elif direction == "down":
                    pyautogui.vscroll(-clicks)
                elif direction == "left":
                    try:
                        pyautogui.hscroll(-clicks)
                    except AttributeError:
                        pyautogui.vscroll(-clicks)  # Fallback on platforms without hscroll
                elif direction == "right":
                    try:
                        pyautogui.hscroll(clicks)
                    except AttributeError:
                        pyautogui.vscroll(clicks)  # Fallback on platforms without hscroll
                else:
                    raise ValueError(f"Invalid scroll direction: {direction}")

                return {
                    "action": "scroll",
                    "clicks": clicks,
                    "coordinates": [x, y] if x is not None and y is not None else None,
                    "direction": direction,
                    "message": f"Scrolled {direction} {clicks} clicks",
                    "llm_content": f"Scrolled {direction} {clicks} clicks",
                    "return_display": f"Scrolled {direction} {clicks} clicks",
                }

            elif action == "scroll_up":
                pyautogui.vscroll(clicks)
                return {
                    "action": "scroll_up",
                    "clicks": clicks,
                    "message": f"Scrolled up {clicks} clicks",
                    "llm_content": f"Scrolled up {clicks} clicks",
                    "return_display": f"Scrolled up {clicks} clicks",
                }

            elif action == "scroll_down":
                pyautogui.vscroll(-clicks)
                return {
                    "action": "scroll_down",
                    "clicks": clicks,
                    "message": f"Scrolled down {clicks} clicks",
                    "llm_content": f"Scrolled down {clicks} clicks",
                    "return_display": f"Scrolled down {clicks} clicks",
                }

            else:
                raise ValueError(f"Unknown scroll action: {action}")
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _execute_action)
        
        return {
            "success": True,
            "data": result,
        }
    except ImportError:
        logger.error("pyautogui not available, cannot execute scroll control")
        return {"success": False, "error": "pyautogui library not available"}
    except Exception as e:
        logger.error(f"Scroll control failed: {e}", exc_info=True)
        return {"success": False, "error": f"Scroll control failed: {str(e)}"}
