"""
Click OCR Tool

Tool for clicking on OCR-detected text elements by their ID.
Works with the screenshot tool to provide coordinate-based clicking.
"""

import logging
from typing import Any, Dict

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult

from .computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class ClickOcrTool(Tool):
    """
    Tool for clicking on OCR-detected text elements by ID.

    This tool works in conjunction with the screenshot tool that performs OCR analysis.
    It allows clicking on text elements that were detected in the most recent screenshot.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="click_ocr_element",
            description="Click on an OCR-detected text element by its ID. Use this after taking a screenshot with OCR enabled to interact with detected text elements.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.computer = ComputerInterface()

    async def execute_async(
        self, context: ToolContext, id: int, click_type: str = "single", **kwargs
    ) -> ToolResult:
        """
        Click on an OCR element by ID.

        Args:
            context: Tool execution context
            id: ID of the OCR element to click (from screenshot OCR results)
            click_type: Type of click - "single", "double", "right"

        Returns:
            ToolResult with click action result
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return init_error

            # Import the OCR results from screenshot tool
            from .screenshot_tool import _latest_ocr_results

            if _latest_ocr_results is None:
                return ToolResult(
                    success=False,
                    error="No OCR results available. Please take a screenshot with OCR enabled first.",
                    llm_content="Error: No OCR results available. Please take a screenshot with OCR enabled first.",
                    return_display="No OCR results available",
                )

            if id < 0 or id >= len(_latest_ocr_results):
                return ToolResult(
                    success=False,
                    error=f"OCR ID {id} is out of range. Available IDs: 0-{len(_latest_ocr_results)-1}",
                    llm_content=f"Error: OCR ID {id} is out of range. Available IDs: 0-{len(_latest_ocr_results)-1}",
                    return_display=f"Invalid OCR ID: {id}",
                )

            # Get the OCR element
            ocr_element = _latest_ocr_results[id]
            bbox = ocr_element["bbox"]
            text = ocr_element["text"]

            # Calculate center point of the bounding box for clicking
            center_x = bbox["x"] + bbox["width"] // 2
            center_y = bbox["y"] + bbox["height"] // 2

            # Perform the click based on type
            if click_type == "single":
                result = await self.computer.left_click(center_x, center_y)
            elif click_type == "double":
                result = await self.computer.double_click(center_x, center_y)
            elif click_type == "right":
                result = await self.computer.right_click(center_x, center_y)
            else:
                return ToolResult(
                    success=False,
                    error=f"Invalid click type: {click_type}. Use 'single', 'double', or 'right'.",
                    llm_content=f"Error: Invalid click type: {click_type}",
                    return_display=f"Invalid click type: {click_type}",
                )

            if result.success:
                click_desc = (
                    f"{click_type} click" if click_type != "single" else "click"
                )
                llm_content = f"Successfully performed {click_desc} on OCR element ID {id} ('{text}') at coordinates ({center_x}, {center_y})"
                return_display = f"Clicked on '{text}' (ID {id})"
            else:
                llm_content = (
                    f"Failed to click on OCR element ID {id} ('{text}'): {result.error}"
                )
                return_display = f"Click failed: {result.error}"

            return ToolResult(
                success=result.success,
                error=result.error if not result.success else None,
                llm_content=llm_content,
                return_display=return_display,
            )

        except Exception as e:
            logger.error(f"Click OCR tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Click OCR operation failed: {str(e)}",
                llm_content="Error: Failed to click on OCR element",
                return_display=f"Click error: {str(e)}",
            )

    def get_schema(self) -> Dict[str, Any]:
        """Get the JSON schema for this tool's parameters."""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "integer",
                        "description": "ID of the OCR-detected text element to click (from the most recent screenshot with OCR)",
                    },
                    "click_type": {
                        "type": "string",
                        "enum": ["single", "double", "right"],
                        "description": "Type of click to perform",
                        "default": "single",
                    },
                },
                "required": ["id"],
            },
        }
