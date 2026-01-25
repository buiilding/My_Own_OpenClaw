"""
Tool Resolver Service.

Orchestrates tool call resolution before execution.
Coordinates screenshot acquisition, coordinate resolution, and tool rewriting.
Transforms high-level tool intents into concrete, executable frontend instructions.
"""
import logging
import time
import uuid
from typing import Callable, List, AsyncGenerator, Optional, TYPE_CHECKING

from backend.src.agent.tools.preparation.helpers.preparation_helper import resolve_tool_with_coordinates
from backend.src.agent.tools.preparation.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
from backend.src.agent.tools.preparation.ocr import OcrCoordinator
from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
from backend.src.agent.tools.preparation.helpers.vision_service_provider import VisionServiceProvider
from backend.src.agent.tools.processing.synthetic_factory import SyntheticResultFactory
from backend.src.agent.tools.shared.logging_utils import short_id

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.core.interfaces.vision import IVisionService

from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ToolBundleEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


class ToolResolver:
    """
    Orchestrates tool call resolution before execution.
    
    Transforms high-level, declarative tool intents (e.g., "click on 'Submit'")
    into concrete, executable frontend instructions (e.g., "click at x=732, y=409").
    
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
        Initialize the tool resolver.
        
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

    async def resolve_tools(
        self,
        tool_calls: List[ParsedToolCall],
        session: "AgentSession",
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Resolve tool calls and yield ToolCallEvents or ToolBundleEvent.
        
        Transforms high-level tool intents into concrete executable instructions.
        If multiple tool calls are present, resolves all tools and yields single ToolBundleEvent.
        If single tool call, yields ToolCallEvent (existing behavior).
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: RequestScreenshotEvent, ToolCallEvent, ToolBundleEvent, ToolOutputEvent
        """
        resolution_start_time = time.perf_counter()
        logger.info(f"[Timing] Tool resolution started: {len(tool_calls)} tool(s)")
        
        # Bundle vs single tool handling
        is_bundle = len(tool_calls) > 1
        
        if is_bundle:
            # ATOMIC BUNDLE: Prepare all tools first, then yield single ToolBundleEvent
            bundle_id = str(uuid.uuid4())
            logger.info(f"Preparing bundle: {len(tool_calls)} tools (bundle_id={short_id(bundle_id)})")
            
            resolved_tools = []
            bundle_failed = False
            bundle_error = None
            
            for tool_call in tool_calls:
                # For bundles, we don't generate individual request_ids
                # The bundle_id is the single identifier for the entire bundle
                if not hasattr(tool_call, "metadata"):
                    tool_call.metadata = {}
                tool_call.metadata["bundle_id"] = bundle_id
                
                # Create resolved tool call (immutable copy)
                resolved_call = ResolvedToolCall.from_parsed_call(tool_call)
                if not resolved_call.metadata:
                    resolved_call.metadata = {}
                resolved_call.metadata["bundle_id"] = bundle_id
                
                # Check if this tool needs coordinate resolution
                if self._needs_coordinate_resolution(tool_call):
                    try:
                        # Resolve tool with coordinate resolution using shared helper
                        async for event in resolve_tool_with_coordinates(
                            tool_call,
                            resolved_call,
                            session,
                            self.screenshot_manager,
                            self.ocr_coordinator,
                            self.coordinate_resolver,
                            self.vision_service,
                            self.vision_service_provider,
                            bundle_id,
                        ):
                            yield event
                        
                    except Exception as e:
                        # FAIL-FAST: If any tool in bundle fails during resolution, fail the entire bundle
                        logger.error(f"[bundle_id={short_id(bundle_id)}] Failed to resolve tool {tool_call.tool_name} in bundle: {e}", exc_info=True)
                        bundle_failed = True
                        bundle_error = f"Tool {tool_call.tool_name} failed during resolution: {str(e)}"
                        break  # Stop resolving remaining tools
                
                # Add to resolved tools list (no individual storage needed for bundles)
                resolved_tools.append({
                    "name": resolved_call.tool_name,
                    "args": resolved_call.parameters,
                })
            
            # Yield single ToolBundleEvent with all resolved tools
            if bundle_failed:
                # Bundle failed during resolution - yield error event
                logger.error(f"[bundle_id={short_id(bundle_id)}] Bundle resolution failed: {bundle_error}")
                # For now, we'll still yield the bundle event but mark it as failed
                # The frontend will handle the error
                yield ToolBundleEvent(
                    bundle_id=bundle_id,
                    tools=resolved_tools  # Partial tools resolved before failure
                )
            else:
                yield ToolBundleEvent(
                    bundle_id=bundle_id,
                    tools=resolved_tools
                )
                logger.info(f"Bundle resolved: {len(resolved_tools)} tools (bundle_id={short_id(bundle_id)})")
        
        else:
            # SINGLE TOOL: Keep existing behavior
            tool_call = tool_calls[0]
            tool_resolution_start_time = time.perf_counter()
            # Generate request_id for single tool
            request_id = str(uuid.uuid4())
            if not hasattr(tool_call, "metadata"):
                tool_call.metadata = {}
            tool_call.metadata["request_id"] = request_id

            # Create resolved tool call (immutable copy to avoid mutation)
            resolved_call = ResolvedToolCall.from_parsed_call(tool_call)
            resolved_call.metadata["request_id"] = request_id

            # Check if this tool needs coordinate resolution
            if self._needs_coordinate_resolution(tool_call):
                try:
                    # Resolve tool with coordinate resolution using shared helper
                    async for event in resolve_tool_with_coordinates(
                        tool_call,
                        resolved_call,
                        session,
                        self.screenshot_manager,
                        self.ocr_coordinator,
                        self.coordinate_resolver,
                        self.vision_service,
                        self.vision_service_provider,
                        request_id,
                    ):
                        yield event
                    
                    tool_resolution_time = time.perf_counter() - tool_resolution_start_time
                    logger.info(f"[Timing] Tool resolution completed in {tool_resolution_time:.3f}s (request_id={short_id(request_id)}, tool={tool_call.tool_name})")

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

                    # Skip further processing - tool failed during resolution
                    # The orchestrator will still process this tool call from parsed_response.tool_calls
                    # and find the synthetic result in _pending_tool_results for history storage.
                    # Don't yield ToolCallEvent here since we already yielded it above with the error
                else:
                    # Coordinate resolution succeeded - continue with normal processing
                    # Store resolved tool call in session for ToolOrchestrator to use
                    # ENCAPSULATION: Use public method instead of accessing private member
                    session.register_resolved_tool_call(request_id, resolved_call)
                    
                    # Yield the resolved tool call event (uses resolved parameters, not mutated original)
                    yield ToolCallEvent(
                        tool_name=resolved_call.tool_name,
                        parameters=resolved_call.parameters,
                        raw_call=resolved_call.raw_call,
                        request_id=request_id,
                    )
            else:
                # Tool doesn't need coordinate resolution - proceed directly
                # Store resolved tool call in session for ToolOrchestrator to use
                session.register_resolved_tool_call(request_id, resolved_call)
                
                # Yield the resolved tool call event
                yield ToolCallEvent(
                    tool_name=resolved_call.tool_name,
                    parameters=resolved_call.parameters,
                    raw_call=resolved_call.raw_call,
                    request_id=request_id,
                )
        
        resolution_total_time = time.perf_counter() - resolution_start_time
        logger.info(f"[Timing] Tool resolution completed: {len(tool_calls)} tool(s) in {resolution_total_time:.3f}s")

    def _needs_coordinate_resolution(self, tool_call: ParsedToolCall) -> bool:
        """Check if the tool call requires coordinate resolution."""
        if tool_call.tool_name != "mouse_control":
            return False

        method = tool_call.parameters.get("find_coordinates_by")
        return method in [CoordinateFindingMethod.OCR, CoordinateFindingMethod.PREDICTION]
