"""
Tool Preparer.

Orchestrates tool call preparation (resolution) before execution.
Coordinates screenshot acquisition, coordinate resolution, and tool rewriting.
Transforms high-level tool intents into concrete, executable frontend instructions.
"""
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Callable, List, AsyncGenerator, Optional, Tuple, TYPE_CHECKING

from backend.src.agent.tools.preparation.helpers.preparation_helper import resolve_tool_with_coordinates
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
from backend.src.agent.tools.preparation.ocr import OcrCoordinator
from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
from backend.src.agent.tools.preparation.helpers.vision_service_provider import VisionServiceProvider
from backend.src.agent.tools.shared.logging_utils import short_id

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.core.interfaces.vision import IVisionService

from backend.src.core.events.streaming_events import AgentStreamingEvent, RequestScreenshotEvent
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


@dataclass
class PreparationResult:
    """Result of tool preparation."""
    resolved_calls: List[ResolvedToolCall]
    errors: List[Tuple[ParsedToolCall, str]]  # (tool_call, error_message)
    bundle_id: Optional[str] = None  # If this is a bundle


class ToolPreparer:
    """
    Orchestrates tool call preparation (resolution) before execution.
    
    Transforms high-level, declarative tool intents (e.g., "click on 'Submit'")
    into concrete, executable frontend instructions (e.g., "click at x=732, y=409").
    
    Responsibility: Preparation/resolution only.
    Delegates screenshot acquisition, coordinate resolution to specialized components.
    Yields infrastructure events (RequestScreenshotEvent) but does NOT yield frontend events.
    """

    def __init__(
        self,
        screenshot_manager: ScreenshotManager,
        coordinate_resolver: CoordinateResolver,
        ocr_coordinator: OcrCoordinator,
        vision_service: Optional["IVisionService"] = None,
        vision_service_provider: Optional[Callable[["AgentSession"], Optional["IVisionService"]]] = None,
    ):
        """
        Initialize the tool preparer.
        
        Args:
            screenshot_manager: Manager for screenshot acquisition
            coordinate_resolver: Resolver for coordinate resolution
            ocr_coordinator: Coordinator for OCR result acquisition
            vision_service: Optional vision service instance (injected directly to avoid circular dependency)
            vision_service_provider: Optional callable to get vision service from session (fallback).
                                    Defaults to VisionServiceProvider.get_vision_service.
        """
        self.screenshot_manager = screenshot_manager
        self.coordinate_resolver = coordinate_resolver
        self.ocr_coordinator = ocr_coordinator
        self.vision_service = vision_service  # Injected directly (preferred)
        self.vision_service_provider = vision_service_provider or VisionServiceProvider.get_vision_service

    async def prepare_tools(
        self,
        tool_calls: List[ParsedToolCall],
        session: "AgentSession",
    ) -> AsyncGenerator[Tuple[Optional[AgentStreamingEvent], Optional[PreparationResult]], None]:
        """
        Prepare tool calls: resolve coordinates, rewrite parameters.
        
        Yields infrastructure events (RequestScreenshotEvent) during preparation.
        Returns PreparationResult with resolved calls and any errors.
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            Tuple of (infrastructure_event, None) during preparation
            Tuple of (None, PreparationResult) when preparation completes
        """
        preparation_start_time = time.perf_counter()
        logger.info(f"[Timing] Tool preparation started: {len(tool_calls)} tool(s)")
        
        # Bundle vs single tool handling
        is_bundle = len(tool_calls) > 1
        
        if is_bundle:
            # ATOMIC BUNDLE: Prepare all tools first
            bundle_id = str(uuid.uuid4())
            logger.info(f"Preparing bundle: {len(tool_calls)} tools (bundle_id={short_id(bundle_id)})")
            
            resolved_calls = []
            errors = []
            
            for tool_call in tool_calls:
                # For bundles, we don't generate individual request_ids
                # The bundle_id is the single identifier for the entire bundle
                if not hasattr(tool_call, "metadata") or tool_call.metadata is None:
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
                        # This yields RequestScreenshotEvent if needed
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
                            yield (event, None)
                        
                    except Exception as e:
                        # FAIL-FAST: If any tool in bundle fails during resolution, fail the entire bundle
                        logger.error(f"[bundle_id={short_id(bundle_id)}] Failed to resolve tool {tool_call.tool_name} in bundle: {e}", exc_info=True)
                        errors.append((tool_call, str(e)))
                        break  # Stop resolving remaining tools (fail-fast)
                
                # Store resolved call (for bundles, we don't store individually in session)
                resolved_calls.append(resolved_call)
            
            # Return preparation result
            result = PreparationResult(
                resolved_calls=resolved_calls,
                errors=errors,
                bundle_id=bundle_id,
            )
            yield (None, result)
            logger.info(f"Bundle prepared: {len(resolved_calls)} tools, {len(errors)} errors (bundle_id={short_id(bundle_id)})")
        
        else:
            # SINGLE TOOL: Prepare single tool
            tool_call = tool_calls[0]
            tool_preparation_start_time = time.perf_counter()
            # Generate request_id for single tool
            request_id = str(uuid.uuid4())
            if not hasattr(tool_call, "metadata") or tool_call.metadata is None:
                tool_call.metadata = {}
            tool_call.metadata["request_id"] = request_id

            # Create resolved tool call (immutable copy to avoid mutation)
            resolved_call = ResolvedToolCall.from_parsed_call(tool_call)
            if resolved_call.metadata is None:
                resolved_call.metadata = {}
            resolved_call.metadata["request_id"] = request_id

            # Check if this tool needs coordinate resolution
            if self._needs_coordinate_resolution(tool_call):
                try:
                    # Resolve tool with coordinate resolution using shared helper
                    # This yields RequestScreenshotEvent if needed
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
                        yield (event, None)
                    
                    tool_preparation_time = time.perf_counter() - tool_preparation_start_time
                    logger.info(f"[Timing] Tool preparation completed in {tool_preparation_time:.3f}s (request_id={short_id(request_id)}, tool={tool_call.tool_name})")

                except Exception as e:
                    logger.error(
                        f"[request_id={request_id}] Failed to resolve coordinates for {tool_call.tool_name}: {e}",
                        exc_info=True,
                    )
                    # Return error (sender will handle synthetic result creation)
                    result = PreparationResult(
                        resolved_calls=[],
                        errors=[(tool_call, str(e))],
                    )
                    yield (None, result)
                    return
                
                # Coordinate resolution succeeded - store resolved tool call
                session.register_resolved_tool_call(request_id, resolved_call)
            else:
                # Tool doesn't need coordinate resolution - store resolved tool call
                session.register_resolved_tool_call(request_id, resolved_call)
            
            # Return preparation result
            result = PreparationResult(
                resolved_calls=[resolved_call],
                errors=[],
            )
            yield (None, result)
        
        preparation_total_time = time.perf_counter() - preparation_start_time
        logger.info(f"[Timing] Tool preparation completed: {len(tool_calls)} tool(s) in {preparation_total_time:.3f}s")

    def _needs_coordinate_resolution(self, tool_call: ParsedToolCall) -> bool:
        """Check if the tool call requires coordinate resolution."""
        if tool_call.tool_name != "mouse_control":
            return False

        method = tool_call.parameters.get("find_coordinates_by")
        return method in [CoordinateFindingMethod.OCR, CoordinateFindingMethod.PREDICTION]
