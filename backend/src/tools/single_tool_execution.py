"""
Single tool execution helpers for tool orchestration.

Pure helper functions for executing individual tools.
No side effects beyond result creation.
"""
import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser_types import ParsedToolCall
from backend.src.tools.execution_timeout import resolve_single_tool_wait_timeout_seconds
from backend.src.tools.result_helpers import create_tool_result_object
from backend.src.tools.result_types import ToolExecutionResult

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


def _resolved_call_to_parsed_call(
    resolved_call: Any,
    original_call: ParsedToolCall,
) -> ParsedToolCall:
    """
    Convert a stored ResolvedToolCall into ParsedToolCall.

    Resolved-call storage has one contract: the ResolvedToolCall shape.
    Invalid storage entries fail before waiting for local-runtime execution.
    """
    original_resolved_call = getattr(resolved_call, "original_call", None)
    if not isinstance(original_resolved_call, ParsedToolCall):
        raise TypeError("resolved tool-call storage returned an invalid object")
    if not isinstance(resolved_call.tool_name, str) or not resolved_call.tool_name.strip():
        raise TypeError("resolved tool-call storage returned an invalid tool name")
    if not isinstance(resolved_call.parameters, dict):
        raise TypeError("resolved tool-call storage returned invalid parameters")
    if resolved_call.metadata is not None and not isinstance(resolved_call.metadata, dict):
        raise TypeError("resolved tool-call storage returned invalid metadata")

    metadata = dict(resolved_call.metadata) if resolved_call.metadata is not None else None

    return ParsedToolCall(
        tool_name=resolved_call.tool_name.strip(),
        parameters=dict(resolved_call.parameters),
        raw_call=original_call.raw_call,
        confidence=original_call.confidence,
        metadata=metadata,
    )


