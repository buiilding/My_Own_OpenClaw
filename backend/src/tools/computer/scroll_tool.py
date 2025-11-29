"""
Scroll Control Tool (SDK Version)

Tool for controlling scrolling actions.
"""
import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)

ScrollDirection = Literal["up", "down", "left", "right"]


class ScrollControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(..., description="Scroll action to perform")
    x: Optional[int] = Field(None, description="X coordinate to scroll at (optional, uses current cursor if not provided)")
    y: Optional[int] = Field(None, description="Y coordinate to scroll at (optional, uses current cursor if not provided)")
    clicks: int = Field(3, description="Number of scroll clicks")
    direction: Optional[ScrollDirection] = Field(None, description="Direction for scroll action ('up', 'down', 'left', 'right')")


class ScrollTool(Tool[ScrollControlArgs]):
    """
    Tool for controlling scrolling actions.
    
    Supports scrolling in different directions and amounts for
    computer use automation.
    """
    
    name = "scroll_control"
    description = "Control scrolling actions including up, down, left, and right scrolling. After execution, returns a status message and a screenshot showing the screen state after the scroll action."
    args_model = ScrollControlArgs

    def __init__(self):
        """Initialize the scroll tool."""
        self.computer = ComputerInterface()

    async def run(self, args: ScrollControlArgs, ctx: ToolContext) -> dict:
        """
        Execute scrolling actions.
        
        Args:
            args: Scroll control arguments
            ctx: Execution context
            
        Returns:
            Dictionary with action outcome
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                # Convert ToolResult to dict
                return {
                    "error": init_error.error or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}"
                }

            # Execute the requested action
            result = await self._execute_scroll_action(args.action, args.x, args.y, args.clicks, args.direction)

            if result.success:
                coords_str = (
                    f"at ({args.x}, {args.y})" if args.x is not None and args.y is not None else "at cursor"
                )
                return {
                    "action": args.action,
                    "clicks": args.clicks,
                    "coordinates": (args.x, args.y),
                    "llm_content": result.message,
                    "return_display": result.message,
                    "metadata": {
                        "action": args.action,
                        "clicks": args.clicks,
                        "coordinates": coords_str,
                        "direction": args.direction,
                    }
                }
            else:
                return {
                    "error": result.error or "Scroll action failed",
                    "llm_content": f"Error: {result.error}"
                }

        except Exception as e:
            logger.error(f"Scroll tool error: {e}", exc_info=True)
            return {
                "error": f"Scroll control failed: {str(e)}",
                "llm_content": f"Error: Scroll action failed: {str(e)}"
            }

    async def _execute_scroll_action(
        self,
        action: str,
        x: Optional[int],
        y: Optional[int],
        clicks: int,
        direction: Optional[ScrollDirection],
    ):
        """Execute the specific scroll action."""
        if action == "scroll":
            # General scroll at coordinates
            if x is None or y is None:
                return type(
                    "Result",
                    (),
                    {
                        "success": False,
                        "error": "x and y coordinates required for scroll action",
                        "message": "Coordinates required",
                    },
                )()
            # Convert direction to scroll amount
            scroll_clicks = clicks if direction != "down" else -clicks
            return await self.computer.scroll(x, y, scroll_clicks)

        elif action == "scroll_up":
            return await self.computer.scroll_up(clicks)

        elif action == "scroll_down":
            return await self.computer.scroll_down(clicks)

        else:
            return type(
                "Result",
                (),
                {"success": False, "error": f"Unknown scroll action: {action}", "message": f"Unknown action: {action}"},
            )()
