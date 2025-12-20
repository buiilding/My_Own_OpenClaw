"""
UI Grounding Tool (SDK Version)

Predicts click coordinates for UI elements based on visual analysis and text descriptions.
Uses local vision models like InternVL to find interactive elements on screen.
"""

import logging
from typing import Optional, Tuple, Dict, Any

from pydantic import BaseModel, ConfigDict, Field

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.services.vision import InternVLModel
from backend.src.services.vision.utils import normalize_model_name
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class PredictClickArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    element_description: str = Field(
        ...,
        description="Detailed visual description of the element to find (include color, position, shape, text, icons, etc.)",
    )
    model_name: Optional[str] = Field(
        None, description="Optional specific vision model to use"
    )


class PredictClickTool(Tool[PredictClickArgs]):
    """
    Tool for finding and clicking on UI elements using vision-language models.

    This tool analyzes screenshots and element descriptions to predict precise
    click coordinates for GUI automation tasks and then performs the click.
    """

    name = "predict_click"
    description = "Find and click on UI elements by automatically taking a screenshot and analyzing it with detailed element descriptions using vision-language models. Provide specific, detailed descriptions of visual elements (e.g., 'the blue Save button in the top-right corner', 'the red close X button', 'the search bar with the magnifying glass icon'). After execution, returns a status message and a screenshot showing the screen state after the click action."
    args_model = PredictClickArgs

    def __init__(self):
        """Initialize the predict click tool."""
        self.computer = ComputerInterface()

    async def run(self, args: PredictClickArgs, ctx: ToolContext) -> dict:
        """
        Predict click coordinates for a described UI element by taking a screenshot automatically.

        Args:
            args: Predict click arguments
            ctx: Execution context

        Returns:
            Dictionary with predicted coordinates and click result
        """
        try:
            # Capture screenshot
            screenshot_data = await self._capture_screenshot(ctx)
            if screenshot_data is None:
                return self._error_response(
                    "Failed to capture screenshot for UI grounding",
                    "Error: Could not capture screenshot",
                )

            # Get and validate vision model
            vision_model = await self._get_vision_model(ctx, args.model_name)
            if vision_model is None:
                return self._error_response(
                    "Vision model not available",
                    "Error: Vision model service not available or failed validation",
                )

            # Predict coordinates
            coordinates = await self._predict_coordinates(
                vision_model, screenshot_data, args.element_description
            )
            if coordinates is None:
                return self._error_response(
                    "Could not predict coordinates for the described element",
                    "UI grounding failed to find the described element",
                )

            # Execute click
            return await self._execute_click(coordinates, args.element_description, args.model_name)

        except Exception as e:
            logger.error(f"UI grounding tool error: {e}", exc_info=True)
            return self._error_response(
                f"UI grounding failed: {str(e)}",
                f"Error: UI grounding analysis failed: {str(e)}",
            )

    async def _capture_screenshot(self, ctx: ToolContext) -> Optional[str]:
        """Capture screenshot using tool registry."""
        tool_registry = ctx.services.get("tool_registry")
        if not tool_registry:
            logger.error("Tool registry not available in context")
            return None

        from backend.src.tools.execution.engine import (
            create_execution_engine_from_registry,
        )

        execution_engine = create_execution_engine_from_registry(tool_registry)
        screenshot_result = await execution_engine.execute_tool_by_name("screenshot", {})

        # Extract screenshot data (handle both dict and legacy ToolResult)
        if isinstance(screenshot_result, dict):
            screenshot_data = screenshot_result.get("screenshot")
            success = screenshot_result.get("success", True)
        else:
            screenshot_data = (
                screenshot_result.data.get("screenshot")
                if screenshot_result.success
                else None
            )
            success = screenshot_result.success

        return screenshot_data if (success and screenshot_data) else None

    async def _get_vision_model(
        self, ctx: ToolContext, requested_model_name: Optional[str]
    ) -> Optional[InternVLModel]:
        """Get and validate vision model from service."""
        vision_service = ctx.services.get("vision_service")

        if vision_service is None:
            logger.error(
                "Vision service not available in context. "
                "Debug: Check container initialization - vision service should be initialized at startup."
            )
            return None

        if not vision_service.is_initialized:
            error_msg = vision_service.initialization_error or "Unknown initialization error"
            logger.error(
                f"Vision service not initialized. "
                f"Debug: Initialization error: {error_msg}. "
                f"Check server startup logs for vision model loading errors."
            )
            return None

        # Validate model name matches
        requested_model = normalize_model_name(requested_model_name)
        service_model = normalize_model_name(vision_service.model_name)

        if requested_model != service_model:
            logger.error(
                f"Model mismatch: requested {requested_model}, but server initialized {service_model}. "
                f"Debug: Only the pre-initialized model is available."
            )
            return None

        vision_model = vision_service.model
        if vision_model is None:
            logger.error(
                "Vision service model is None despite being initialized. "
                "Debug: This indicates a bug in VisionService - model should be set after initialization."
            )
            return None

        logger.debug(f"Using pre-initialized vision model: {service_model}")
        return vision_model

    async def _execute_click(
        self, coordinates: Tuple[int, int], element_description: str, model_name: Optional[str]
    ) -> dict:
        """Execute click at predicted coordinates."""
        x, y = coordinates

        # Initialize computer interface
        init_error = await self.computer.ensure_initialized()
        if init_error:
            return self._error_response(
                init_error.error or "Computer interface initialization failed",
                f"Error: {init_error.error or 'Computer interface initialization failed'}",
            )

        # Perform click
        click_result = await self.computer.left_click(x, y)
        if not click_result.success:
            logger.warning(f"Click failed at coordinates ({x}, {y}): {click_result.error}")
            return {
                "error": f"Click failed: {click_result.error}",
                "llm_content": f"Predicted coordinates ({x}, {y}) but click failed",
                "coordinates": coordinates,
                "clicked": False,
            }

        return {
            "coordinates": coordinates,
            "x": x,
            "y": y,
            "clicked": True,
            "llm_content": f"Successfully clicked at coordinates ({x}, {y}) for element: '{element_description}'",
            "return_display": f"Clicked element at coordinates ({x}, {y})",
            "metadata": {
                "element_description": element_description,
                "model_used": model_name or "default",
                "confidence": 0.8,  # Placeholder confidence score
                "action_performed": "click",
            },
        }

    def _error_response(self, error: str, llm_content: str, debug_info: Optional[Dict[str, Any]] = None) -> dict:
        """Create standardized error response."""
        response = {
            "error": error,
            "llm_content": llm_content,
        }
        if debug_info:
            response["debug_info"] = debug_info
        return response


    async def _predict_coordinates(
        self, vision_model: InternVLModel, screenshot_b64: str, element_description: str
    ) -> Optional[Tuple[int, int]]:
        """
        Predict click coordinates using vision model (InternVL-style).

        Args:
            vision_model: Initialized InternVL model instance
            screenshot_b64: Base64 screenshot data
            element_description: Text description of element

        Returns:
            Tuple of (x, y) coordinates or None if prediction fails
        """
        try:
            return await vision_model.predict_click_coordinates(
                screenshot_b64, element_description
            )
        except Exception as e:
            logger.error(f"Coordinate prediction failed: {e}", exc_info=True)
            return None
