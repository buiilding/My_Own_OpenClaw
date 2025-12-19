"""
Click OCR Tool (SDK Version)

Tool for clicking on OCR-detected text elements by searching for matching text.
"""
import logging
import difflib
from typing import Literal, List, Dict, Any, Tuple
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)

# Similarity threshold for text matching (0.0-1.0)
SIMILARITY_THRESHOLD = 0.8


class ClickOCRElementArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    text: str = Field(..., description="The text to search for and click on. The tool will find the closest matching text element on screen.")
    click_type: Literal["single", "double", "right"] = Field("single", description="Type of click to perform")


class ClickOCRTool(Tool[ClickOCRElementArgs]):
    """
    Tool for clicking on OCR-detected text elements by searching for matching text.
    
    This tool takes a screenshot, performs OCR analysis, and searches for text
    that matches the provided search text using fuzzy matching. If exactly one
    match is found, it clicks on that element. If multiple matches are found,
    it returns their coordinates so the agent can use mouse_control tool to
    click on a specific coordinate.
    """
    
    name = "click_ocr_element"
    description = "Click on a text element by searching for matching text. Takes a screenshot, performs OCR, and finds the closest matching text. If multiple matches are found, returns their coordinates for manual selection. After execution, returns a status message and a screenshot showing the screen state after the click action."
    args_model = ClickOCRElementArgs

    def __init__(self):
        """Initialize the click OCR tool."""
        self.computer = ComputerInterface()
        self._ocr_plugin = None

    def _get_ocr_plugin(self):
        """Get or initialize OCR plugin instance."""
        if self._ocr_plugin is None:
            # Lazy import to avoid circular dependency
            from backend.src.agent.plugins.ocr_plugin import get_ocr_plugin_instance
            self._ocr_plugin = get_ocr_plugin_instance()
        return self._ocr_plugin

    def _normalize_text(self, text: str) -> str:
        """
        Normalize text for comparison.
        
        Args:
            text: Text to normalize
            
        Returns:
            Normalized text (lowercase, stripped)
        """
        return text.lower().strip()

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity ratio between two texts using SequenceMatcher.
        
        Args:
            text1: First text
            text2: Second text
            
        Returns:
            Similarity ratio (0.0-1.0)
        """
        normalized1 = self._normalize_text(text1)
        normalized2 = self._normalize_text(text2)
        return difflib.SequenceMatcher(None, normalized1, normalized2).ratio()

    def _find_similar_text(
        self, 
        search_text: str, 
        ocr_results: List[Dict[str, Any]]
    ) -> List[Tuple[Dict[str, Any], float]]:
        """
        Find OCR results that match the search text using fuzzy matching.
        
        Args:
            search_text: Text to search for
            ocr_results: List of OCR result dictionaries
            
        Returns:
            List of tuples (ocr_result, similarity_score) for matches above threshold
        """
        matches = []
        for ocr_result in ocr_results:
            ocr_text = ocr_result.get("text", "")
            similarity = self._calculate_similarity(search_text, ocr_text)
            
            if similarity >= SIMILARITY_THRESHOLD:
                matches.append((ocr_result, similarity))
        
        # Sort by similarity score (highest first)
        matches.sort(key=lambda x: x[1], reverse=True)
        return matches

    def _calculate_center_coordinates(self, bbox: Dict[str, int]) -> Tuple[int, int]:
        """
        Calculate center coordinates from bounding box.
        
        Args:
            bbox: Bounding box dictionary with x, y, width, height
            
        Returns:
            Tuple of (center_x, center_y)
        """
        center_x = bbox["x"] + bbox["width"] // 2
        center_y = bbox["y"] + bbox["height"] // 2
        return (center_x, center_y)

    async def run(self, args: ClickOCRElementArgs, ctx: ToolContext) -> dict:
        """
        Click on an OCR element by searching for matching text.
        
        Args:
            args: Click OCR arguments
            ctx: Execution context
            
        Returns:
            Dictionary with click action result
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return {
                    "error": init_error.error or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}"
                }

            # Take screenshot
            logger.debug("Click OCR tool: Taking screenshot")
            screenshot_result = await self.computer.screenshot()
            if not screenshot_result.success or not screenshot_result.screenshot_data:
                return {
                    "error": f"Screenshot failed: {screenshot_result.error}",
                    "llm_content": f"Error: Failed to take screenshot: {screenshot_result.error}"
                }

            # Get OCR plugin and perform OCR
            ocr_plugin = self._get_ocr_plugin()
            if not ocr_plugin.enabled:
                return {
                    "error": "OCR plugin is not enabled",
                    "llm_content": "Error: OCR plugin is not enabled. Cannot perform text search."
                }

            logger.debug("Click OCR tool: Performing OCR analysis")
            ocr_results = await ocr_plugin.perform_ocr(screenshot_result.screenshot_data)
            
            if ocr_results is None:
                return {
                    "error": "OCR analysis failed",
                    "llm_content": "Error: Failed to perform OCR analysis on screenshot."
                }

            if not ocr_results:
                return {
                    "error": "No text elements found on screen",
                    "llm_content": f"Error: No text elements found on screen. Cannot find text '{args.text}'."
                }

            # Find matching text elements
            matches = self._find_similar_text(args.text, ocr_results)
            
            if not matches:
                return {
                    "error": f"No matching text found for '{args.text}'",
                    "llm_content": f"Error: No matching text found for '{args.text}'. Please check the text and try again."
                }

            # Handle single match
            if len(matches) == 1:
                ocr_element, similarity = matches[0]
                bbox = ocr_element["bbox"]
                matched_text = ocr_element["text"]
                center_x, center_y = self._calculate_center_coordinates(bbox)

                # Perform the click based on type
                if args.click_type == "single":
                    click_result = await self.computer.left_click(center_x, center_y)
                elif args.click_type == "double":
                    click_result = await self.computer.double_click(center_x, center_y)
                elif args.click_type == "right":
                    click_result = await self.computer.right_click(center_x, center_y)
                else:
                    return {
                        "error": f"Invalid click type: {args.click_type}",
                        "llm_content": f"Error: Invalid click type: {args.click_type}. Use 'single', 'double', or 'right'."
                    }

                if click_result.success:
                    click_desc = (
                        f"{args.click_type} click" if args.click_type != "single" else "click"
                    )
                    llm_content = f"Successfully performed {click_desc} on text '{matched_text}' at coordinates ({center_x}, {center_y})"
                    
                    return {
                        "success": True,
                        "text": matched_text,
                        "coordinates": (center_x, center_y),
                        "click_type": args.click_type,
                        "similarity": similarity,
                        "llm_content": llm_content,
                        "return_display": f"Clicked on '{matched_text}'"
                    }
                else:
                    return {
                        "error": click_result.error or "Click failed",
                        "llm_content": f"Failed to click on text '{matched_text}': {click_result.error}"
                    }

            # Handle multiple matches
            else:
                # Format matches for error message
                match_descriptions = []
                for ocr_element, similarity in matches:
                    bbox = ocr_element["bbox"]
                    matched_text = ocr_element["text"]
                    center_x, center_y = self._calculate_center_coordinates(bbox)
                    match_descriptions.append(f"'{matched_text}' at ({center_x}, {center_y})")
                
                matches_str = ", ".join(match_descriptions)
                error_msg = f"click is not executed, similar text : {matches_str}"
                
                return {
                    "error": f"Multiple matching texts found for '{args.text}'",
                    "llm_content": error_msg,
                    "matches": [
                        {
                            "text": ocr_element["text"],
                            "coordinates": self._calculate_center_coordinates(ocr_element["bbox"]),
                            "similarity": similarity
                        }
                        for ocr_element, similarity in matches
                    ]
                }

        except Exception as e:
            logger.error(f"Click OCR tool error: {e}", exc_info=True)
            return {
                "error": f"Click OCR operation failed: {str(e)}",
                "llm_content": f"Error: Failed to click on OCR element: {str(e)}"
            }
