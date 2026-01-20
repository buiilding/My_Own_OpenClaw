"""
Mouse Control Tool - Python implementation using pyautogui.
"""

import asyncio
import logging
from typing import Dict, Any

from tools.result import ToolResult

logger = logging.getLogger(__name__)


async def execute_mouse_control(args: Dict[str, Any]) -> ToolResult:
    """
    Execute mouse control action.
    
    Args:
        args: Dictionary with 'action', 'x', 'y', 'scroll_amount', 'scroll_direction'
        
    Returns:
        Dictionary with success status and action result
    """
    action = args.get("action")
    x = args.get("x")
    y = args.get("y")
    scroll_amount = args.get("scroll_amount")
    scroll_direction = args.get("scroll_direction", "vertical")
    
    try:
        import pyautogui
        
        # Disable pyautogui failsafe for programmatic control
        pyautogui.FAILSAFE = False
        
        def _execute_action():
            if action == "click":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.click(x, y)
                return {
                    "action": "click",
                    "coordinates": [x, y],
                    "message": f"Clicked at ({x}, {y})",
                    "llm_content": f"Clicked at ({x}, {y})",
                    "return_display": f"Clicked at ({x}, {y})",
                }
            
            elif action == "double_click":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.doubleClick(x, y)
                return {
                    "action": "double_click",
                    "coordinates": [x, y],
                    "message": f"Double-clicked at ({x}, {y})",
                    "llm_content": f"Double-clicked at ({x}, {y})",
                    "return_display": f"Double-clicked at ({x}, {y})",
                }
            
            elif action == "right_click":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.rightClick(x, y)
                return {
                    "action": "right_click",
                    "coordinates": [x, y],
                    "message": f"Right-clicked at ({x}, {y})",
                    "llm_content": f"Right-clicked at ({x}, {y})",
                    "return_display": f"Right-clicked at ({x}, {y})",
                }
            
            elif action == "move":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required")
                pyautogui.moveTo(x, y)
                return {
                    "action": "move",
                    "coordinates": [x, y],
                    "message": f"Moved cursor to ({x}, {y})",
                    "llm_content": f"Moved cursor to ({x}, {y})",
                    "return_display": f"Moved cursor to ({x}, {y})",
                }
            
            elif action == "drag":
                if x is None or y is None:
                    raise ValueError("X and Y coordinates are required for drag action")
                # Get current position as start
                current_x, current_y = pyautogui.position()
                pyautogui.dragTo(x, y, duration=0.1)
                return {
                    "action": "drag",
                    "coordinates": [x, y],
                    "message": f"Dragged to ({x}, {y})",
                    "llm_content": f"Dragged to ({x}, {y})",
                    "return_display": f"Dragged to ({x}, {y})",
                }
            
            elif action == "scroll":
                if scroll_amount is None:
                    raise ValueError("scroll_amount required for scroll action")
                
                if x is not None and y is not None:
                    pyautogui.moveTo(x, y)
                
                # pyautogui.scroll uses positive for up, negative for down
                # scroll_amount is typically positive, direction determines up/down
                if scroll_direction == "vertical":
                    # Positive scroll_amount = down, negative = up
                    pyautogui.scroll(-scroll_amount, x=x, y=y)
                else:
                    # Horizontal scrolling (not directly supported by pyautogui)
                    # Use hscroll if available, otherwise fallback
                    try:
                        pyautogui.hscroll(-scroll_amount if scroll_amount > 0 else scroll_amount, x=x, y=y)
                    except AttributeError:
                        # hscroll not available, use vertical as fallback
                        pyautogui.scroll(-scroll_amount, x=x, y=y)
                
                return {
                    "action": "scroll",
                    "coordinates": [x, y] if x is not None and y is not None else None,
                    "scroll_amount": scroll_amount,
                    "scroll_direction": scroll_direction,
                    "message": f"Scrolled {scroll_direction} {scroll_amount}",
                    "llm_content": f"Scrolled {scroll_direction} {scroll_amount}",
                    "return_display": f"Scrolled {scroll_direction} {scroll_amount}",
                }
            
            else:
                raise ValueError(f"Unknown mouse action: {action}")
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _execute_action)
        
        return ToolResult.success_result(result)
    except ImportError:
        logger.error("pyautogui not available, cannot execute mouse control")
        return ToolResult.error_result("pyautogui library not available")
    except Exception as e:
        logger.error(f"Mouse action failed: {e}", exc_info=True)
        return ToolResult.error_result(f"Mouse action failed: {str(e)}")
