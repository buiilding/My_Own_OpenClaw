"""
Mouse Control Tool - Python implementation using pyautogui.
"""

import asyncio
import logging
from typing import Dict, Any

from core.executors import get_interactive_executor
from tools.result import ToolResult

logger = logging.getLogger(__name__)


async def execute_mouse_control(args: Dict[str, Any]) -> ToolResult:
    """
    Execute mouse control action.
    
    Args:
        args: Dictionary with 'action', 'x', 'y', and optional drag destination fields
        
    Returns:
        Dictionary with success status and action result
    """
    action = args.get("action")
    x = args.get("x")
    y = args.get("y")
    button = args.get("button", "left")
    drag_to_x = args.get("drag_to_x")
    drag_to_y = args.get("drag_to_y")
    duration = args.get("duration", 0.5)
    
    try:
        import pyautogui
        
        # Disable pyautogui failsafe for programmatic control
        pyautogui.FAILSAFE = False
        
        def _execute_action():
            if action == "click":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.click(x, y, button=button)
                return {
                    "action": "click",
                    "coordinates": [x, y],
                    "button": button,
                    "message": f"Clicked at ({x}, {y})",
                    "output": f"Clicked at ({x}, {y})",
                }
            
            elif action == "double_click":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.doubleClick(x, y, button=button)
                return {
                    "action": "double_click",
                    "coordinates": [x, y],
                    "button": button,
                    "message": f"Double-clicked at ({x}, {y})",
                    "output": f"Double-clicked at ({x}, {y})",
                }
            
            elif action == "right_click":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.rightClick(x, y)
                return {
                    "action": "right_click",
                    "coordinates": [x, y],
                    "message": f"Right-clicked at ({x}, {y})",
                    "output": f"Right-clicked at ({x}, {y})",
                }
            
            elif action == "move":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.moveTo(x, y)
                return {
                    "action": "move",
                    "coordinates": [x, y],
                    "message": f"Moved cursor to ({x}, {y})",
                    "output": f"Moved cursor to ({x}, {y})",
                }
            
            elif action == "drag":
                if x is None or y is None:
                    raise ValueError("Source x and y coordinates are required for drag action")
                if drag_to_x is None or drag_to_y is None:
                    raise ValueError("drag_to_x and drag_to_y are required for drag action")
                if not isinstance(duration, (int, float)):
                    raise ValueError("duration must be numeric for drag action")
                drag_duration = max(float(duration), 0.0)
                pyautogui.moveTo(x, y)
                pyautogui.dragTo(
                    drag_to_x,
                    drag_to_y,
                    duration=drag_duration,
                    button=button,
                )
                return {
                    "action": "drag",
                    "coordinates": [drag_to_x, drag_to_y],
                    "source_coordinates": [x, y],
                    "destination_coordinates": [drag_to_x, drag_to_y],
                    "button": button,
                    "duration": drag_duration,
                    "message": f"Dragged from ({x}, {y}) to ({drag_to_x}, {drag_to_y})",
                    "output": f"Dragged from ({x}, {y}) to ({drag_to_x}, {drag_to_y})",
                }
            
            else:
                raise ValueError(f"Unknown mouse action: {action}")
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(get_interactive_executor(), _execute_action)
        
        return ToolResult.success_result(result)
    except ImportError:
        logger.error("pyautogui not available, cannot execute mouse control")
        return ToolResult.error_result("pyautogui library not available")
    except Exception as e:
        logger.error(f"Mouse action failed: {e}", exc_info=True)
        return ToolResult.error_result(f"Mouse action failed: {str(e)}")
