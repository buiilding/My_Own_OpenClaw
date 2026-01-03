"""
Tool Preparer Service.

This module handles the preparation of tool calls before they are sent to the frontend.
It specifically handles coordinate resolution for mouse tools using OCR and Vision models,
and manages the "hidden screenshot" workflow when visual context is missing.
"""
import asyncio
import logging
import uuid
from typing import List, Optional, Tuple, Dict, Any, AsyncGenerator, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

from backend.src.core.events import RequestScreenshotEvent, ToolCallEvent, AgentStreamingEvent, ErrorEvent
from backend.src.llm.parser import ParsedToolCall
from backend.src.core.types import CoordinateFindingMethod, MouseAction

logger = logging.getLogger(__name__)


class ToolPreparer:
    """
    Prepares tool calls for execution by resolving dependencies and coordinates.
    
    Responsibilities:
    1. Intercept 'mouse_control' calls using OCR or Prediction.
    2. Ensure a recent screenshot is available (requesting a hidden one if needed).
    3. Run OCR or Vision Model to resolve coordinates.
    4. Rewrite the tool call to use 'manual' coordinates (x, y).
    """

    def __init__(self):
        """Initialize the tool preparer."""
        pass

    async def prepare_tools(
        self, 
        tool_calls: List[ParsedToolCall], 
        session: "AgentSession"
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Prepare tool calls and yield ToolCallEvents (and potentially RequestScreenshotEvents).
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: RequestScreenshotEvent or ToolCallEvent
        """
        for tool_call in tool_calls:
            # Generate request_id for each tool call
            request_id = str(uuid.uuid4())
            if not hasattr(tool_call, 'metadata'):
                tool_call.metadata = {}
            tool_call.metadata['request_id'] = request_id

            # Check if this tool needs coordinate resolution
            if self._needs_coordinate_resolution(tool_call):
                coordinates_resolved = False
                try:
                    # 1. Ensure we have a screenshot
                    screenshot_data = session.latest_screenshot
                    if not screenshot_data:
                        logger.info("No screenshot in session, requesting hidden screenshot...")
                        
                        hidden_request_id = str(uuid.uuid4())
                        session.hidden_screenshot_request_id = hidden_request_id
                        session.screenshot_waiter = asyncio.Future()
                        
                        # Yield request event
                        yield RequestScreenshotEvent(request_id=hidden_request_id)
                        
                        # Wait for result (with timeout)
                        try:
                            logger.info(f"Waiting for hidden screenshot result (id={hidden_request_id})...")
                            screenshot_data = await asyncio.wait_for(session.screenshot_waiter, timeout=30.0)
                            logger.info(f"Received hidden screenshot result (id={hidden_request_id})")
                        except asyncio.TimeoutError:
                            logger.error(f"Timed out waiting for hidden screenshot (id={hidden_request_id}) after 30s")
                            raise ValueError("Failed to acquire screenshot for coordinate resolution (timeout)")
                    
                    if screenshot_data:
                        # 2. Resolve coordinates
                        x, y = await self._resolve_coordinates_with_data(tool_call, session, screenshot_data)
                        
                        # 3. Rewrite tool call to manual mode
                        self._rewrite_to_manual(tool_call, x, y)
                        coordinates_resolved = True
                        logger.info(f"Resolved coordinates for {tool_call.tool_name}: ({x}, {y})")
                    else:
                        raise ValueError("No screenshot data available for coordinate resolution")
                    
                except Exception as e:
                    logger.error(f"Failed to resolve coordinates for {tool_call.tool_name}: {e}", exc_info=True)
                    # If coordinate resolution fails, we cannot send the tool call to frontend
                    # because frontend schema requires x/y coordinates
                    # Yield an error event instead
                    error_msg = (
                        f"Failed to resolve coordinates for {tool_call.tool_name}: {str(e)}. "
                        f"Coordinate resolution is required for '{tool_call.parameters.get('find_coordinates_by')}' method."
                    )
                    yield ErrorEvent(content=error_msg)
                    # Skip yielding ToolCallEvent - don't send invalid tool call to frontend
                    continue
            
            # Yield the (possibly modified) event
            yield ToolCallEvent(
                tool_name=tool_call.tool_name,
                parameters=tool_call.parameters,
                raw_call=tool_call.raw_call,
                request_id=request_id,
            )

    def _needs_coordinate_resolution(self, tool_call: ParsedToolCall) -> bool:
        """Check if the tool call requires coordinate resolution."""
        if tool_call.tool_name != "mouse_control":
            return False
        
        method = tool_call.parameters.get("find_coordinates_by")
        return method in [CoordinateFindingMethod.OCR, CoordinateFindingMethod.PREDICTION]

    async def _resolve_coordinates_with_data(self, tool_call: ParsedToolCall, session: "AgentSession", screenshot_data: str) -> Tuple[int, int]:
        """Resolve coordinates using OCR or Vision with provided screenshot data."""
        method = tool_call.parameters.get("find_coordinates_by")
        
        if method == CoordinateFindingMethod.OCR:
            return await self._resolve_by_ocr(tool_call, session, screenshot_data)
        elif method == CoordinateFindingMethod.PREDICTION:
            return await self._resolve_by_vision(tool_call, session, screenshot_data)
        else:
            raise ValueError(f"Unknown coordinate finding method: {method}")

    # _ensure_screenshot removed as logic is now inprepare_tools to support yielding

    async def _resolve_by_ocr(self, tool_call: ParsedToolCall, session: "AgentSession", screenshot_data: str) -> Tuple[int, int]:
        """Resolve coordinates using OCR."""
        text = tool_call.parameters.get("ocr_text")
        if not text:
            raise ValueError("ocr_text parameter is required for OCR method")
            
        # Get OCR results (use cached if available and matching screenshot, otherwise run it)
        # Note: ToolResultHandler updates latest_ocr_results when latest_screenshot updates.
        # So if we just got a screenshot, it might be running.
        # Or if we used an old screenshot, results might be there.
        
        ocr_results = session.latest_ocr_results
        
        # If no results yet (race condition or old screenshot without OCR?), run it now
        if not ocr_results:
            logger.info("OCR results not cached, running OCR now...")
            
            ocr_plugin = None
            if session.executor and session.executor.plugin_manager:
                ocr_plugin = session.executor.plugin_manager.plugin_registry.get_plugin("ocr_analysis")
                
            if not ocr_plugin or not ocr_plugin.enabled:
                raise ValueError("OCR plugin is not available or enabled")
                
            ocr_results = await ocr_plugin.perform_ocr(screenshot_data)
            session.latest_ocr_results = ocr_results
            
        if not ocr_results:
            raise ValueError("OCR analysis returned no results")
            
        # Find matching text (simple fuzzy match)
        import difflib
        
        best_match = None
        best_score = 0.0
        target = text.lower().strip()
        
        for item in ocr_results:
            current = item.get("text", "").lower().strip()
            score = difflib.SequenceMatcher(None, target, current).ratio()
            if score > best_score:
                best_score = score
                best_match = item
        
        if best_match and best_score > 0.8: # Threshold
            bbox = best_match["bbox"]
            x = bbox["x"] + bbox["width"] // 2
            y = bbox["y"] + bbox["height"] // 2
            return x, y
        
        raise ValueError(f"Could not find text '{text}' on screen (best match: {best_score})")

    async def _resolve_by_vision(self, tool_call: ParsedToolCall, session: "AgentSession", screenshot_data: str) -> Tuple[int, int]:
        """Resolve coordinates using Vision Model."""
        description = tool_call.parameters.get("description")
        model_name = tool_call.parameters.get("model_name")
        if not description:
            raise ValueError("description parameter is required for prediction method")
            
        # Access VisionService via context factory
        # session.executor.tool_orchestrator.context_factory.vision_service
        try:
            vision_service = session.executor.tool_orchestrator.context_factory.vision_service
        except AttributeError:
            logger.error("Could not access VisionService through session hierarchy")
            vision_service = None
            
        if not vision_service or not vision_service.is_initialized:
            raise ValueError("Vision service is not available or initialized")
            
        model = vision_service.model
        if not model:
            raise ValueError("Vision model instance is None")
            
        # Run prediction
        coordinates = await model.predict_click_coordinates(screenshot_data, description)
        if not coordinates:
            raise ValueError(f"Vision model could not identify '{description}'")
            
        return coordinates

    def _rewrite_to_manual(self, tool_call: ParsedToolCall, x: int, y: int):
        """
        Rewrite the tool call parameters to use manual coordinates.
        
        Removes backend-only fields (find_coordinates_by, ocr_text, description) since
        the frontend MouseControlArgs schema only accepts x, y coordinates.
        """
        # Set manual coordinates
        tool_call.parameters["x"] = x
        tool_call.parameters["y"] = y
        
        # Remove backend-only fields that frontend doesn't understand
        # Frontend schema only accepts x, y, action, and action-specific fields
        tool_call.parameters.pop("find_coordinates_by", None)
        tool_call.parameters.pop("ocr_text", None)
        tool_call.parameters.pop("description", None)
        tool_call.parameters.pop("model_name", None)
