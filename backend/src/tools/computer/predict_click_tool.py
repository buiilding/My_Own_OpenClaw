"""
UI Grounding Tool (SDK Version)

Predicts click coordinates for UI elements based on visual analysis and text descriptions.
Uses local vision models like InternVL to find interactive elements on screen.
"""

import logging
from typing import Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.services.vision import InternVLModel
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)

# Check if vision models are available
try:
    from backend.src.services.vision.internvl import VISION_MODELS_AVAILABLE
except ImportError:
    VISION_MODELS_AVAILABLE = False


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
        self._vision_model = None
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
            if not VISION_MODELS_AVAILABLE:
                return {
                    "error": "Vision models not available - UI grounding functionality requires local vision model installation",
                    "llm_content": "Error: UI grounding models not installed. This feature requires additional vision model dependencies.",
                }

            if not args.element_description:
                return {
                    "error": "element_description is required",
                    "llm_content": "Error: Missing element description for UI grounding",
                }

            # Take a screenshot automatically using tool registry from context
            tool_registry = ctx.services.get("tool_registry")
            if not tool_registry:
                return {
                    "error": "Tool registry not available in context",
                    "llm_content": "Error: Internal system error (registry missing)",
                }

            # Execute screenshot tool using ToolExecutionEngine
            from backend.src.tools.execution.engine import (
                create_execution_engine_from_registry,
            )

            execution_engine = create_execution_engine_from_registry(tool_registry)
            screenshot_result = await execution_engine.execute_tool_by_name(
                "screenshot", {}
            )

            # Handle SDK tool result (dict) or legacy ToolResult
            if isinstance(screenshot_result, dict):
                screenshot_data = screenshot_result.get("screenshot")
                success = screenshot_result.get("success", True)
            else:
                # Legacy ToolResult
                screenshot_data = (
                    screenshot_result.data.get("screenshot")
                    if screenshot_result.success
                    else None
                )
                success = screenshot_result.success

            if not success or not screenshot_data:
                return {
                    "error": "Failed to capture screenshot for UI grounding",
                    "llm_content": "Error: Could not capture screenshot",
                }

            # Initialize vision model if needed
            if not await self._initialize_vision_model(args.model_name):
                return {
                    "error": "Failed to initialize vision model",
                    "llm_content": "Error: Could not initialize vision model for UI grounding",
                }

            # Predict click coordinates
            coordinates = await self._predict_coordinates(
                screenshot_data, args.element_description
            )

            if coordinates is None:
                return {
                    "error": "Could not predict coordinates for the described element",
                    "llm_content": "UI grounding failed to find the described element",
                }

            x, y = coordinates

            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return {
                    "error": init_error.error
                    or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}",
                }

            # Perform the actual click
            click_result = await self.computer.left_click(x, y)
            if not click_result.success:
                logger.warning(
                    f"Click failed at coordinates ({x}, {y}): {click_result.error}"
                )
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
                "llm_content": f"Successfully clicked at coordinates ({x}, {y}) for element: '{args.element_description}'",
                "return_display": f"Clicked element at coordinates ({x}, {y})",
                "metadata": {
                    "element_description": args.element_description,
                    "model_used": args.model_name or "default",
                    "confidence": 0.8,  # Placeholder confidence score
                    "action_performed": "click",
                },
            }

        except Exception as e:
            logger.error(f"UI grounding tool error: {e}", exc_info=True)
            return {
                "error": f"UI grounding failed: {str(e)}",
                "llm_content": f"Error: UI grounding analysis failed: {str(e)}",
            }

    async def _initialize_vision_model(self, model_name: Optional[str] = None) -> bool:
        """
        Initialize the vision model for UI grounding.

        Args:
            model_name: Specific model to load

        Returns:
            True if initialization successful, False otherwise
        """
        try:
            if self._vision_model is not None:
                return True  # Already initialized

            # Extract model name from huggingface-local prefix
            if model_name and model_name.startswith("huggingface-local/"):
                model_name = model_name.replace("huggingface-local/", "")

            # Default to InternVL model
            model_name = model_name or "OpenGVLab/InternVL3_5-4B"

            # Initialize InternVL model directly
            self._vision_model = InternVLModel(
                model_name=model_name, device="auto", trust_remote_code=True
            )

            logger.info(f"Initialized vision model: {model_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize vision model: {e}")
            return False

    async def _predict_coordinates(
        self, screenshot_b64: str, element_description: str
    ) -> Optional[Tuple[int, int]]:
        """
        Predict click coordinates using vision model (InternVL-style).

        Args:
            screenshot_b64: Base64 screenshot data
            element_description: Text description of element

        Returns:
            Tuple of (x, y) coordinates or None if prediction fails
        """
        try:
            if self._vision_model is None:
                logger.error("Vision model not initialized")
                return None

            # Use the InternVL model to predict coordinates
            return await self._vision_model.predict_click_coordinates(
                screenshot_b64, element_description
            )

        except Exception as e:
            logger.error(f"Coordinate prediction failed: {e}")
            return None
