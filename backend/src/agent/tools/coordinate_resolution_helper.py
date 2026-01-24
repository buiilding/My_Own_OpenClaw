"""
Coordinate resolution helper for tool preparation.

Extracts shared coordinate resolution logic used by both bundle and single tool paths.
Pure infrastructure code - no side effects beyond coordinate resolution.
"""
import logging
import time
from typing import Optional, Tuple, TYPE_CHECKING

from backend.src.agent.tools.logging_utils import short_id
from backend.src.core.types import CoordinateFindingMethod

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession
    from backend.src.core.interfaces.vision import IVisionService
    from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


async def resolve_coordinates(
    tool_call: "ParsedToolCall",
    session: "AgentSession",
    screenshot_data: str,
    screenshot_id: str,
    ocr_coordinator,
    coordinate_resolver,
    vision_service: Optional["IVisionService"],
    vision_service_provider,
    context_id: str,  # bundle_id or request_id for logging
) -> Tuple[int, int]:
    """
    Resolve coordinates for a tool call that requires coordinate resolution.
    
    This is the shared logic for steps 2-4 of coordinate resolution:
    - Get OCR results if needed
    - Get vision service if needed  
    - Resolve coordinates
    
    Step 1 (screenshot acquisition) is handled by the caller since it yields events.
    Step 5 (rewrite to manual) is handled by the caller since it modifies prepared_call.
    
    Args:
        tool_call: The tool call requiring coordinate resolution
        session: Agent session with screenshot state
        screenshot_data: Base64-encoded screenshot data
        screenshot_id: Unique ID for the screenshot
        ocr_coordinator: Coordinator for OCR result acquisition
        coordinate_resolver: Resolver for coordinate resolution
        vision_service: Optional vision service instance
        vision_service_provider: Callable to get vision service from session
        context_id: Context ID (bundle_id or request_id) for logging
        
    Returns:
        Tuple of (x, y) coordinates
        
    Raises:
        Exception: If coordinate resolution fails
    """
    # 2. Get OCR results if needed
    ocr_results = None
    if tool_call.parameters.get("find_coordinates_by") == CoordinateFindingMethod.OCR:
        ocr_start_time = time.perf_counter()
        ocr_results = await ocr_coordinator.get_ocr_results(
            session, screenshot_data, screenshot_id
        )
        ocr_time = time.perf_counter() - ocr_start_time
        logger.info(
            f"[Timing] OCR results retrieval took {ocr_time:.3f}s "
            f"(context_id={short_id(context_id)}, found {len(ocr_results) if ocr_results else 0} results)"
        )
    
    # 3. Get vision service if needed
    effective_vision_service = vision_service
    if tool_call.parameters.get("find_coordinates_by") == CoordinateFindingMethod.PREDICTION:
        if not effective_vision_service:
            effective_vision_service = vision_service_provider(session)
        if not effective_vision_service:
            logger.warning(
                f"[context_id={short_id(context_id)}] Vision service unavailable for coordinate resolution"
            )
    
    # 4. Resolve coordinates
    coord_resolve_start_time = time.perf_counter()
    x, y = await coordinate_resolver.resolve(
        tool_call, screenshot_data, ocr_results, effective_vision_service
    )
    coord_resolve_time = time.perf_counter() - coord_resolve_start_time
    logger.info(
        f"[Timing] Coordinate resolution took {coord_resolve_time:.3f}s "
        f"(context_id={short_id(context_id)}, method={tool_call.parameters.get('find_coordinates_by')})"
    )
    
    return x, y
