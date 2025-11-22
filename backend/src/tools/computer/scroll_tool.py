"""
Scroll Control Tool

Tool for controlling scrolling actions.
"""
import logging
from typing import Any, Dict, List, Literal, Optional

from backend.src.core.config import AppServices
from backend.src.tools.base import Kind, Tool, ToolContext, ToolResult
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)

ScrollDirection = Literal["up", "down", "left", "right"]


class ScrollTool(Tool):
    """
    Tool for controlling scrolling actions.

    Supports scrolling in different directions and amounts for
    computer use automation.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="scroll_control",
            description="Control scrolling actions including up, down, left, and right scrolling.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.computer = ComputerInterface()

    async def execute_async(
        self,
        context: ToolContext,
        action: Literal["scroll", "scroll_up", "scroll_down"],
        x: Optional[int] = None,
        y: Optional[int] = None,
        clicks: int = 3,
        direction: Optional[ScrollDirection] = None,
        **kwargs,
    ) -> ToolResult:
        """
        Execute scrolling actions.

        Args:
            context: Tool execution context
            action: Scroll action to perform ("scroll", "scroll_up", "scroll_down")
            x: X coordinate to scroll at (optional, uses current cursor if not provided)
            y: Y coordinate to scroll at (optional, uses current cursor if not provided)
            clicks: Number of scroll clicks
            direction: Direction for scroll action ("up", "down")

        Returns:
            ToolResult with action outcome
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return init_error

            # Execute the requested action
            result = await self._execute_scroll_action(action, x, y, clicks, direction)

            if result.success:
                coords_str = (
                    f"at ({x}, {y})" if x is not None and y is not None else "at cursor"
                )
                return ToolResult(
                    success=True,
                    data={"action": action, "clicks": clicks, "coordinates": (x, y)},
                    llm_content=result.message,
                    return_display=result.message,
                    metadata={
                        "action": action,
                        "clicks": clicks,
                        "coordinates": coords_str,
                        "direction": direction,
                    },
                )
            else:
                return ToolResult(
                    success=False,
                    error=result.error or "Scroll action failed",
                    llm_content=f"Error: {result.error}",
                    return_display=f"Scroll action failed: {result.error}",
                )

        except Exception as e:
            logger.error(f"Scroll tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Scroll control failed: {str(e)}",
                llm_content="Error: Scroll action failed",
                return_display=f"Scroll error: {str(e)}",
            )

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

    def validate_parameters(self, **kwargs) -> List[str]:
        """Validate scroll tool parameters."""
        errors = []

        # Check required action parameter
        if "action" not in kwargs:
            errors.append("action parameter is required")
            return errors

        action = kwargs["action"]

        # Validate action type
        valid_actions = ["scroll", "scroll_up", "scroll_down"]
        if action not in valid_actions:
            errors.append(f"action must be one of: {', '.join(valid_actions)}")

        # Validate clicks parameter
        if "clicks" in kwargs:
            if not isinstance(kwargs["clicks"], int) or kwargs["clicks"] < 1:
                errors.append("clicks must be a positive integer")

        # Validate coordinates for scroll action
        if action == "scroll":
            if "x" not in kwargs or kwargs["x"] is None:
                errors.append("x coordinate is required for scroll action")
            if "y" not in kwargs or kwargs["y"] is None:
                errors.append("y coordinate is required for scroll action")

        # Validate direction if provided
        if "direction" in kwargs and kwargs["direction"]:
            valid_directions = ["up", "down", "left", "right"]
            if kwargs["direction"] not in valid_directions:
                errors.append(
                    f"direction must be one of: {', '.join(valid_directions)}"
                )

        return errors

    def get_capabilities(self) -> Dict[str, Any]:
        """Get tool capabilities."""
        capabilities = super().get_capabilities()
        capabilities.update(
            {
                "supported_actions": ["scroll", "scroll_up", "scroll_down"],
                "supported_directions": ["up", "down", "left", "right"],
                "max_clicks": 100,  # Reasonable limit
                "requires_confirmation": False,
                "destructive": False,  # Scrolling is generally safe
                "safe": True,
                "requires_screenshot": True,
            }
        )
        return capabilities
