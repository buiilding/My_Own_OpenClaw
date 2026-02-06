"""Scroll Control Tool - OS-standardized scrolling using pyautogui.

Uses vscroll/hscroll for vertical/horizontal scroll with OS-aware multipliers
to provide consistent visual scrolling across Windows, macOS, and Linux.

Includes time.sleep(0.5) after moveTo and before scroll (agent-s pattern)
for consistent behavior across different polling rates and operating systems.
"""

import asyncio
import logging
import time
from typing import Dict, Any

from .scroll_config import calculate_scroll_clicks

logger = logging.getLogger(__name__)


async def execute_scroll_control(args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute scroll control action with OS-standardized scroll amounts.

    Scroll amounts are specified in "scroll units" where 1 unit is visually
    approximately 3 lines of text. The actual wheel clicks are calculated
    based on the OS to ensure consistent behavior:
    - Windows: Typically 1 click per unit (3 lines/tick default)
    - macOS: ~0.3 clicks per unit (smooth scrolling)
    - Linux: 1 click per unit (3 lines/tick typical)

    Args:
        args: Dictionary with:
            - 'action': "scroll", "scroll_up", or "scroll_down"
            - 'x': Optional X coordinate to scroll at
            - 'y': Optional Y coordinate to scroll at
            - 'clicks': Number of scroll units (default 5, ~15 lines visually)
            - 'direction': "up", "down", "left", or "right" (for "scroll" action)

    Returns:
        Dictionary with success status and scroll result including:
        - 'scroll_units': The requested standardized units
        - 'os_clicks': Actual wheel clicks sent to OS
    """
    action = args.get("action")
    x = args.get("x")
    y = args.get("y")
    # 'clicks' in args means "scroll units" (standardized visual amount)
    scroll_units = args.get("clicks", 5)
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
                    # Let cursor/window settle before scroll
                    # (consistent across polling rates)
                    time.sleep(0.5)

                # Convert standardized units to OS-specific clicks
                clicks = calculate_scroll_clicks(scroll_units, direction)

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
                    "scroll_units": scroll_units,
                    "os_clicks": clicks,
                    "coordinates": [x, y] if x is not None and y is not None else None,
                    "direction": direction,
                    "message": f"Scrolled {direction} {scroll_units} units",
                    "llm_content": (
                        f"Scrolled {direction} {scroll_units} units "
                        f"({clicks} OS clicks)"
                    ),
                    "return_display": f"Scrolled {direction} {scroll_units} units",
                }

            elif action == "scroll_up":
                clicks = calculate_scroll_clicks(scroll_units, "up")
                pyautogui.vscroll(clicks)
                return {
                    "action": "scroll_up",
                    "scroll_units": scroll_units,
                    "os_clicks": clicks,
                    "message": f"Scrolled up {scroll_units} units",
                    "llm_content": (
                        f"Scrolled up {scroll_units} units ({clicks} OS clicks)"
                    ),
                    "return_display": f"Scrolled up {scroll_units} units",
                }

            elif action == "scroll_down":
                clicks = calculate_scroll_clicks(scroll_units, "down")
                pyautogui.vscroll(-clicks)
                return {
                    "action": "scroll_down",
                    "scroll_units": scroll_units,
                    "os_clicks": clicks,
                    "message": f"Scrolled down {scroll_units} units",
                    "llm_content": (
                        f"Scrolled down {scroll_units} units ({clicks} OS clicks)"
                    ),
                    "return_display": f"Scrolled down {scroll_units} units",
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
