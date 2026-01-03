"""
Frontend Scroll Control Tool

Tool for controlling scrolling actions on the local computer.
"""

import logging
from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)

ScrollDirection = Literal["up", "down", "left", "right"]


class ScrollControlArgs(BaseModel):
    """Arguments for scroll control tool."""
    action: Literal["scroll", "scroll_up", "scroll_down"] = Field(
        ..., description="Scroll action to perform"
    )
    x: Optional[int] = Field(
        None, description="X coordinate to scroll at (optional, uses current cursor if not provided)"
    )
    y: Optional[int] = Field(
        None, description="Y coordinate to scroll at (optional, uses current cursor if not provided)"
    )
    clicks: int = Field(3, description="Number of scroll clicks")
    direction: Optional[ScrollDirection] = Field(
        None, description="Direction for scroll action ('up', 'down', 'left', 'right')"
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this scroll action executes."
    )


class ScrollTool(FrontendTool[ScrollControlArgs]):
    """
    Scroll control tool for scrolling actions.

    Supports scrolling in different directions and amounts.
    """

    name = "scroll_control"
    description = "Control scrolling actions including up, down, left, and right scrolling."
    args_model = ScrollControlArgs
    auto_capture_image = "screenshot"

    def __init__(self):
        self._pyautogui = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize pyautogui for scroll control."""
        if self._initialized:
            return True

        try:
            import pyautogui
            self._pyautogui = pyautogui

            # Configure pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.01

            self._initialized = True
            logger.info("Scroll tool initialized")
            return True

        except ImportError:
            logger.error("pyautogui not installed. Install with: pip install pyautogui")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize scroll tool: {e}")
            return False

    async def run(self, args: ScrollControlArgs) -> Dict[str, Any]:
        """
        Execute scrolling actions.

        Args:
            args: Scroll control arguments

        Returns:
            Dictionary with action outcome
        """
        try:
            # Ensure initialized
            if not await self.initialize():
                return SimpleToolResult.failure("Scroll tool initialization failed").to_dict()

            # Execute the requested action
            result = await self._execute_scroll_action(args)

            if not result.success:
                return SimpleToolResult.failure(result.error).to_dict()

            return {
                "success": True,
                "data": {
                    "action": args.action,
                    "clicks": args.clicks,
                    "coordinates": (args.x, args.y) if args.x is not None and args.y is not None else None,
                    "direction": args.direction,
                    "message": result.message,
                    "llm_content": result.message,
                    "return_display": result.message,
                }
            }

        except Exception as e:
            logger.error(f"Scroll tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Scroll control failed: {str(e)}").to_dict()

    async def _execute_scroll_action(self, args: ScrollControlArgs):
        """Execute the specific scroll action."""
        import asyncio
        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        try:
            if args.action == "scroll":
                if args.direction is None:
                    return SimpleToolResult.failure("direction required for scroll action")
                
                # Convert direction to scroll amount
                scroll_clicks = args.clicks if args.direction in ("up", "left") else -args.clicks

                # Move to position first if needed
                if args.x is not None and args.y is not None:
                    await loop.run_in_executor(executor, self._pyautogui.moveTo, args.x, args.y)

                # Scroll vertically or horizontally
                if args.direction in ("up", "down"):
                    await loop.run_in_executor(executor, self._pyautogui.scroll, scroll_clicks)
                elif args.direction in ("left", "right"):
                    await loop.run_in_executor(executor, self._pyautogui.hscroll, scroll_clicks)
                
                return SimpleToolResult.success(
                    f"Scrolled {args.direction} {args.clicks} clicks"
                )

            elif args.action == "scroll_up":
                await loop.run_in_executor(executor, self._pyautogui.scroll, args.clicks)
                return SimpleToolResult.success(f"Scrolled up {args.clicks} clicks")

            elif args.action == "scroll_down":
                await loop.run_in_executor(executor, self._pyautogui.scroll, -args.clicks)
                return SimpleToolResult.success(f"Scrolled down {args.clicks} clicks")

            else:
                return SimpleToolResult.failure(f"Unknown scroll action: {args.action}")

        except Exception as e:
            return SimpleToolResult.failure(f"Scroll action execution failed: {str(e)}")
