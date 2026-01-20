"""
Tool Preparer Service.

Orchestrates tool call preparation before execution.
Coordinates screenshot acquisition, coordinate resolution, and tool rewriting.
"""
import logging
import time
import uuid
from typing import Callable, List, AsyncGenerator, Optional, TYPE_CHECKING


def _short_id(request_id: str, length: int = 15) -> str:
    """Truncate request_id to specified length for logging."""
    return request_id[:length] if request_id else "unknown"

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession
    from backend.src.core.interfaces.vision import IVisionService

from backend.src.agent.tools.prepared_tool_call import PreparedToolCall
from backend.src.agent.tools.resolvers.coordinate_resolvers import CoordinateResolver
from backend.src.agent.tools.ocr_coordinator import OcrCoordinator
from backend.src.agent.tools.screenshot_manager import ScreenshotManager
from backend.src.agent.tools.synthetic_result_factory import SyntheticResultFactory
from backend.src.agent.tools.vision_service_provider import VisionServiceProvider
from backend.src.core.events import (
    AgentStreamingEvent,
    BundleEndEvent,
    BundleStartEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.types import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


class ToolPreparer:
    """
    Orchestrates tool call preparation before execution.
    
    Responsibility: Coordination only.
    Delegates screenshot acquisition, coordinate resolution, and error handling
    to specialized components.
    """

    def __init__(
        self,
        screenshot_manager: ScreenshotManager,
        coordinate_resolver: CoordinateResolver,
        ocr_coordinator: OcrCoordinator,
        synthetic_result_factory: SyntheticResultFactory,
        vision_service: Optional["IVisionService"] = None,
        vision_service_provider: Optional[Callable[["AgentSession"], Optional["IVisionService"]]] = None,
    ):
        """
        Initialize the tool preparer.
        
        Args:
            screenshot_manager: Manager for screenshot acquisition
            coordinate_resolver: Resolver for coordinate resolution
            ocr_coordinator: Coordinator for OCR result acquisition
            synthetic_result_factory: Factory for synthetic error results
            vision_service: Optional vision service instance (injected directly to avoid circular dependency)
            vision_service_provider: Optional callable to get vision service from session (fallback).
                                    Defaults to VisionServiceProvider.get_vision_service.
        """
        self.screenshot_manager = screenshot_manager
        self.coordinate_resolver = coordinate_resolver
        self.ocr_coordinator = ocr_coordinator
        self.synthetic_result_factory = synthetic_result_factory
        self.vision_service = vision_service  # Injected directly (preferred)
        self.vision_service_provider = vision_service_provider or VisionServiceProvider.get_vision_service

    async def prepare_tools(
        self,
        tool_calls: List[ParsedToolCall],
        session: "AgentSession",
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Prepare tool calls and yield ToolCallEvents (and potentially RequestScreenshotEvents).
        
        If multiple tool calls are present, wraps them in bundle_start/bundle_end events.
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: BundleStartEvent, RequestScreenshotEvent, ToolCallEvent, BundleEndEvent, ToolOutputEvent
        """
        preparation_start_time = time.perf_counter()
        logger.info(f"[Timing] Tool preparation started: {len(tool_calls)} tool(s)")
        
        # Bundle management
        is_bundle = len(tool_calls) > 1
        bundle_id = None
        if is_bundle:
            # Generate bundle ID for tracking
            bundle_id = str(uuid.uuid4())
            yield BundleStartEvent()
            logger.info(f"Bundle start: {len(tool_calls)} tools (bundle_id={_short_id(bundle_id)})")

        for tool_call in tool_calls:
            tool_prep_start_time = time.perf_counter()
            # Generate request_id for each tool call
            request_id = str(uuid.uuid4())
            if not hasattr(tool_call, "metadata"):
                tool_call.metadata = {}
            tool_call.metadata["request_id"] = request_id
            # Store bundle_id in metadata for later matching
            if is_bundle:
                tool_call.metadata["bundle_id"] = bundle_id

            # Create prepared tool call (immutable copy to avoid mutation)
            prepared_call = PreparedToolCall.from_parsed_call(tool_call)
            prepared_call.metadata["request_id"] = request_id
            if is_bundle:
                prepared_call.metadata["bundle_id"] = bundle_id

            # Check if this tool needs coordinate resolution
            if self._needs_coordinate_resolution(tool_call):
                try:
                    # 1. Ensure we have a screenshot (yields RequestScreenshotEvent if needed)
                    # Note: ScreenshotManager.get_screenshot is an async generator that may yield
                    # RequestScreenshotEvent. We forward all events to maintain real-time updates.
                    screenshot_start_time = time.perf_counter()
                    async for event in self.screenshot_manager.get_screenshot(session):
                        yield event
                    screenshot_time = time.perf_counter() - screenshot_start_time
                    if screenshot_time > 0.001:  # Only log if significant
                        logger.info(f"[Timing] Screenshot acquisition took {screenshot_time:.3f}s (request_id={_short_id(request_id)})")
                    
                    # After screenshot manager completes, check if we have screenshot
                    screenshot_data = session.get_screenshot()
                    screenshot_id = session.get_current_screenshot_id()
                    if not screenshot_data or not screenshot_id:
                        raise ValueError("No screenshot data available for coordinate resolution")

                    # 2. Get OCR results if needed (for OCR method)
                    # SIMPLIFIED: Only current screenshot OCR results are available
                    ocr_results = None
                    if tool_call.parameters.get("find_coordinates_by") == CoordinateFindingMethod.OCR:
                        ocr_start_time = time.perf_counter()
                        ocr_results = await self.ocr_coordinator.get_ocr_results(
                            session, screenshot_data, screenshot_id
                        )
                        ocr_time = time.perf_counter() - ocr_start_time
                        logger.info(f"[Timing] OCR results retrieval took {ocr_time:.3f}s (request_id={_short_id(request_id)}, found {len(ocr_results) if ocr_results else 0} results)")
                        logger.debug(
                            f"[request_id={_short_id(request_id)}] Retrieved {len(ocr_results)} OCR results"
                        )

                    # 3. Get vision service if needed (for Vision method)
                    # Use injected service if available, otherwise fall back to provider
                    vision_service = None
                    if tool_call.parameters.get("find_coordinates_by") == CoordinateFindingMethod.PREDICTION:
                        vision_service = self.vision_service  # Use injected service (preferred)
                        if not vision_service:
                            # Fallback to provider (for backward compatibility)
                            vision_service = self.vision_service_provider(session)
                        if not vision_service:
                            logger.warning(
                                f"[request_id={request_id}] Vision service unavailable for coordinate resolution"
                            )

                    # 4. Resolve coordinates (pure function)
                    coord_resolve_start_time = time.perf_counter()
                    x, y = await self.coordinate_resolver.resolve(
                        tool_call, screenshot_data, ocr_results, vision_service
                    )
                    coord_resolve_time = time.perf_counter() - coord_resolve_start_time
                    logger.info(f"[Timing] Coordinate resolution took {coord_resolve_time:.3f}s (request_id={_short_id(request_id)}, method={tool_call.parameters.get('find_coordinates_by')})")

                    # 5. Rewrite prepared tool call to manual mode (immutable - no mutation of original)
                    self._rewrite_to_manual(prepared_call, x, y)
                    # STALE SCREEN EXECUTION FIX: Store screenshot_id used for coordinate resolution
                    # This allows verification before execution to prevent clicks on wrong UI elements
                    if not prepared_call.metadata:
                        prepared_call.metadata = {}
                    prepared_call.metadata["coordinate_resolution_screenshot_id"] = screenshot_id
                    logger.info(
                        f"[request_id={_short_id(request_id)}] Resolved coordinates for {tool_call.tool_name}: ({x}, {y}) using screenshot {screenshot_id[:8]}"
                    )
                    
                    tool_prep_time = time.perf_counter() - tool_prep_start_time
                    logger.info(f"[Timing] Tool preparation completed in {tool_prep_time:.3f}s (request_id={_short_id(request_id)}, tool={tool_call.tool_name})")

                except Exception as e:
                    logger.error(
                        f"[request_id={request_id}] Failed to resolve coordinates for {tool_call.tool_name}: {e}",
                        exc_info=True,
                    )
                    # Create synthetic tool result for error handling
                    error_msg = str(e)
                    synthetic_result = self.synthetic_result_factory.create(tool_call, error_msg)

                    # Store in pending results so orchestrator can find it immediately
                    # Note: Synthetic results are stored here so ToolOrchestrator can find them
                    # when processing tool_calls from parsed_response.
                    # ENCAPSULATION: Use public method instead of accessing private member
                    session.register_pending_tool_result(request_id, synthetic_result)

                    # PROTOCOL VIOLATION FIX: Yield ToolCallEvent before ToolOutputEvent
                    # Frontend expects a tool call event before any output event to maintain
                    # the request/response state machine. Without this, frontend receives
                    # an output for a tool it never saw, causing JavaScript errors.
                    # Note: ToolCallEvent doesn't support metadata field, so we just yield
                    # the event with the original parameters (coordinate resolution failed).
                    yield ToolCallEvent(
                        tool_name=tool_call.tool_name,
                        parameters=tool_call.parameters,  # Use original parameters (coordinate resolution failed)
                        raw_call=tool_call.raw_call,
                        request_id=request_id,
                    )

                    # Yield ToolOutputEvent for backend-side failure
                    # This is the ONLY case where backend emits ToolOutputEvent:
                    # - Tool never reached frontend (coordinate resolution failed)
                    # - Frontend doesn't know about the failure
                    # - Backend must notify frontend of the error
                    # For normal tool execution, frontend displays results immediately.
                    yield ToolOutputEvent(
                        tool_name=tool_call.tool_name,
                        success=False,
                        output=error_msg,
                        error=error_msg,
                        execution_time=0.0,
                        metadata={"coordinate_resolution_failed": True, "request_id": request_id},
                    )

                    # Skip further processing - tool failed during preparation
                    # The orchestrator will still process this tool call from parsed_response.tool_calls
                    # and find the synthetic result in _pending_tool_results for history storage.
                    continue

            # Store prepared tool call in session for ToolOrchestrator to use
            # ENCAPSULATION: Use public method instead of accessing private member
            session.register_prepared_tool_call(request_id, prepared_call)
            
            # Yield the prepared tool call event (uses prepared parameters, not mutated original)
            yield ToolCallEvent(
                tool_name=prepared_call.tool_name,
                parameters=prepared_call.parameters,
                raw_call=prepared_call.raw_call,
                request_id=request_id,
            )

        # Bundle management
        if len(tool_calls) > 1:
            yield BundleEndEvent()
            logger.info(f"Bundle end: {len(tool_calls)} tools")
        
        preparation_total_time = time.perf_counter() - preparation_start_time
        logger.info(f"[Timing] Tool preparation completed: {len(tool_calls)} tool(s) in {preparation_total_time:.3f}s")

    def _needs_coordinate_resolution(self, tool_call: ParsedToolCall) -> bool:
        """Check if the tool call requires coordinate resolution."""
        if tool_call.tool_name != "mouse_control":
            return False

        method = tool_call.parameters.get("find_coordinates_by")
        return method in [CoordinateFindingMethod.OCR, CoordinateFindingMethod.PREDICTION]

    def _rewrite_to_manual(self, prepared_call: PreparedToolCall, x: int, y: int):
        """
        Rewrite the prepared tool call parameters to use manual coordinates.
        
        Modifies the prepared call's parameters (immutable - original ParsedToolCall unchanged).
        Removes backend-only fields (find_coordinates_by, ocr_text, description) since
        the frontend MouseControlArgs schema only accepts x, y coordinates.
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