async def execute_single_tool(
    tool_call: ParsedToolCall,
    session_ref: "AgentSession",
) -> ToolExecutionResult:
    """
    Execute a single tool and wait for its result.
    
    Args:
        tool_call: The tool call to execute
        session_ref: Agent session reference
        
    Returns:
        SimpleNamespace with tool_call, result, success, execution_time, and context fields
    """
    request_id = tool_call.metadata.get('request_id') if (hasattr(tool_call, 'metadata') and tool_call.metadata is not None) else None
    if not request_id:
        error = (
            f"Tool call {tool_call.tool_name} is missing request_id metadata; "
            "cannot wait for local-runtime execution."
        )
        logger.error(error)
        invalid_result = ToolResult(
            success=False,
            error=error,
            output=f"Error: {error}",
            data={"status": "missing_request_id"},
        )
        return create_tool_result_object(tool_call, invalid_result, execution_time=0)
    
    request_id_short = short_id(request_id)

    # Use prepared tool call if available (avoids using mutated original)
    # Resolved tool calls have resolved coordinates and are immutable
    # ENCAPSULATION: Use public method instead of accessing private member
    resolved_call = None
    if session_ref:
        resolved_call = session_ref.get_resolved_tool_call(request_id)
    
    if resolved_call and not isinstance(getattr(resolved_call, "original_call", None), ParsedToolCall):
        error = "resolved tool-call storage returned an invalid object"
        logger.error("[request_id=%s] %s", request_id_short, error)
        invalid_resolved_result = ToolResult(
            success=False,
            error=error,
            output=f"Error: {error}",
            data={"status": "invalid_resolved_tool_call"},
        )
        return create_tool_result_object(tool_call, invalid_resolved_result, execution_time=0)

    # STALE SCREEN EXECUTION FIX: Verify screenshot is still valid before execution
    # If the screen changed since coordinate resolution, the coordinates might point
    # to the wrong UI element, causing dangerous unintended actions.
    if resolved_call and session_ref:
        resolved_metadata = (
            resolved_call.metadata if isinstance(getattr(resolved_call, "metadata", None), dict) else None
        )
        resolution_screenshot_id = (
            resolved_metadata.get("coordinate_resolution_screenshot_id")
            if resolved_metadata
            else None
        )
        current_screenshot_id = session_ref.get_current_screenshot_id()
        
        if resolution_screenshot_id and resolution_screenshot_id != current_screenshot_id:
            logger.warning(
                f"[request_id={request_id_short}] STALE SCREEN DETECTED: "
                f"Coordinates were resolved using screenshot {resolution_screenshot_id[:8]}, "
                f"but current screenshot is {(current_screenshot_id[:8] if current_screenshot_id else 'none')}. "
                f"Screen changed before execution - tool will fail to prevent dangerous actions."
            )
            # Fail the tool to prevent executing on wrong screen
            stale_screen_result = ToolResult(
                success=False,
                error=(
                    "frame changed, re-ground required: "
                    "screen changed before tool execution and coordinates are no longer valid."
                ),
                output=(
                    "Error: frame changed, re-ground required. "
                    "The screen state changed after coordinate resolution."
                ),
            )
            return create_tool_result_object(tool_call, stale_screen_result, execution_time=0)
    
    if resolved_call:
        try:
            effective_tool_call = _resolved_call_to_parsed_call(resolved_call, tool_call)
        except TypeError as exc:
            error = str(exc)
            logger.error("[request_id=%s] %s", request_id_short, error)
            invalid_resolved_result = ToolResult(
                success=False,
                error=error,
                output=f"Error: {error}",
                data={"status": "invalid_resolved_tool_call"},
            )
            return create_tool_result_object(tool_call, invalid_resolved_result, execution_time=0)
    else:
        effective_tool_call = tool_call

    result_storage = session_ref.get_result_storage()

    # Create future FIRST to avoid race condition where result arrives
    # between checking storage and creating the future
    future = result_storage.create_result_future(request_id)

    def _cleanup_future() -> None:
        result_storage.remove_result_future(request_id)
    
    # Check if result already exists (may have arrived before we created the future)
    # This handles the race condition where the SDK/local runtime executes very quickly.
    tool_result = result_storage.get_pending_result(request_id)
    if tool_result:
        # Remove from storage and resolve the future immediately
        result_storage.remove_pending_result(request_id)
        if not future.done():
            future.set_result(tool_result)
        logger.info(f"Found already completed result for request_id {request_id_short}")
        _cleanup_future()
    else:
        # Result not yet available, wait for it
        try:
            wait_start = time.perf_counter()
            wait_timeout_seconds = resolve_single_tool_wait_timeout_seconds(
                effective_tool_call
            )
            logger.info(f"Waiting for local-runtime tool result (request_id={request_id_short})...")
            # Wait for the result with a timeout
            tool_result = await asyncio.wait_for(
                future,
                timeout=wait_timeout_seconds,
            )
            wait_time = time.perf_counter() - wait_start
            logger.info(
                f"[Timing] Tool orchestrator wait completed in {wait_time:.3f}s "
                f"(request_id={request_id_short}, tool={tool_call.tool_name}, "
                f"timeout={wait_timeout_seconds:.1f}s)"
            )
            logger.info(f"Received result for request_id {request_id_short}")
        except asyncio.TimeoutError:
            logger.error(
                f"Timed out waiting for tool {tool_call.tool_name} "
                f"(request_id={request_id_short}, timeout={wait_timeout_seconds:.1f}s)"
            )
            tool_result = ToolResult(
                success=False,
                error=f"Timed out waiting for tool {tool_call.tool_name} execution in the local runtime.",
                output=f"Error: Tool {tool_call.tool_name} timed out in the local runtime."
            )
        finally:
            _cleanup_future()
    
    # Create a result object compatible with InteractionLoop's expectations
    # Use effective_tool_call (prepared if available, original otherwise)
    return create_tool_result_object(effective_tool_call, tool_result, execution_time=0.1)
