"""
Unified Mouse Control Tool (SDK Version)

Tool for controlling mouse actions with different coordinate finding strategies.
Combines manual coordinates, OCR text search, and visual prediction capabilities.
"""
import logging
import difflib
from typing import Literal, Optional, Tuple, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict, model_validator

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.computer.computer_interface import ComputerInterface, MouseButton
from backend.src.services.vision import InternVLModel
from backend.src.services.vision.utils import normalize_model_name

logger = logging.getLogger(__name__)

# Similarity threshold for text matching (0.0-1.0)
SIMILARITY_THRESHOLD = 0.8


class MouseControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal[
        "click",
        "double_click",
        "right_click",
        "move",
        "drag",
        "scroll",
    ] = Field(..., description="Mouse action to perform")

    # Coordinate finding method
    find_coordinates_by: Literal["manual", "ocr", "prediction"] = Field(
        "manual", description="Method to find the target coordinates for the mouse action"
    )

    # Manual coordinate fields
    x: Optional[int] = Field(None, description="X coordinate (required when find_coordinates_by='manual')")
    y: Optional[int] = Field(None, description="Y coordinate (required when find_coordinates_by='manual')")

    # OCR coordinate fields
    ocr_text: Optional[str] = Field(None, description="Text to search for on screen using OCR (required when find_coordinates_by='ocr')")

    # Prediction coordinate fields
    description: Optional[str] = Field(None, description="Detailed visual description of the element to find (required when find_coordinates_by='prediction')")
    model_name: Optional[str] = Field(None, description="Optional specific vision model to use for prediction")

    # Action-specific fields
    scroll_amount: Optional[int] = Field(None, description="Amount to scroll (positive for down/right, negative for up/left, required for scroll action)")
    scroll_direction: Optional[Literal["vertical", "horizontal"]] = Field("vertical", description="Direction of scrolling (required for scroll action)")
    duration: float = Field(0.5, description="Duration for drag operations")
    explanation: str = Field(
        ...,
        description="One concise sentence explaining why this tool is being used and what you expect to see in the screenshot after this mouse action executes (e.g., 'Clicking the submit button and expecting to see a confirmation dialog appear')."
    )

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        """Validate that required fields are present based on find_coordinates_by value."""
        if self.find_coordinates_by == "manual":
            if self.x is None or self.y is None:
                raise ValueError("x and y coordinates are required when find_coordinates_by='manual'")
        elif self.find_coordinates_by == "ocr":
            if not self.ocr_text:
                raise ValueError("ocr_text is required when find_coordinates_by='ocr'")
        elif self.find_coordinates_by == "prediction":
            if not self.description:
                raise ValueError("description is required when find_coordinates_by='prediction'")

        if self.action == "scroll":
            if self.scroll_amount is None:
                raise ValueError("scroll_amount is required when action='scroll'")

        return self

