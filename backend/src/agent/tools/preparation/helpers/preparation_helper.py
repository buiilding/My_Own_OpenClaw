"""
Tool resolution helper for coordinate resolution workflow.

Extracts shared logic for resolving a tool call that requires coordinate resolution.
Pure infrastructure code - no side effects beyond tool resolution.
"""
import logging
import time
from typing import AsyncGenerator, Optional, Tuple, TYPE_CHECKING

from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import resolve_coordinates
from backend.src.agent.tools.preparation.helpers.image_dimensions import (
    get_image_dimensions_from_screenshot_b64,
    parse_screen_resolution,
)
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.events.streaming_events import AgentStreamingEvent
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
    from backend.src.agent.tools.preparation.ocr import OcrCoordinator
    from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
    from backend.src.core.interfaces.vision import IVisionService

logger = logging.getLogger(__name__)


async def resolve_tool_with_coordinates(
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
    session: "AgentSession",
    screenshot_manager: "ScreenshotManager",
    ocr_coordinator: "OcrCoordinator",
    coordinate_resolver: "CoordinateResolver",
    vision_service: Optional["IVisionService"],
    vision_service_provider,
    context_id: str,  # bundle_id or request_id for logging
) -> AsyncGenerator[AgentStreamingEvent, None]:
    """
    Resolve a tool call that requires coordinate resolution.
    
    This is the shared logic for:
    - Screenshot availability check
    - Coordinate resolution
    - Rewriting tool call to manual mode
    
    Args:
        tool_call: The original tool call
        resolved_call: The resolved tool call to modify
        session: Agent session with screenshot state
        screenshot_manager: Manager for screenshot acquisition
        ocr_coordinator: Coordinator for OCR result acquisition
        coordinate_resolver: Resolver for coordinate resolution
        vision_service: Optional vision service instance
        vision_service_provider: Callable to get vision service from session
        context_id: Context ID (bundle_id or request_id) for logging
        
    Raises:
        ValueError: If screenshot data is unavailable
        Exception: If coordinate resolution fails
    """
    # 1. Ensure we have a screenshot
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

    # Normalize to frontend mouse coordinate space when screenshot pixel space differs
    # (common with HiDPI scaling where screenshot is physical pixels).
    if tool_call.parameters.get("find_coordinates_by") in (
        CoordinateFindingMethod.OCR,
        CoordinateFindingMethod.PREDICTION,
    ):
        x, y = _maybe_scale_coordinates_to_screen(session, screenshot_data, x, y, context_id)
    
    # 5. Rewrite to manual mode
    _rewrite_to_manual(resolved_call, x, y)
    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["coordinate_resolution_screenshot_id"] = screenshot_id
    logger.info(
        f"[context_id={short_id(context_id)}] Resolved coordinates for {tool_call.tool_name}: ({x}, {y}) using screenshot {screenshot_id[:8]}"
    )


def _maybe_scale_coordinates_to_screen(
    session: "AgentSession",
    screenshot_b64: str,
    x: int,
    y: int,
    context_id: str,
) -> Tuple[int, int]:
    system_state = session.get_current_system_state()
    screen_res = parse_screen_resolution(
        system_state.get("screen_resolution") if isinstance(system_state, dict) else None
    )
    if not screen_res:
        return x, y
    screen_w, screen_h = screen_res

    screenshot_res = get_image_dimensions_from_screenshot_b64(screenshot_b64)
    if not screenshot_res:
        return x, y
    shot_w, shot_h = screenshot_res

    if screen_w <= 0 or screen_h <= 0 or shot_w <= 0 or shot_h <= 0:
        return x, y

    if (screen_w, screen_h) == (shot_w, shot_h):
        return x, y

    scale_x = screen_w / shot_w
    scale_y = screen_h / shot_h
    scaled_x = int(round(x * scale_x))
    scaled_y = int(round(y * scale_y))
    logger.info(
        "[context_id=%s] Scaled coordinates from screenshot %sx%s to screen %sx%s: (%s,%s)->(%s,%s)",
        short_id(context_id),
        shot_w,
        shot_h,
        screen_w,
        screen_h,
        x,
        y,
        scaled_x,
        scaled_y,
    )
    return scaled_x, scaled_y


def _rewrite_to_manual(resolved_call: ResolvedToolCall, x: int, y: int):
    """
    Rewrite the resolved tool call parameters to use manual coordinates.
    
    Modifies the resolved call's parameters (immutable - original ParsedToolCall unchanged).
    Removes backend-only fields (find_coordinates_by, ocr_text, description) since
    the frontend MouseControlArgs schema only accepts x, y coordinates.
    
    Args:
        resolved_call: The resolved tool call to modify
        x: Resolved X coordinate
        y: Resolved Y coordinate
    """
    # Set manual coordinates
    resolved_call.parameters["x"] = x
    resolved_call.parameters["y"] = y

    # Remove backend-only fields that frontend doesn't understand
    # Frontend schema only accepts x, y, action, and action-specific fields
    resolved_call.parameters.pop("find_coordinates_by", None)
    resolved_call.parameters.pop("ocr_text", None)
    resolved_call.parameters.pop("description", None)
    resolved_call.parameters.pop("model_name", None)
