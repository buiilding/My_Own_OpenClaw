"""
Tool Preparer.

Orchestrates tool call preparation (resolution) before execution.
Coordinates screenshot acquisition, coordinate resolution, and tool rewriting.
Transforms high-level tool intents into concrete, executable frontend instructions.
"""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable, List, Optional, Tuple

from backend.src.agent.tools.preparation.coordinate_resolution import CoordinateResolver
from backend.src.agent.tools.preparation.helpers.preparation_helper import (
    resolve_tool_with_coordinates,
)
from backend.src.agent.tools.preparation.helpers.vision_service_provider import (
    VisionServiceProvider,
)
from backend.src.agent.tools.preparation.ocr import OcrCoordinator
from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser import ParsedToolCall

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.core.interfaces.vision import IVisionService

logger = logging.getLogger(__name__)


@dataclass
class PreparationResult:
    """Result of tool preparation."""

    resolved_calls: List[ResolvedToolCall]
    errors: List[Tuple[ParsedToolCall, str]]  # (tool_call, error_message)
    bundle_id: Optional[str] = None


class ToolPreparer:
    """
    Orchestrates tool call preparation (resolution) before execution.

    Responsibility: preparation/resolution only. Does not emit frontend tool events.
    """

    def __init__(
        self,
        screenshot_manager: ScreenshotManager,
        coordinate_resolver: CoordinateResolver,
        ocr_coordinator: OcrCoordinator,
        vision_service: Optional["IVisionService"] = None,
        vision_service_provider: Optional[
            Callable[["AgentSession"], Optional["IVisionService"]]
        ] = None,
    ):
        self.screenshot_manager = screenshot_manager
        self.coordinate_resolver = coordinate_resolver
        self.ocr_coordinator = ocr_coordinator
        self.vision_service = vision_service
        self.vision_service_provider = (
            vision_service_provider or VisionServiceProvider.get_vision_service
        )

    async def prepare(
        self,
        tool_calls: List[ParsedToolCall],
        session: "AgentSession",
    ) -> PreparationResult:
        """Prepare all calls and return resolved calls + preparation errors."""
        preparation_start_time = time.perf_counter()
        logger.info("[Timing] Tool preparation started: %s tool(s)", len(tool_calls))

        if len(tool_calls) > 1:
            result = await self._prepare_bundle(tool_calls, session)
        else:
            result = await self._prepare_single(tool_calls[0], session)

        preparation_total_time = time.perf_counter() - preparation_start_time
        logger.info(
            "[Timing] Tool preparation completed: %s tool(s) in %.3fs",
            len(tool_calls),
            preparation_total_time,
        )
        return result

    async def _prepare_bundle(
        self,
        tool_calls: List[ParsedToolCall],
        session: "AgentSession",
    ) -> PreparationResult:
        bundle_id = str(uuid.uuid4())
        execution_ref = ExecutionRef.bundle(bundle_id)
        logger.info(
            "Preparing bundle: %s tools (bundle_id=%s)",
            len(tool_calls),
            short_id(bundle_id),
        )

        resolved_calls: List[ResolvedToolCall] = []
        errors: List[Tuple[ParsedToolCall, str]] = []

        for tool_call in tool_calls:
            tool_call.metadata = execution_ref.apply_to_metadata(tool_call.metadata)
            resolved_call = ResolvedToolCall.from_parsed_call(tool_call)
            resolved_call.metadata = execution_ref.apply_to_metadata(resolved_call.metadata)

            if self._needs_coordinate_resolution(tool_call):
                try:
                    await resolve_tool_with_coordinates(
                        tool_call,
                        resolved_call,
                        session,
                        self.screenshot_manager,
                        self.ocr_coordinator,
                        self.coordinate_resolver,
                        self.vision_service,
                        self.vision_service_provider,
                        bundle_id,
                    )
                except Exception as exc:
                    logger.error(
                        "[bundle_id=%s] Failed to resolve tool %s in bundle: %s",
                        short_id(bundle_id),
                        tool_call.tool_name,
                        exc,
                        exc_info=True,
                    )
                    errors.append((tool_call, str(exc)))
                    break

            resolved_calls.append(resolved_call)

        logger.info(
            "Bundle prepared: %s tools, %s errors (bundle_id=%s)",
            len(resolved_calls),
            len(errors),
            short_id(bundle_id),
        )
        return PreparationResult(
            resolved_calls=resolved_calls,
            errors=errors,
            bundle_id=bundle_id,
        )

    async def _prepare_single(
        self,
        tool_call: ParsedToolCall,
        session: "AgentSession",
    ) -> PreparationResult:
        request_id = str(uuid.uuid4())
        execution_ref = ExecutionRef.single(request_id)
        tool_preparation_start_time = time.perf_counter()

        tool_call.metadata = execution_ref.apply_to_metadata(tool_call.metadata)
        resolved_call = ResolvedToolCall.from_parsed_call(tool_call)
        resolved_call.metadata = execution_ref.apply_to_metadata(resolved_call.metadata)

        if self._needs_coordinate_resolution(tool_call):
            try:
                await resolve_tool_with_coordinates(
                    tool_call,
                    resolved_call,
                    session,
                    self.screenshot_manager,
                    self.ocr_coordinator,
                    self.coordinate_resolver,
                    self.vision_service,
                    self.vision_service_provider,
                    request_id,
                )
                tool_preparation_time = time.perf_counter() - tool_preparation_start_time
                logger.info(
                    "[Timing] Tool preparation completed in %.3fs (request_id=%s, tool=%s)",
                    tool_preparation_time,
                    short_id(request_id),
                    tool_call.tool_name,
                )
            except Exception as exc:
                logger.error(
                    "[request_id=%s] Failed to resolve coordinates for %s: %s",
                    request_id,
                    tool_call.tool_name,
                    exc,
                    exc_info=True,
                )
                return PreparationResult(
                    resolved_calls=[],
                    errors=[(tool_call, str(exc))],
                )

        self._register_resolved_call(session, request_id, resolved_call)
        return PreparationResult(
            resolved_calls=[resolved_call],
            errors=[],
        )

    @staticmethod
    def _register_resolved_call(
        session: "AgentSession",
        request_id: str,
        resolved_call: ResolvedToolCall,
    ) -> None:
        """Register resolved call in session runtime storage."""
        session.register_resolved_tool_call(request_id, resolved_call)

    def _needs_coordinate_resolution(self, tool_call: ParsedToolCall) -> bool:
        """Check if the tool call requires coordinate resolution."""
        if tool_call.tool_name != "mouse_control":
            return False

        method = tool_call.parameters.get("find_coordinates_by")
        return method in (
            CoordinateFindingMethod.OCR,
            CoordinateFindingMethod.PREDICTION,
        )