class MouseTool(Tool[MouseControlArgs]):
    """
    Unified mouse control tool that supports multiple coordinate finding strategies.

    This tool combines manual coordinate input, OCR-based text search, and
    vision-based element prediction into a single, well-structured interface.
    """
    name = "mouse_control"
    description = "Unified mouse control with multiple coordinate finding strategies: manual coordinates, OCR text search, or visual element prediction. Supports clicking, double-clicking, right-clicking, moving, dragging, and scrolling."
    args_model = MouseControlArgs

    def __init__(self):
        self.computer = ComputerInterface()
        self._ocr_plugin = None
        self._vision_service = None

    async def run(self, args: MouseControlArgs, ctx: ToolContext) -> dict:
        """
        Execute mouse action using the specified coordinate finding strategy.

        Args:
            args: Mouse control arguments
            ctx: Execution context

        Returns:
            Dictionary with action result
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return self._error_response(
                    init_error.error or "Computer interface initialization failed",
                    f"Error: {init_error.error or 'Computer interface initialization failed'}"
                )

            # Find coordinates based on the specified strategy
            coordinates = await self._find_coordinates(args, ctx)
            if coordinates is None:
                return self._error_response(
                    "Could not determine coordinates for mouse action",
                    "Failed to find coordinates for the specified action"
                )

            x, y = coordinates

            # Execute the mouse action
            result = await self._execute_mouse_action(args.action, x, y, args)

            if not result.success:
                return self._error_response(
                    f"Mouse action failed: {result.error}",
                    f"Failed to perform {args.action} at ({x}, {y}): {result.error}"
                )

            # Return success response
            return {
                "success": True,
                "coordinates": coordinates,
                "action": args.action,
                "llm_content": result.message,
                "return_display": result.message
            }

        except Exception as e:
            logger.error(f"Mouse control tool error: {e}", exc_info=True)
            return self._error_response(
                f"Mouse control operation failed: {str(e)}",
                f"Error: Failed to perform mouse action: {str(e)}"
            )

    async def _find_coordinates(self, args: MouseControlArgs, ctx: ToolContext) -> Optional[Tuple[int, int]]:
        """Find coordinates using the specified strategy."""
        if args.find_coordinates_by == "manual":
            return await self._find_coordinates_manual(args)
        elif args.find_coordinates_by == "ocr":
            return await self._find_coordinates_by_ocr(args, ctx)
        elif args.find_coordinates_by == "prediction":
            return await self._find_coordinates_by_prediction(args, ctx)
        else:
            logger.error(f"Unknown coordinate finding method: {args.find_coordinates_by}")
            return None

    async def _find_coordinates_manual(self, args: MouseControlArgs) -> Optional[Tuple[int, int]]:
        """Return manually specified coordinates."""
        if args.x is None or args.y is None:
            logger.error("Manual coordinates require x and y values")
            return None
        return (args.x, args.y)

    async def _find_coordinates_by_ocr(self, args: MouseControlArgs, ctx: ToolContext) -> Optional[Tuple[int, int]]:
        """Find coordinates by searching for text using OCR."""
        if not args.ocr_text:
            logger.error("OCR coordinate finding requires ocr_text")
            return None

        try:
            # Take screenshot
            screenshot_result = await self.computer.screenshot()
            if not screenshot_result.success or not screenshot_result.screenshot_data:
                logger.error(f"Screenshot failed: {screenshot_result.error}")
                return None

            # Get OCR plugin and perform OCR
            ocr_plugin = self._get_ocr_plugin()
            if not ocr_plugin.enabled:
                logger.error("OCR plugin is not enabled")
                return None

            ocr_results = await ocr_plugin.perform_ocr(screenshot_result.screenshot_data)
            if ocr_results is None or not ocr_results:
                logger.error("OCR analysis failed or found no text")
                return None

            # Find matching text
            matches = self._find_similar_text(args.ocr_text, ocr_results)
            if not matches:
                logger.warning(f"No matching text found for '{args.ocr_text}'")
                return None

            # Use the best match
            if len(matches) == 1:
                ocr_element, similarity = matches[0]
                bbox = ocr_element["bbox"]
                return self._calculate_center_coordinates(bbox)
            else:
                # Multiple matches - return the first one for now
                # Could be enhanced to return all matches in the future
                logger.warning(f"Multiple matches found for '{args.ocr_text}', using first match")
                ocr_element, similarity = matches[0]
                bbox = ocr_element["bbox"]
                return self._calculate_center_coordinates(bbox)

        except Exception as e:
            logger.error(f"OCR coordinate finding failed: {e}", exc_info=True)
            return None

    async def _find_coordinates_by_prediction(self, args: MouseControlArgs, ctx: ToolContext) -> Optional[Tuple[int, int]]:
        """Find coordinates using vision model prediction."""
        if not args.description:
            logger.error("Prediction coordinate finding requires description")
            return None

        try:
            # Capture screenshot
            screenshot_data = await self._capture_screenshot(ctx)
            if screenshot_data is None:
                logger.error("Failed to capture screenshot for prediction")
                return None

            # Get vision model
            vision_model = await self._get_vision_model(ctx, args.model_name)
            if vision_model is None:
                logger.error("Vision model not available")
                return None

            # Predict coordinates
            coordinates = await self._predict_coordinates(vision_model, screenshot_data, args.description)
            return coordinates

        except Exception as e:
            logger.error(f"Prediction coordinate finding failed: {e}", exc_info=True)
            return None

    async def _execute_mouse_action(self, action: str, x: int, y: int, args: MouseControlArgs):
        """Execute the specific mouse action at given coordinates."""
        if action == "click":
            return await self.computer.left_click(x, y)
        elif action == "double_click":
            return await self.computer.double_click(x, y)
        elif action == "right_click":
            return await self.computer.right_click(x, y)
        elif action == "move":
            return await self.computer.move_cursor(x, y)
        elif action == "drag":
            # Default to left button for drag if not specified
            return await self.computer.drag_to(x, y, "left", args.duration)
        elif action == "scroll":
            if args.scroll_direction == "vertical":
                return await self.computer.scroll_vertical(x, y, args.scroll_amount or 0)
            else:
                return await self.computer.scroll_horizontal(x, y, args.scroll_amount or 0)
        else:
            raise ValueError(f"Unknown mouse action: {action}")

    # OCR helper methods
    def _get_ocr_plugin(self):
        """Get or initialize OCR plugin instance."""
        if self._ocr_plugin is None:
            from backend.src.agent.plugins.ocr_plugin import get_ocr_plugin_instance
            self._ocr_plugin = get_ocr_plugin_instance()
        return self._ocr_plugin

    def _normalize_text(self, text: str) -> str:
        """Normalize text for comparison."""
        return text.lower().strip()

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity ratio between two texts."""
        normalized1 = self._normalize_text(text1)
        normalized2 = self._normalize_text(text2)
        return difflib.SequenceMatcher(None, normalized1, normalized2).ratio()

    def _find_similar_text(self, search_text: str, ocr_results: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], float]]:
        """Find OCR results that match the search text using fuzzy matching."""
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
        """Calculate center coordinates from bounding box."""
        center_x = bbox["x"] + bbox["width"] // 2
        center_y = bbox["y"] + bbox["height"] // 2
        return (center_x, center_y)

    # Vision prediction helper methods
    async def _capture_screenshot(self, ctx: ToolContext) -> Optional[str]:
        """Capture screenshot using tool registry."""
        tool_registry = ctx.services.get("tool_registry")
        if not tool_registry:
            logger.error("Tool registry not available in context")
            return None

        from backend.src.tools.execution.engine import create_execution_engine_from_registry
        execution_engine = create_execution_engine_from_registry(tool_registry)
        screenshot_result = await execution_engine.execute_tool_by_name("screenshot", {})

        if isinstance(screenshot_result, dict):
            screenshot_data = screenshot_result.get("screenshot")
            success = screenshot_result.get("success", True)
        else:
            screenshot_data = screenshot_result.data.get("screenshot") if screenshot_result.success else None
            success = screenshot_result.success

        return screenshot_data if (success and screenshot_data) else None

    async def _get_vision_model(self, ctx: ToolContext, requested_model_name: Optional[str]) -> Optional[InternVLModel]:
        """Get and validate vision model from service."""
        vision_service = ctx.services.get("vision_service")

        if vision_service is None:
            logger.error("Vision service not available in context")
            return None

        if not vision_service.is_initialized:
            error_msg = vision_service.initialization_error or "Unknown initialization error"
            logger.error(f"Vision service not initialized: {error_msg}")
            return None

        requested_model = normalize_model_name(requested_model_name)
        service_model = normalize_model_name(vision_service.model_name)

        if requested_model != service_model:
            logger.error(f"Model mismatch: requested {requested_model}, but server initialized {service_model}")
            return None

        vision_model = vision_service.model
        if vision_model is None:
            logger.error("Vision service model is None despite being initialized")
            return None

        logger.debug(f"Using pre-initialized vision model: {service_model}")
        return vision_model

    async def _predict_coordinates(self, vision_model: InternVLModel, screenshot_b64: str, element_description: str) -> Optional[Tuple[int, int]]:
        """Predict click coordinates using vision model."""
        try:
            return await vision_model.predict_click_coordinates(screenshot_b64, element_description)
        except Exception as e:
            logger.error(f"Coordinate prediction failed: {e}", exc_info=True)
            return None

    def _error_response(self, error: str, llm_content: str) -> dict:
        """Create standardized error response."""
        return {
            "error": error,
            "llm_content": llm_content,
        }
