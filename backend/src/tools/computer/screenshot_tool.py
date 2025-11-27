"""
Screenshot Tool (SDK Version)

Captures screenshots of the computer screen for computer use automation.
OCR analysis is handled by the OCRPlugin, not directly in this tool.
"""
import logging
from typing import Dict, Any
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
    model_config = ConfigDict(extra='forbid')

    include_ocr: bool = Field(
        False,
        description="Whether to perform OCR analysis on the screenshot. Set to True if you need to detect text or interact with text elements."
    )


class ScreenshotTool(Tool[ScreenshotToolArgs]):
    """
    Capture a screenshot of the current computer screen.
    Returns a base64-encoded image.
    
    Note: OCR analysis is performed automatically by the OCRPlugin plugin,
    which processes screenshots and adds OCR results to artifacts.
    """
    name = "screenshot"
    description = "Capture a screenshot of the current computer screen. Set include_ocr=True if you need to detect text or interact with text elements. After execution, returns a status message and a screenshot image (with optional OCR analysis if requested)."
    args_model = ScreenshotToolArgs

    def __init__(self):
        self.computer = ComputerInterface()

    async def run(self, args: ScreenshotToolArgs, ctx: Context) -> Dict[str, Any]:
        """
        Capture a screenshot and return the image data directly to the LLM.

        If OCR is enabled, also perform OCR analysis using the OCR plugin and include results.
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

        # Prepare the response message
        # OCR results will be appended to llm_content by the OCRPlugin (on_tool_end hook)
        llm_content = "Screenshot captured successfully."

        # Return screenshot data
        # The screenshot data will be passed as image_data in the message dictionary
        # OCR plugin will process this and append OCR results to llm_content
        return {
            "success": True,
            "screenshot": result.screenshot_data,
            "include_ocr": args.include_ocr,
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
