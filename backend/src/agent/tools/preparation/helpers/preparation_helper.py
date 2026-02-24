"""
Tool resolution helper for coordinate resolution workflow.

Extracts shared logic for resolving a tool call that requires coordinate resolution.
Pure infrastructure code - no side effects beyond tool resolution.
"""
import logging
import platform
import time
from typing import Optional, TYPE_CHECKING

from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.agent.tools.preparation.helpers.coordinate_contract import (
    CoordinateContract,
    NormalizedCoordinates,
    build_contract_metadata,
    normalize_to_display_space,
)
from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import resolve_coordinates
from backend.src.agent.tools.preparation.helpers.image_dimensions import (
    get_image_dimensions_from_screenshot_b64,
    parse_screen_resolution,
)
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
    from backend.src.agent.tools.preparation.ocr import OcrCoordinator
    from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
    from backend.src.core.interfaces.vision import IVisionService

logger = logging.getLogger(__name__)


def _should_disable_coordinate_normalization() -> bool:
    """Disable screenshot->display coordinate scaling on Linux."""
    return platform.system().lower() == "linux"


def attach_coordinate_method_metadata(
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
) -> None:
    """
    Persist the mouse coordinate method in metadata for tool-call transparency.

    We rewrite mouse calls to manual x/y before execution, so we must keep the
    original resolution method (`manual|ocr|prediction`) separately in metadata.
    """
    if tool_call.tool_name != "mouse_control":
        return

    if not resolved_call.metadata:
        resolved_call.metadata = {}

    method = normalize_coordinate_method(
        tool_call.parameters.get("find_coordinates_by"),
        default=CoordinateFindingMethod.MANUAL.value,
    )
    resolved_call.metadata["coordinate_method"] = method


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
) -> None:
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
    attach_coordinate_method_metadata(tool_call, resolved_call)

    # 1. Ensure we have a screenshot
    screenshot_start_time = time.perf_counter()
    await screenshot_manager.ensure_screenshot(session)
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
    requires_coordinate_normalization = tool_call.parameters.get("find_coordinates_by") in (
        CoordinateFindingMethod.OCR,
        CoordinateFindingMethod.PREDICTION,
    )
    if requires_coordinate_normalization:
        contract = _build_coordinate_contract(session, screenshot_data, x, y)
        if _should_disable_coordinate_normalization():
            normalized = NormalizedCoordinates(
                x=x,
                y=y,
                status="disabled_on_linux",
            )
            logger.info(
                "[context_id=%s] Coordinate normalization disabled on Linux; using raw resolved coordinates (%s,%s)",
                short_id(context_id),
                x,
                y,
            )
        else:
            normalized = normalize_to_display_space(contract)
            if normalized.status == "scaled_to_display":
                logger.info(
                    "[context_id=%s] Scaled coordinates from screenshot %sx%s to display %sx%s: (%s,%s)->(%s,%s)",
                    short_id(context_id),
                    contract.source_image_size[0] if contract.source_image_size else "?",
                    contract.source_image_size[1] if contract.source_image_size else "?",
                    contract.target_display_size[0] if contract.target_display_size else "?",
                    contract.target_display_size[1] if contract.target_display_size else "?",
                    x,
                    y,
                    normalized.x,
                    normalized.y,
                )
            elif normalized.status not in ("source_equals_target", "already_display_space"):
                logger.warning(
                    "[context_id=%s] Coordinate normalization fallback: status=%s "
                    "(source_size=%s, target_size=%s)",
                    short_id(context_id),
                    normalized.status,
                    contract.source_image_size,
                    contract.target_display_size,
                )
        x, y = normalized.x, normalized.y
    
    # 5. Rewrite to manual mode
    _rewrite_to_manual(resolved_call, x, y)
    if not resolved_call.metadata:
        resolved_call.metadata = {}
    resolved_call.metadata["coordinate_resolution_screenshot_id"] = screenshot_id
    if requires_coordinate_normalization:
        resolved_call.metadata["coordinate_contract"] = build_contract_metadata(
            contract,
            normalized,
        )
    else:
        resolved_call.metadata["coordinate_contract"] = {
        "coordinate_space": "display_px",
        "source_coordinates": {"x": x, "y": y},
        "source_image_size": None,
        "target_display_size": None,
        "normalized_coordinates": {"x": x, "y": y},
        "normalized_space": "display_px",
        "normalization_status": "already_display_space",
        }
    logger.info(
        f"[context_id={short_id(context_id)}] Resolved coordinates for {tool_call.tool_name}: ({x}, {y}) using screenshot {screenshot_id[:8]}"
    )


def _build_coordinate_contract(
    session: "AgentSession",
    screenshot_b64: str,
    x: int,
    y: int,
) -> CoordinateContract:
    system_state = session.get_current_system_state()
    target_display_size = parse_screen_resolution(
        system_state.get("screen_resolution") if isinstance(system_state, dict) else None
    )
    source_image_size = get_image_dimensions_from_screenshot_b64(screenshot_b64)
    return CoordinateContract(
        x=x,
        y=y,
        coordinate_space="screenshot_px",
        source_image_size=source_image_size,
        target_display_size=target_display_size,
    )


def _rewrite_to_manual(resolved_call: ResolvedToolCall, x: int, y: int):
    """
    Rewrite the resolved tool call parameters to use manual coordinates.
    
    Modifies the resolved call's parameters (immutable - original ParsedToolCall unchanged).
    Removes backend-only routing fields while preserving model-generated OCR/prediction
    target text for transparency in the emitted tool-call payload.
    
    Args:
        resolved_call: The resolved tool call to modify
        x: Resolved X coordinate
        y: Resolved Y coordinate
    """
    # Set manual coordinates
    resolved_call.parameters["x"] = x
    resolved_call.parameters["y"] = y

    # Remove backend-only routing fields.
    # Keep ocr_text/description so the tool-call payload shows what the model generated.
    resolved_call.parameters.pop("find_coordinates_by", None)
    resolved_call.parameters.pop("model_name", None)
