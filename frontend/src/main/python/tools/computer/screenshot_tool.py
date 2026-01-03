"""
Frontend Screenshot Tool

Captures screenshots of the computer screen for computer use automation.
"""

import base64
import io
import logging
from typing import Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)


class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this action executes."
    )


class ScreenshotTool(FrontendTool[ScreenshotToolArgs]):
    """
    Capture a screenshot of the current computer screen.
    Returns a base64-encoded image.
    """

    name = "screenshot"
    description = "Capture a screenshot of the current computer screen."
    args_model = ScreenshotToolArgs

    def __init__(self):
        self._pyautogui = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize pyautogui for screenshot capture."""
        if self._initialized:
            return True

        try:
            import pyautogui
            self._pyautogui = pyautogui

            # Configure pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0

            self._initialized = True
            logger.info("Screenshot tool initialized")
            return True

        except ImportError:
            logger.error("pyautogui not installed. Install with: pip install pyautogui")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize screenshot tool: {e}")
            return False

    async def run(self, args: ScreenshotToolArgs) -> Dict[str, Any]:
        """
        Capture a screenshot and return the image data.

        Args:
            args: Validated arguments

        Returns:
            Result dictionary with success status and image data
        """
        import asyncio
        from core.thread_pool import get_executor

        try:
            # Ensure initialized
            if not await self.initialize():
                return SimpleToolResult.failure("Screenshot tool initialization failed").to_dict()

            logger.debug("Screenshot tool: Taking screenshot")

            loop = asyncio.get_running_loop()
            executor = get_executor()
            
            # Combine all operations into a single executor call to minimize overhead
            # This matches the legacy backend implementation pattern for better performance
            def _perform_screenshot():
                # Temporarily set PAUSE to 0 to avoid the 100ms delay
                old_pause = self._pyautogui.PAUSE
                try:
                    self._pyautogui.PAUSE = 0
                    # 1. Take screenshot (blocking GUI call)
                    screenshot = self._pyautogui.screenshot()
                finally:
                    self._pyautogui.PAUSE = old_pause
                
                # 2. Convert to JPEG (much faster than PNG) with compression
                # We use JPEG because it's significantly faster to encode than optimized PNG
                img_buffer = io.BytesIO()
                screenshot.save(img_buffer, format="JPEG", quality=85, optimize=False)
                img_bytes = img_buffer.getvalue()
                
                # 3. Convert to base64
                b64_data = base64.b64encode(img_bytes).decode("utf-8")
                
                # Return both base64 and size for accurate reporting
                return b64_data, len(img_bytes)

            b64_data, img_size = await loop.run_in_executor(executor, _perform_screenshot)

            logger.debug(f"Screenshot tool: Captured image, size: {img_size} bytes")

            llm_content = "Screenshot captured successfully."

            logger.info("Screenshot tool finished execution")

            return {
                "success": True,
                "data": {
                    "screenshot": b64_data,
                    "compression": "jpeg",
                    "size": img_size,
                    "llm_content": llm_content,
                    "return_display": "Screenshot captured"
                }
            }

        except Exception as e:
            logger.error(f"Screenshot tool: Failed - {e}", exc_info=True)
            return SimpleToolResult.failure(f"Screenshot failed: {str(e)}").to_dict()
