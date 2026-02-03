"""
Unified Mouse Control Tool (SDK Version)

Tool for controlling mouse actions with different coordinate finding strategies.
Combines manual coordinates, OCR text search, and visual prediction capabilities.
"""
import logging
import difflib
from typing import Literal, Optional, Tuple, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict, model_validator

from backend.src.core.security.policy import Permission
from backend.src.core.types.enums import CoordinateFindingMethod, MouseAction, ScrollDirection
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer_legacy.computer_interface import ComputerInterface
from backend.src.tools.computer_legacy.input_types import MouseButton
from backend.src.services.vision import InternVLModel
from backend.src.services.vision.utils import normalize_model_name

logger = logging.getLogger(__name__)

# Similarity threshold for text matching (0.0-1.0)
SIMILARITY_THRESHOLD = 0.8


class MouseControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: MouseAction = Field(..., description="Mouse action to perform")

    # Coordinate finding method
    find_coordinates_by: CoordinateFindingMethod = Field(
        CoordinateFindingMethod.MANUAL, description="Method to find the target coordinates for the mouse action"
    )

    # Manual coordinate fields
    x: Optional[int] = Field(None, description="X coordinate (required when find_coordinates_by='manual')")
    y: Optional[int] = Field(None, description="Y coordinate (required when find_coordinates_by='manual')")

    # OCR coordinate fields
    ocr_text: Optional[str] = Field(None, description="Exact text to search for on screen using OCR. Required for 'ocr' method. Do NOT use for 'prediction'.")

    # Prediction coordinate fields
    description: Optional[str] = Field(None, description="Highly detailed visual description of the non-text element (icon, image). Required for 'prediction' method. Do NOT use for 'ocr'.")
    model_name: Optional[str] = Field(None, description="Optional specific vision model to use for prediction")

    # Action-specific fields
    scroll_amount: Optional[int] = Field(None, description="Amount to scroll (positive for down/right, negative for up/left, required for scroll action)")
    scroll_direction: Optional[ScrollDirection] = Field(ScrollDirection.VERTICAL, description="Direction of scrolling (required for scroll action)")
    duration: float = Field(0.5, description="Duration for drag operations")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this mouse action executes."
    )

    @model_validator(mode='after')
    def validate_conditional_fields(self):
        """Validate that required fields are present based on find_coordinates_by value."""
        if self.find_coordinates_by == CoordinateFindingMethod.MANUAL:
            if self.x is None or self.y is None:
                raise ValueError("x and y coordinates are required when find_coordinates_by='manual'")
        elif self.find_coordinates_by == CoordinateFindingMethod.OCR:
            if not self.ocr_text:
                raise ValueError("ocr_text is required when find_coordinates_by='ocr'")
        elif self.find_coordinates_by == CoordinateFindingMethod.PREDICTION:
            if not self.description:
                raise ValueError("description is required when find_coordinates_by='prediction'")

        if self.action == MouseAction.SCROLL:
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
    required_permissions = {Permission.COMPUTER_CONTROL}
    category = ToolDomain.COMPUTER

    def __init__(self):
        self.computer = ComputerInterface()
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

            session = ctx.services.get("session")
            if not session:
                raise ValueError("AgentSession not available in ToolContext services. It is required for OCR-based operations.")

            # Find coordinates based on the specified strategy
            coordinates = await self._find_coordinates(args, ctx, session)

            x, y = coordinates

            # Execute the mouse action (args.action is already MouseAction enum)
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

    async def _find_coordinates(self, args: MouseControlArgs, ctx: ToolContext, session: Any) -> Tuple[int, int]:
        """Find coordinates using the specified strategy."""
        if args.find_coordinates_by == CoordinateFindingMethod.MANUAL:
            return await self._find_coordinates_manual(args)
        elif args.find_coordinates_by == CoordinateFindingMethod.OCR:
            return await self._find_coordinates_by_ocr(args, ctx)
        elif args.find_coordinates_by == CoordinateFindingMethod.PREDICTION:
            return await self._find_coordinates_by_prediction(args, ctx)
        else:
            raise ValueError(f"Unknown coordinate finding method: {args.find_coordinates_by}")

    async def _find_coordinates_manual(self, args: MouseControlArgs) -> Tuple[int, int]:
        """Return manually specified coordinates."""
        if args.x is None or args.y is None:
            raise ValueError("Manual coordinates require x and y values")
        return (args.x, args.y)

    async def _find_coordinates_by_ocr(self, args: MouseControlArgs, ctx: ToolContext, session: Any) -> Tuple[int, int]:
        """Find coordinates by searching for text using OCR."""
        if not args.ocr_text:
            raise ValueError("OCR coordinate finding requires ocr_text")

        # Wait for proactive OCR to complete if it's still running
        # Initialize event if it doesn't exist (defensive check)
        if not hasattr(session, 'ocr_completion_event') or session.ocr_completion_event is None:
            import asyncio
            session.ocr_completion_event = asyncio.Event()
            # If event was just created, it's already set (no OCR in progress), so we can continue
        else:
            await session.ocr_completion_event.wait()

        # Try to use latest_ocr_results from proactive OCR
        if session.latest_ocr_results:
            ocr_results = session.latest_ocr_results
            logger.debug("Using proactive OCR results from session.")
        else:
            # Fallback: if proactive OCR failed or not enabled, perform OCR locally
            logger.warning("Proactive OCR results not available or empty. Performing OCR locally.")
            # Take screenshot
            screenshot_result = await self.computer.screenshot()
            if not screenshot_result.success or not screenshot_result.screenshot_data:
                raise ValueError(f"Screenshot failed: {screenshot_result.error}")

            # Get OCR service and perform OCR
            ocr_service = self._get_ocr_service(ctx, session)
            if not ocr_service or not ocr_service.enabled:
                raise ValueError("OCR service is not available or enabled")

            ocr_results = await ocr_service.perform_ocr(screenshot_result.screenshot_data)
            if ocr_results is None or not ocr_results:
                raise ValueError("OCR analysis failed or found no text")

        # Find matching text
        matches = self._find_similar_text(args.ocr_text, ocr_results)
        if not matches:
            raise ValueError(f"No matching text found for '{args.ocr_text}'")

        # Use the best match
        if len(matches) == 1:
            ocr_element, similarity = matches[0]
            bbox = ocr_element["bbox"]
            return self._calculate_center_coordinates(bbox)
        else:
            # Multiple matches - return the first one for now
            logger.warning(f"Multiple matches found for '{args.ocr_text}', using first match")
            ocr_element, similarity = matches[0]
            bbox = ocr_element["bbox"]
            return self._calculate_center_coordinates(bbox)

    async def _find_coordinates_by_prediction(self, args: MouseControlArgs, ctx: ToolContext, session: Any) -> Tuple[int, int]:
        """Find coordinates using vision model prediction."""
        if not args.description:
            raise ValueError("Prediction coordinate finding requires description")

        # Capture screenshot
        screenshot_data = await self._capture_screenshot(ctx, session)
        if screenshot_data is None:
            raise ValueError("Failed to capture screenshot for prediction")

        # Get vision model
        vision_model = await self._get_vision_model(ctx, args.model_name)
        if vision_model is None:
            raise ValueError("Vision model not available")

        # Predict coordinates
        coordinates = await self._predict_coordinates(vision_model, screenshot_data, args.description)
        if coordinates is None:
             raise ValueError(f"Vision model could not identify element matching '{args.description}'")
        
        return coordinates

    async def _execute_mouse_action(self, action: MouseAction, x: int, y: int, args: MouseControlArgs):
        """Execute the specific mouse action at given coordinates."""
        # Use enum-based dispatch for type safety
        action_handlers = {
            MouseAction.CLICK: lambda: self.computer.left_click(x, y),
            MouseAction.DOUBLE_CLICK: lambda: self.computer.double_click(x, y),
            MouseAction.RIGHT_CLICK: lambda: self.computer.right_click(x, y),
            MouseAction.MOVE: lambda: self.computer.move_cursor(x, y),
            MouseAction.DRAG: lambda: self.computer.drag_to(x, y, "left", args.duration),
            MouseAction.SCROLL: lambda: self._execute_scroll(x, y, args),
        }
        
        handler = action_handlers.get(action)
        if handler:
            return await handler()
        else:
            raise ValueError(f"Unknown mouse action: {action}")
    
    async def _execute_scroll(self, x: int, y: int, args: MouseControlArgs):
        """Execute scroll action with direction handling."""
        if args.scroll_direction == ScrollDirection.VERTICAL:
            return await self.computer.scroll_vertical(x, y, args.scroll_amount or 0)
        else:
            return await self.computer.scroll_horizontal(x, y, args.scroll_amount or 0)

    # OCR helper methods
    def _get_ocr_service(self, ctx: ToolContext, session: Any):
        """Get OCR service from context or session."""
        ocr_service = ctx.services.get("ocr_service")
        if ocr_service:
            return ocr_service
        return getattr(session, "ocr_service", None)

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
    async def _capture_screenshot(self, ctx: ToolContext, session: Any) -> Optional[str]:
        """Capture screenshot using tool registry."""
        # Try to use the latest_screenshot from the session if available
        if session.latest_screenshot:
            logger.debug("Using latest_screenshot from session for prediction.")
            return session.latest_screenshot
        """Capture screenshot using tool registry."""
        tool_registry = ctx.services.get("tool_registry")
        if not tool_registry:
            logger.error("Tool registry not available in context")
            return None

        from backend.src.llm.parser import ParsedToolCall
        from backend.src.tools.execution.engine import create_execution_engine_from_registry
        
        execution_engine = create_execution_engine_from_registry(tool_registry)
        
        tool_call = ParsedToolCall(
            tool_name="screenshot",
            parameters={},
            raw_call="screenshot()",
            confidence=1.0,
        )
        
        execution_result = await execution_engine.execute(
            tool_call,
            user_id=ctx.user_id or "system",
            session_id=ctx.session_id or "system",
        )

        if not execution_result.success:
            return None
            
        tool_result = execution_result.result
        if tool_result.data and isinstance(tool_result.data, dict):
            screenshot_data = tool_result.data.get("screenshot")
        else:
            screenshot_data = None

        return screenshot_data if screenshot_data else None

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
