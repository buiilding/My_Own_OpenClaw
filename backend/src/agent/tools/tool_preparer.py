"""
Tool Preparer Service.

Orchestrates tool call preparation before execution.
Coordinates screenshot acquisition, coordinate resolution, and tool rewriting.
"""
import logging
import uuid
from typing import Callable, List, AsyncGenerator, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession
    from backend.src.core.interfaces.vision import IVisionService

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
        vision_service_provider: Optional[Callable[["AgentSession"], Optional["IVisionService"]]] = None,
    ):
        """
        Initialize the tool preparer.
        
        Args:
            screenshot_manager: Manager for screenshot acquisition
            coordinate_resolver: Resolver for coordinate resolution
            ocr_coordinator: Coordinator for OCR result acquisition
            synthetic_result_factory: Factory for synthetic error results
            vision_service_provider: Callable to get vision service from session.
                                    Defaults to VisionServiceProvider.get_vision_service.
        """
        self.screenshot_manager = screenshot_manager
        self.coordinate_resolver = coordinate_resolver
        self.ocr_coordinator = ocr_coordinator
        self.synthetic_result_factory = synthetic_result_factory
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
        # Bundle management
        if len(tool_calls) > 1:
            yield BundleStartEvent()
            logger.info(f"Bundle start: {len(tool_calls)} tools")

        for tool_call in tool_calls:
            # Generate request_id for each tool call
            request_id = str(uuid.uuid4())
            if not hasattr(tool_call, "metadata"):
                tool_call.metadata = {}
            tool_call.metadata["request_id"] = request_id

            # Check if this tool needs coordinate resolution
            if self._needs_coordinate_resolution(tool_call):
                try:
                    # 1. Ensure we have a screenshot (yields RequestScreenshotEvent if needed)
                    # Note: ScreenshotManager.get_screenshot is an async generator that may yield
                    # RequestScreenshotEvent. We forward all events to maintain real-time updates.
                    async for event in self.screenshot_manager.get_screenshot(session):
                        yield event
                    
                    # After screenshot manager completes, check if we have screenshot
                    screenshot_data = session.latest_screenshot
                    if not screenshot_data:
                        raise ValueError("No screenshot data available for coordinate resolution")

                    # 2. Get OCR results if needed (for OCR method)
                    ocr_results = None
                    if tool_call.parameters.get("find_coordinates_by") == CoordinateFindingMethod.OCR:
                        ocr_results = await self.ocr_coordinator.get_ocr_results(
                            session, screenshot_data
                        )
                        logger.debug(
                            f"[request_id={request_id}] Retrieved {len(ocr_results)} OCR results"
                        )

                    # 3. Get vision service if needed (for Vision method)
                    # Use provider to decouple from session hierarchy
                    vision_service = None
                    if tool_call.parameters.get("find_coordinates_by") == CoordinateFindingMethod.PREDICTION:
                        vision_service = self.vision_service_provider(session)
                        if not vision_service:
                            logger.warning(
                                f"[request_id={request_id}] Vision service unavailable for coordinate resolution"
                            )

                    # 4. Resolve coordinates (pure function)
                    x, y = await self.coordinate_resolver.resolve(
                        tool_call, screenshot_data, ocr_results, vision_service
                    )

                    # 5. Rewrite tool call to manual mode
                    self._rewrite_to_manual(tool_call, x, y)
                    logger.info(
                        f"[request_id={request_id}] Resolved coordinates for {tool_call.tool_name}: ({x}, {y})"
                    )

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
                    if not hasattr(session, "_pending_tool_results"):
                        session._pending_tool_results = {}
                    session._pending_tool_results[request_id] = synthetic_result

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

                    # Skip yielding ToolCallEvent - don't send invalid tool to frontend
                    # The orchestrator will still process this tool call from parsed_response.tool_calls
                    # and find the synthetic result in _pending_tool_results for history storage.
                    continue

            # Yield the (possibly modified) event
            yield ToolCallEvent(
                tool_name=tool_call.tool_name,
                parameters=tool_call.parameters,
                raw_call=tool_call.raw_call,
                request_id=request_id,
            )

        # Bundle management
        if len(tool_calls) > 1:
            yield BundleEndEvent()
            logger.info(f"Bundle end: {len(tool_calls)} tools")

    def _needs_coordinate_resolution(self, tool_call: ParsedToolCall) -> bool:
        """Check if the tool call requires coordinate resolution."""
        if tool_call.tool_name != "mouse_control":
            return False

        method = tool_call.parameters.get("find_coordinates_by")
        return method in [CoordinateFindingMethod.OCR, CoordinateFindingMethod.PREDICTION]

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
