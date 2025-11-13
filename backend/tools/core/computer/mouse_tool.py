"""
Mouse Control Tool

Provides mouse control capabilities including clicking, moving, and dragging.
"""

import logging
from typing import Any, Dict, List, Literal, Optional, Union

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult

from .computer_interface import ComputerInterface, MouseButton

logger = logging.getLogger(__name__)


class MouseTool(Tool):
    """
    Tool for controlling mouse actions.

    Supports clicking, moving, dragging, and other mouse operations
    for computer use automation.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="mouse_control",
            description="Control mouse actions including clicking, moving, and dragging on the computer screen.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.computer = ComputerInterface()

    async def execute_async(
        self,
        context: ToolContext,
        action: Literal[
            "click",
            "double_click",
            "right_click",
            "move",
            "drag",
            "mouse_down",
            "mouse_up",
        ],
        x: Optional[int] = None,
        y: Optional[int] = None,
        button: MouseButton = "left",
        duration: float = 0.5,
        **kwargs,
    ) -> ToolResult:
        """
        Execute mouse control actions.

        Args:
            context: Tool execution context
            action: Mouse action to perform (click, double_click, right_click, move, drag, mouse_down, mouse_up)
            x: X coordinate (required for move/drag, optional for click)
            y: Y coordinate (required for move/drag, optional for click)
            button: Mouse button (left, right, middle)
            duration: Duration for drag operations

        Returns:
            ToolResult with action outcome
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return init_error

            # Execute the requested action
            result = await self._execute_mouse_action(action, x, y, button, duration)

            if result.success:
                return ToolResult(
                    success=True,
                    data={
                        "action": action,
                        "coordinates": (x, y)
                        if x is not None and y is not None
                        else None,
                    },
                    llm_content=result.message,
                    return_display=result.message,
                    metadata={
                        "action": action,
                        "coordinates": f"({x}, {y})"
                        if x is not None and y is not None
                        else "current",
                        "button": button,
                    },
                )
            else:
                return ToolResult(
                    success=False,
                    error=result.error or "Mouse action failed",
                    llm_content=f"Error: {result.error}",
                    return_display=f"Mouse action failed: {result.error}",
                )

        except Exception as e:
            logger.error(f"Mouse tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Mouse control failed: {str(e)}",
                llm_content="Error: Mouse action failed",
                return_display=f"Mouse error: {str(e)}",
            )

    async def _execute_mouse_action(
        self,
        action: str,
        x: Optional[int],
        y: Optional[int],
        button: MouseButton,
        duration: float,
    ):
        """Execute the specific mouse action."""
        if action == "click":
            return (
                await self.computer.left_click(x, y)
                if button == "left"
                else await self.computer.right_click(x, y)
            )
        elif action == "double_click":
            return await self.computer.double_click(x, y)
        elif action == "right_click":
            return await self.computer.right_click(x, y)
        elif action == "move":
            if x is None or y is None:
                return type(
                    "Result",
                    (),
                    {"success": False, "error": "Coordinates required for move action"},
                )()
            return await self.computer.move_cursor(x, y)
        elif action == "drag":
            if x is None or y is None:
                return type(
                    "Result",
                    (),
                    {"success": False, "error": "Coordinates required for drag action"},
                )()
            return await self.computer.drag_to(x, y, button, duration)
        elif action == "mouse_down":
            return await self.computer.mouse_down(x, y, button)
        elif action == "mouse_up":
            return await self.computer.mouse_up(x, y, button)
        else:
            return type(
                "Result",
                (),
                {"success": False, "error": f"Unknown mouse action: {action}"},
            )()

    def validate_parameters(self, **kwargs) -> List[str]:
        """Validate mouse tool parameters."""
        errors = []

        # Check required action parameter
        if "action" not in kwargs:
            errors.append("action parameter is required")
            return errors

        action = kwargs["action"]

        # Validate action type
        valid_actions = [
            "click",
            "double_click",
            "right_click",
            "move",
            "drag",
            "mouse_down",
            "mouse_up",
        ]
        if action not in valid_actions:
            errors.append(f"action must be one of: {', '.join(valid_actions)}")

        # Check coordinates for actions that require them
        if action in ["move", "drag"]:
            if "x" not in kwargs or kwargs["x"] is None:
                errors.append("x coordinate is required for move/drag actions")
            if "y" not in kwargs or kwargs["y"] is None:
                errors.append("y coordinate is required for move/drag actions")

        # Validate button parameter
        if "button" in kwargs:
            valid_buttons = ["left", "right", "middle"]
            if kwargs["button"] not in valid_buttons:
                errors.append(f"button must be one of: {', '.join(valid_buttons)}")

        return errors

    def get_capabilities(self) -> Dict[str, Any]:
        """Get tool capabilities."""
        capabilities = super().get_capabilities()
        capabilities.update(
            {
                "supported_actions": [
                    "click",
                    "double_click",
                    "right_click",
                    "move",
                    "drag",
                    "mouse_down",
                    "mouse_up",
                ],
                "supported_buttons": ["left", "right", "middle"],
                "requires_confirmation": False,  # Basic mouse actions don't need confirmation
                "destructive": False,  # Mouse actions themselves aren't destructive (though they can be)
                "safe": True,  # Generally safe operations
            }
        )
        return capabilities
