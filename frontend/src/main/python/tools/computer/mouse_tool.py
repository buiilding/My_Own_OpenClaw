"""
Frontend Mouse Control Tool

Simplified mouse control tool for the frontend sidecar.
Supports manual coordinates, and matches the backend tool schema.
"""

import logging
from typing import Literal, Dict, Any, Optional
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)

MouseAction = Literal["click", "double_click", "right_click", "move", "drag", "scroll"]
CoordinateFindingMethod = Literal["manual", "ocr", "prediction"]
ScrollDirection = Literal["vertical", "horizontal"]


class MouseControlArgs(BaseModel):
    """Arguments for mouse control tool."""
    action: MouseAction = Field(..., description="Mouse action to perform")

    find_coordinates_by: CoordinateFindingMethod = Field(
        "manual", description="Method to find the target coordinates for the mouse action"
    )

    # Manual coordinates
    x: Optional[int] = Field(None, description="X coordinate (required when find_coordinates_by='manual')")
    y: Optional[int] = Field(None, description="Y coordinate (required when find_coordinates_by='manual')")

    # OCR and Prediction fields (for schema compatibility, though logic is backend-focused)
    ocr_text: Optional[str] = Field(None, description="Exact text to search for on screen using OCR. Required for 'ocr' method. Do NOT use for 'prediction'.")
    description: Optional[str] = Field(None, description="Highly detailed visual description of the non-text element (icon, image). Required for 'prediction' method. Do NOT use for 'ocr'.")
    model_name: Optional[str] = Field(None, description="Optional specific vision model to use for prediction")

    # Action-specific fields
    scroll_amount: Optional[int] = Field(None, description="Amount to scroll (positive for down/right, negative for up/left, required for scroll action)")
    scroll_direction: ScrollDirection = Field("vertical", description="Direction of scrolling")
    duration: float = Field(0.5, description="Duration for drag operations")

    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this mouse action executes."
    )


class MouseTool(FrontendTool[MouseControlArgs]):
    """
    Mouse control tool for basic mouse operations.

    Supports clicking, double-clicking, right-clicking, moving, dragging, and scrolling.
    Currently only supports manual coordinates in the frontend.
    """

    name = "mouse_control"
    description = "Control mouse actions with manual coordinates. Supports clicking, double-clicking, right-clicking, moving, dragging, and scrolling."
    args_model = MouseControlArgs
    auto_capture_image = "screenshot"

    def __init__(self):
        self._pyautogui = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize pyautogui for mouse control."""
        if self._initialized:
            return True

        try:
            import pyautogui
            self._pyautogui = pyautogui

            # Configure pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.01

            self._initialized = True
            logger.info("Mouse tool initialized")
            return True

        except ImportError:
            logger.error("pyautogui not installed. Install with: pip install pyautogui")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize mouse tool: {e}")
            return False

    async def run(self, args: MouseControlArgs) -> Dict[str, Any]:
        """
        Execute mouse action.

        Args:
            args: Validated mouse control arguments

        Returns:
            Result dictionary with success status and action details
        """
        try:
            # Ensure initialized
            if not await self.initialize():
                return SimpleToolResult.failure("Mouse tool initialization failed").to_dict()

            if args.find_coordinates_by != "manual":
                return SimpleToolResult.failure(f"Frontend only supports 'manual' coordinates. Method '{args.find_coordinates_by}' is not supported locally.").to_dict()

            if args.x is None or args.y is None:
                # Scroll action might not require coordinates if at current position, 
                # but the target schema says they are required for manual.
                # However, for scroll we might want to allow it.
                if args.action != "scroll":
                    return SimpleToolResult.failure("X and Y coordinates are required for manual coordinate finding.").to_dict()

            logger.debug(f"Mouse tool: Executing {args.action} at ({args.x}, {args.y})")

            # Execute the mouse action
            result = await self._execute_mouse_action(args)

            if not result.success:
                return SimpleToolResult.failure(f"Mouse action failed: {result.error}").to_dict()

            return {
                "success": True,
                "data": {
                    "action": args.action,
                    "coordinates": (args.x, args.y) if args.x is not None else None,
                    "message": result.message,
                    "llm_content": result.message,
                    "return_display": result.message
                }
            }

        except Exception as e:
            logger.error(f"Mouse control tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Mouse action failed: {str(e)}").to_dict()

    async def _execute_mouse_action(self, args: MouseControlArgs):
        """Execute the specific mouse action."""
        import asyncio
        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        try:
            if args.action == "click":
                await loop.run_in_executor(executor, self._pyautogui.click, args.x, args.y)
                return SimpleToolResult.success(f"Clicked at ({args.x}, {args.y})")

            elif args.action == "double_click":
                def _double_click():
                    self._pyautogui.moveTo(args.x, args.y)
                    self._pyautogui.doubleClick()
                await loop.run_in_executor(executor, _double_click)
                return SimpleToolResult.success(f"Double-clicked at ({args.x}, {args.y})")

            elif args.action == "right_click":
                await loop.run_in_executor(executor, self._pyautogui.rightClick, args.x, args.y)
                return SimpleToolResult.success(f"Right-clicked at ({args.x}, {args.y})")

            elif args.action == "move":
                await loop.run_in_executor(executor, self._pyautogui.moveTo, args.x, args.y)
                return SimpleToolResult.success(f"Moved cursor to ({args.x}, {args.y})")

            elif args.action == "drag":
                def _drag():
                    self._pyautogui.dragTo(args.x, args.y, duration=args.duration)
                await loop.run_in_executor(executor, _drag)
                return SimpleToolResult.success(f"Dragged to ({args.x}, {args.y})")

            elif args.action == "scroll":
                if args.scroll_amount is None:
                    return SimpleToolResult.failure("scroll_amount required for scroll action")
                
                def _scroll():
                    if args.x is not None and args.y is not None:
                        self._pyautogui.moveTo(args.x, args.y)
                    
                    if args.scroll_direction == "vertical":
                        self._pyautogui.scroll(args.scroll_amount)
                    else:
                        self._pyautogui.hscroll(args.scroll_amount)
                
                await loop.run_in_executor(executor, _scroll)
                return SimpleToolResult.success(f"Scrolled {args.scroll_direction} {args.scroll_amount}")

            else:
                return SimpleToolResult.failure(f"Unknown mouse action: {args.action}")

        except Exception as e:
            return SimpleToolResult.failure(f"Mouse action execution failed: {str(e)}")
