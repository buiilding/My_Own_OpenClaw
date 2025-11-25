"""
Screenshot Tool (SDK Version)

Captures screenshots of the computer screen for computer use automation.
OCR analysis is handled by the OCRPlugin, not directly in this tool.
"""
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class ScreenshotToolArgs(BaseModel):
    """Arguments for screenshot tool."""
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
    description = "Capture a screenshot of the current computer screen. Set include_ocr=True if you need to detect text or interact with text elements."
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

        # Prepare the response
        llm_content = f"Here is the current screenshot: {result.screenshot_data}"

        # If OCR is requested, use the OCR plugin
        ocr_success = True
        if args.include_ocr:
            logger.debug(f"OCR requested, calling OCR plugin with screenshot data (length: {len(result.screenshot_data)})")
            ocr_results = await self._perform_ocr_with_plugin(result.screenshot_data)
            if ocr_results and len(ocr_results) > 0:
                logger.info(f"OCR returned {len(ocr_results)} text elements")
                llm_content += f"\n\nOCR Analysis detected {len(ocr_results)} text elements:"
                for i, ocr_result in enumerate(ocr_results[:10]):  # Limit to first 10 for brevity
                    text = ocr_result.get('text', '')
                    confidence = ocr_result.get('confidence', 0.0)
                    llm_content += f"\n{i+1}. '{text}' (confidence: {confidence:.2f})"
                if len(ocr_results) > 10:
                    llm_content += f"\n... and {len(ocr_results) - 10} more text elements"
            else:
                logger.error(f"OCR was requested but returned no results: {ocr_results}")
                ocr_success = False
                llm_content += "\n\n⚠️ OCR Analysis failed: No text detected or OCR processing error occurred."

        # Return screenshot data with image directly in llm_content
        return {
            "success": ocr_success if args.include_ocr else True,  # Fail only if OCR was requested and failed
            "screenshot": result.screenshot_data,
            "include_ocr": args.include_ocr,
            "llm_content": llm_content,
            "return_display": "Screenshot captured with image data" + (" (OCR failed)" if args.include_ocr and not ocr_success else "")
        }

    async def _perform_ocr_with_plugin(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """
        Perform OCR analysis using the OCR plugin.
        
        Uses the module-level singleton OCR plugin instance to avoid reinitialization overhead.
        The OCR engine is initialized only once on first use, shared across all tool instances.

        Args:
            screenshot_b64: Base64-encoded screenshot image

        Returns:
            List of OCR results from the plugin, or None if OCR fails
        """
        try:
            # Import OCR plugin singleton function to avoid circular imports
            from backend.src.agent.plugins.ocr_plugin import get_ocr_plugin_instance

            # Get singleton instance (initialized only once, reused across all calls)
            ocr_plugin = get_ocr_plugin_instance()
            
            # Ensure plugin is initialized (idempotent - safe to call multiple times)
            await ocr_plugin.initialize()

            # Call the plugin's OCR method directly
            logger.debug(f"Calling OCR plugin with screenshot data (length: {len(screenshot_b64)})")
            ocr_results = await ocr_plugin._perform_ocr(screenshot_b64)

            if ocr_results and len(ocr_results) > 0:
                logger.info(f"Screenshot OCR using plugin detected {len(ocr_results)} text elements")
                return ocr_results
            else:
                logger.warning(f"OCR plugin returned no results (possibly no text detected in screenshot). OCR results: {ocr_results}")
                return None

        except Exception as e:
            logger.error(f"Screenshot OCR using plugin failed: {e}", exc_info=True)
            return None

    def get_json_schema(self) -> dict:
        schema = super().get_json_schema()
        schema["capabilities"] = {
            "returns_image": True,
            "image_format": "base64_png"
        }
        return schema
