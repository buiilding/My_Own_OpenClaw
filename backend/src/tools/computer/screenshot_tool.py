"""
Screenshot Tool (SDK Version)

Captures screenshots of the computer screen for computer use automation.
"""
import logging
from typing import Dict, Any
from pydantic import BaseModel, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    model_config = ConfigDict(extra='forbid')


class ScreenshotTool(Tool[ScreenshotToolArgs]):
    """
    Capture a screenshot of the current computer screen.
    Returns a base64-encoded image.
    """
    name = "screenshot"
    description = "Capture a screenshot of the current computer screen. After execution, returns a status message and a screenshot image showing the current state of the screen."
    args_model = ScreenshotToolArgs

    def __init__(self):
        self.computer = ComputerInterface()

    async def run(self, args: ScreenshotToolArgs, ctx: ToolContext) -> Dict[str, Any]:
        """
        Capture a screenshot and return the image data directly to the LLM.
        """
        # Ensure computer interface is initialized
        if not self.computer._initialized:
             success = await self.computer.initialize()
             if not success:
                 raise Exception("Computer interface initialization failed")

        # Take screenshot
        logger.debug("Screenshot tool: Taking screenshot")
        result = await self.computer.screenshot()
        logger.debug(f"Screenshot tool: Result success={result.success}, has_data={bool(result.screenshot_data)}")
        if not result.success or not result.screenshot_data:
            logger.error(f"Screenshot tool: Failed - success={result.success}, error={result.error}")
            raise Exception(f"Screenshot failed: {result.error}")

        llm_content = "Screenshot captured successfully."

        return {
            "success": True,
            "screenshot": result.screenshot_data,
            "llm_content": llm_content,
            "return_display": "Screenshot captured with image data"
        }


    def get_json_schema(self) -> dict:
        schema = super().get_json_schema()
        schema["capabilities"] = {
            "returns_image": True,
            "image_format": "base64_png"
        }
        return schema
