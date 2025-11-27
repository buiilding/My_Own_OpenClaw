"""
Click OCR Tool (SDK Version)

Tool for clicking on OCR-detected text elements by their ID.
"""
import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class ClickOCRElementArgs(BaseModel):
    ocr_id: Optional[int] = Field(None, description="ID of the OCR-detected text element to click (from the most recent screenshot with OCR)")
    id: Optional[int] = Field(None, description="DEPRECATED: Use ocr_id instead. ID of the OCR-detected text element to click")
    click_type: Literal["single", "double", "right"] = Field("single", description="Type of click to perform")


class ClickOCRTool(Tool[ClickOCRElementArgs]):
    """
    Tool for clicking on OCR-detected text elements by ID.
    
    This tool works in conjunction with the screenshot tool that performs OCR analysis.
    It allows clicking on text elements that were detected in the most recent screenshot.
    """
    
    name = "click_ocr_element"
    description = "Click on an OCR-detected text element by its ID. Use this after taking a screenshot with OCR enabled to interact with detected text elements. After execution, returns a status message and a screenshot showing the screen state after the click action."
    args_model = ClickOCRElementArgs

    def __init__(self):
        """Initialize the click OCR tool."""
        self.computer = ComputerInterface()

    async def run(self, args: ClickOCRElementArgs, ctx: Context) -> dict:
        """
        Click on an OCR element by ID.
        
        Args:
            args: Click OCR arguments
            ctx: Execution context
            
        Returns:
            Dictionary with click action result
        """
        # Handle backward compatibility: use ocr_id if provided, otherwise use id
        element_id = args.ocr_id if args.ocr_id is not None else args.id

        if element_id is None:
            return {
                "error": "Either 'ocr_id' or 'id' parameter must be provided",
                "llm_content": "Error: No element ID provided for clicking"
            }
        
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return {
                    "error": init_error.error or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}"
                }

            # Get OCR results from session (stored by executor after OCRPlugin processes screenshot)
            ocr_results = None
            
            # Try to get from context services (executor stores session reference here)
            if ctx and hasattr(ctx, "services"):
                services = ctx.services if isinstance(ctx.services, dict) else {}
                # Try to get session from services
                session = services.get("session")
                if session and hasattr(session, "_ocr_results_cache"):
                    ocr_results = session._ocr_results_cache.get("latest")
                
                # Fallback: try direct OCR results in services
                if ocr_results is None:
                    ocr_results = services.get("ocr_results")
            
            if ocr_results is None:
                return {
                    "error": "No OCR results available. Please ensure OCRPlugin is enabled and take a screenshot first.",
                    "llm_content": "Error: No OCR results available. Please ensure OCRPlugin is enabled and take a screenshot first."
                }

            if not isinstance(ocr_results, list) or len(ocr_results) == 0:
                return {
                    "error": "No OCR results available. Please take a screenshot with OCR enabled first.",
                    "llm_content": "Error: No OCR results available. Please take a screenshot with OCR enabled first."
                }

            if element_id < 0 or element_id >= len(ocr_results):
                return {
                    "error": f"OCR ID {element_id} is out of range. Available IDs: 0-{len(ocr_results)-1}",
                    "llm_content": f"Error: OCR ID {element_id} is out of range. Available IDs: 0-{len(ocr_results)-1}"
                }

            # Get the OCR element
            ocr_element = ocr_results[element_id]
            bbox = ocr_element["bbox"]
            text = ocr_element["text"]

            # Calculate center point of the bounding box for clicking
            center_x = bbox["x"] + bbox["width"] // 2
            center_y = bbox["y"] + bbox["height"] // 2

            # Perform the click based on type
            if args.click_type == "single":
                result = await self.computer.left_click(center_x, center_y)
            elif args.click_type == "double":
                result = await self.computer.double_click(center_x, center_y)
            elif args.click_type == "right":
                result = await self.computer.right_click(center_x, center_y)
            else:
                return {
                    "error": f"Invalid click type: {args.click_type}. Use 'single', 'double', or 'right'.",
                    "llm_content": f"Error: Invalid click type: {args.click_type}"
                }

            if result.success:
                click_desc = (
                    f"{args.click_type} click" if args.click_type != "single" else "click"
                )
                llm_content = f"Successfully performed {click_desc} on OCR element ID {element_id} ('{text}') at coordinates ({center_x}, {center_y})"
                return_display = f"Clicked on '{text}' (ID {element_id})"
                
                return {
                    "success": True,
                    "element_id": element_id,
                    "text": text,
                    "coordinates": (center_x, center_y),
                    "click_type": args.click_type,
                    "llm_content": llm_content,
                    "return_display": return_display
                }
            else:
                return {
                    "error": result.error or "Click failed",
                    "llm_content": f"Failed to click on OCR element ID {element_id} ('{text}'): {result.error}"
                }

        except Exception as e:
            logger.error(f"Click OCR tool error: {e}", exc_info=True)
            return {
                "error": f"Click OCR operation failed: {str(e)}",
                "llm_content": f"Error: Failed to click on OCR element: {str(e)}"
            }
