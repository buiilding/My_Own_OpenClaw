"""
Tool preparation helper for coordinate resolution workflow.

Extracts shared logic for preparing a tool call that requires coordinate resolution.
Pure infrastructure code - no side effects beyond tool preparation.
"""
import logging
import time
from typing import AsyncGenerator, Optional, Tuple, TYPE_CHECKING

from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import resolve_coordinates
from backend.src.agent.tools.preparation.prepared_tool_call import PreparedToolCall
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.events import AgentStreamingEvent
from backend.src.llm.parser import ParsedToolCall

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
    from backend.src.agent.tools.preparation.ocr import OcrCoordinator
    from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
    from backend.src.core.interfaces.vision import IVisionService

logger = logging.getLogger(__name__)


async def prepare_tool_with_coordinates(
    tool_call: ParsedToolCall,
    prepared_call: PreparedToolCall,
    session: "AgentSession",
    screenshot_manager: "ScreenshotManager",
    ocr_coordinator: "OcrCoordinator",
    coordinate_resolver: "CoordinateResolver",
    vision_service: Optional["IVisionService"],
    vision_service_provider,
    context_id: str,  # bundle_id or request_id for logging
) -> AsyncGenerator[AgentStreamingEvent, None]:
    """
    Prepare a tool call that requires coordinate resolution.
    
    This is the shared logic for:
    - Screenshot acquisition (yields RequestScreenshotEvent if needed)
    - Coordinate resolution
    - Rewriting tool call to manual mode
    
    Args:
        tool_call: The original tool call
        prepared_call: The prepared tool call to modify
        session: Agent session with screenshot state
        screenshot_manager: Manager for screenshot acquisition
        ocr_coordinator: Coordinator for OCR result acquisition
        coordinate_resolver: Resolver for coordinate resolution
        vision_service: Optional vision service instance
        vision_service_provider: Callable to get vision service from session
        context_id: Context ID (bundle_id or request_id) for logging
        
    Yields:
        AgentStreamingEvent: RequestScreenshotEvent if screenshot is needed
        
    Raises:
        ValueError: If screenshot data is unavailable
        Exception: If coordinate resolution fails
    """
    # 1. Ensure we have a screenshot (yields RequestScreenshotEvent if needed)
    screenshot_start_time = time.perf_counter()
    async for event in screenshot_manager.get_screenshot(session):
        yield event
    screenshot_time = time.perf_counter() - screenshot_start_time
    if screenshot_time > 0.001:  # Only log if significant
        logger.info(f"[Timing] Screenshot acquisition took {screenshot_time:.3f}s (context_id={short_id(context_id)})")
    
    # After screenshot manager completes, check if we have screenshot
    screenshot_data = session.get_screenshot()
    screenshot_id = session.get_current_screenshot_id()
    if not screenshot_data or not screenshot_id:
        raise ValueError("No screenshot data available for coordinate resolution")
    
    # 2-4. Resolve coordinates using shared helper
    x, y = await resolve_coordinates(
        tool_call,
        session,
        screenshot_data,
        screenshot_id,
        ocr_coordinator,
        coordinate_resolver,
        vision_service,
        vision_service_provider,
        context_id,
    )
    
    # 5. Rewrite to manual mode
    _rewrite_to_manual(prepared_call, x, y)
    if not prepared_call.metadata:
        prepared_call.metadata = {}
    prepared_call.metadata["coordinate_resolution_screenshot_id"] = screenshot_id
    logger.info(
        f"[context_id={short_id(context_id)}] Resolved coordinates for {tool_call.tool_name}: ({x}, {y}) using screenshot {screenshot_id[:8]}"
    )


def _rewrite_to_manual(prepared_call: PreparedToolCall, x: int, y: int):
    """
    Rewrite the prepared tool call parameters to use manual coordinates.
    
    Modifies the prepared call's parameters (immutable - original ParsedToolCall unchanged).
    Removes backend-only fields (find_coordinates_by, ocr_text, description) since
    the frontend MouseControlArgs schema only accepts x, y coordinates.
    
    Args:
        prepared_call: The prepared tool call to modify
        x: Resolved X coordinate
        y: Resolved Y coordinate
    """
    # Set manual coordinates
    prepared_call.parameters["x"] = x
    prepared_call.parameters["y"] = y

    # Remove backend-only fields that frontend doesn't understand
    # Frontend schema only accepts x, y, action, and action-specific fields
    prepared_call.parameters.pop("find_coordinates_by", None)
    prepared_call.parameters.pop("ocr_text", None)
    prepared_call.parameters.pop("description", None)
    prepared_call.parameters.pop("model_name", None)
