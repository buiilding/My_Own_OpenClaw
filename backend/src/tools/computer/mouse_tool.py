"""
Mouse Control Tool (SDK Version)

Tool for controlling mouse actions.
"""
import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.computer.computer_interface import ComputerInterface, MouseButton

logger = logging.getLogger(__name__)

class MouseToolArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal[
        "click",
        "double_click",
        "right_click",
        "move",
        "drag",
        "mouse_down",
        "mouse_up",
    ] = Field(..., description="Mouse action to perform")
    
    x: Optional[int] = Field(None, description="X coordinate (required for move/drag)")
    y: Optional[int] = Field(None, description="Y coordinate (required for move/drag)")
    button: MouseButton = Field("left", description="Mouse button (left, right, middle)")
    duration: float = Field(0.5, description="Duration for drag operations")

class MouseTool(Tool[MouseToolArgs]):
    """
    Tool for controlling mouse actions including clicking, moving, and dragging.
    """
    name = "mouse_control"
    description = "Control mouse actions including clicking, moving, and dragging on the computer screen. After execution, returns a status message and a screenshot showing the screen state after the mouse action."
    args_model = MouseToolArgs

    def __init__(self):
        self.computer = ComputerInterface()

    async def run(self, args: MouseToolArgs, ctx: ToolContext) -> dict:
        # Ensure computer interface is initialized
        if not self.computer._initialized:
            success = await self.computer.initialize()
            if not success:
                raise Exception("Computer interface could not be initialized.")

        # Validate coordinates for move/drag
        if args.action in ["move", "drag"]:
            if args.x is None or args.y is None:
                raise ValueError("Coordinates (x, y) are required for move/drag actions")

        result = await self._execute_mouse_action(
            args.action, args.x, args.y, args.button, args.duration
        )

        if not result.success:
             raise Exception(f"Mouse action failed: {result.error}")

        # Return dictionary with llm_content and other fields
        return {
            "success": True,
            "data": result.message,
            "llm_content": result.message,
            "return_display": result.message
        }

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
            return await self.computer.move_cursor(x, y)
        elif action == "drag":
            return await self.computer.drag_to(x, y, button, duration)
        elif action == "mouse_down":
            return await self.computer.mouse_down(x, y, button)
        elif action == "mouse_up":
            return await self.computer.mouse_up(x, y, button)
        else:
            raise ValueError(f"Unknown mouse action: {action}")

    def get_json_schema(self) -> dict:
        schema = super().get_json_schema()
        return schema
