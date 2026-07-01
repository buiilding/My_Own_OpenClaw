"""
Tool resolution helper for coordinate resolution workflow.

Public facade for grounded computer-use preparation. Source grounding and
mouse drag-destination handling live in focused helper modules.
"""

from __future__ import annotations

from typing import Optional

from backend.src.agent.tools.preparation.helpers.grounded_source_preparation import (
    attach_source_coordinate_method_metadata,
    ensure_coordinate_resolution_screenshot,
    resolve_grounded_source_coordinates,
    tool_call_has_manual_coordinates,
    tool_call_needs_source_coordinate_resolution,
)
from backend.src.agent.tools.preparation.helpers.mouse_drag_destination_preparation import (
    attach_drag_destination_coordinate_method_metadata,
    resolve_mouse_drag_destination_coordinates,
    tool_call_needs_drag_destination_resolution,
)


def tool_call_needs_coordinate_resolution(tool_call: ParsedToolCall) -> bool:
    """Return whether a tool call should run OCR/prediction coordinate resolution."""
    return tool_call_needs_source_coordinate_resolution(
        tool_call
    ) or tool_call_needs_drag_destination_resolution(tool_call)


def attach_coordinate_method_metadata(
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
) -> None:
    """Persist source/destination grounding methods for tool transparency."""
    attach_source_coordinate_method_metadata(tool_call, resolved_call)
    attach_drag_destination_coordinate_method_metadata(tool_call, resolved_call)


async def resolve_tool_with_coordinates(
    tool_call: ParsedToolCall,
    resolved_call: ResolvedToolCall,
    session: AgentSession,
    screenshot_manager: ScreenshotManager,
    ocr_coordinator: OcrCoordinator,
    coordinate_resolver: CoordinateResolver,
    vision_service: Optional[IVisionProvider],
    vision_service_provider,
    context_id: str,
) -> None:
    """
    Resolve a grounded tool call against the current screenshot frame.

    Raises:
        ValueError: If screenshot/capture metadata is unavailable
        Exception: If coordinate resolution fails
    """
    attach_coordinate_method_metadata(tool_call, resolved_call)

    screenshot_data, screenshot_id = await ensure_coordinate_resolution_screenshot(
        session=session,
        screenshot_manager=screenshot_manager,
        context_id=context_id,
    )

    if tool_call_needs_source_coordinate_resolution(tool_call):
        await resolve_grounded_source_coordinates(
            tool_call=tool_call,
            resolved_call=resolved_call,
            session=session,
            screenshot_b64=screenshot_data,
            screenshot_id=screenshot_id,
            ocr_coordinator=ocr_coordinator,
            coordinate_resolver=coordinate_resolver,
            vision_service=vision_service,
            vision_service_provider=vision_service_provider,
            context_id=context_id,
        )
    await resolve_mouse_drag_destination_coordinates(
        tool_call=tool_call,
        resolved_call=resolved_call,
        session=session,
        screenshot_b64=screenshot_data,
        screenshot_id=screenshot_id,
        ocr_coordinator=ocr_coordinator,
        coordinate_resolver=coordinate_resolver,
        vision_service=vision_service,
        vision_service_provider=vision_service_provider,
        context_id=context_id,
    )


def normalize_manual_coordinates(
    *,
    resolved_call: ResolvedToolCall,
    session: AgentSession,
    context_id: str,
) -> None:
    """
    Preserve manual coordinates as local-runtime executable coordinates.

    Kept as a compatibility shim for older callers; active preparation no longer
    binds manual coordinates to a screenshot frame.
    """
    _ = resolved_call, session, context_id
    return None
