"""
Screenshot Tool

Captures screenshots of the computer screen for computer use automation.
"""

import logging
from typing import Any, Dict, List, Optional

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult

from .computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class ScreenshotTool(Tool):
    """
    Tool for capturing screenshots of the computer screen.

    This tool takes screenshots and returns them as base64-encoded images
    that can be used by LLMs for visual understanding and computer control.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="screenshot",
            description="Capture a screenshot of the current computer screen and return it as a base64-encoded image.",
            kind=Kind.READ,
        )
        self.config = config
        self.computer = ComputerInterface()

    async def execute_async(self, context: ToolContext, **kwargs) -> ToolResult:
        """
        Take a screenshot and return it.

        Returns:
            ToolResult with screenshot data as base64 string
        """
        try:
            # Initialize computer interface if needed
            if (
                not hasattr(self.computer, "_initialized")
                or not self.computer._initialized
            ):
                success = await self.computer.initialize()
                if not success:
                    return ToolResult(
                        success=False,
                        error="Failed to initialize computer interface",
                        llm_content="Error: Could not initialize computer control interface",
                        return_display="Screenshot failed: Computer interface not available",
                    )

            # Take screenshot
            result = await self.computer.screenshot()

            if result.success and result.screenshot_data:
                return ToolResult(
                    success=True,
                    data={"screenshot": result.screenshot_data},
                    llm_content="Screenshot captured successfully",
                    return_display="Screenshot captured and returned as base64 image",
                    metadata={"screenshot_size": len(result.screenshot_data)},
                )
            else:
                return ToolResult(
                    success=False,
                    error=result.error or "Screenshot capture failed",
                    llm_content=f"Error capturing screenshot: {result.error}",
                    return_display=f"Screenshot failed: {result.error}",
                )

        except Exception as e:
            logger.error(f"Screenshot tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Screenshot capture failed: {str(e)}",
                llm_content="Error: Failed to capture screenshot",
                return_display=f"Screenshot error: {str(e)}",
            )

    def get_capabilities(self) -> Dict[str, Any]:
        """Get tool capabilities."""
        capabilities = super().get_capabilities()
        capabilities.update(
            {
                "returns_image": True,
                "image_format": "base64_png",
                "requires_display": True,
                "safe": True,  # Screenshots are read-only
            }
        )
        return capabilities
