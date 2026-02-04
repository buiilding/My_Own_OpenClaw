"""
Single tool execution helpers for tool orchestration.

Pure helper functions for executing individual tools.
No side effects beyond result creation.
"""
import asyncio
import logging
import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, List

from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.result_helpers import create_tool_result_object

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


async def execute_single_tool(
    tool_call: ParsedToolCall,
    session_ref: "AgentSession",
) -> Any:
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
        logger.warning(f"Tool call {tool_call.tool_name} missing request_id in metadata")
        # Fallback to placeholder if no request_id (shouldn't happen with ToolResolver)
        placeholder_result = ToolResult(
            success=True,
            llm_content=f"Tool {tool_call.tool_name} executing on frontend...",
            data={"status": "pending_frontend_execution"}
        )
        return create_tool_result_object(tool_call, placeholder_result, execution_time=0)
    
    request_id_short = short_id(request_id)

    # Use prepared tool call if available (avoids using mutated original)
    # Resolved tool calls have resolved coordinates and are immutable
    # ENCAPSULATION: Use public method instead of accessing private member
    resolved_call = None
    if session_ref:
        resolved_call = session_ref.get_resolved_tool_call(request_id)
    
    # STALE SCREEN EXECUTION FIX: Verify screenshot is still valid before execution
    # If the screen changed since coordinate resolution, the coordinates might point
    # to the wrong UI element, causing dangerous unintended actions.
    if resolved_call and session_ref:
        resolution_screenshot_id = resolved_call.metadata.get("coordinate_resolution_screenshot_id") if resolved_call.metadata else None
        current_screenshot_id = session_ref.get_current_screenshot_id()
        
        if resolution_screenshot_id and current_screenshot_id and resolution_screenshot_id != current_screenshot_id:
            logger.warning(
                f"[request_id={request_id_short}] STALE SCREEN DETECTED: "
                f"Coordinates were resolved using screenshot {resolution_screenshot_id[:8]}, "
                f"but current screenshot is {current_screenshot_id[:8]}. "
                f"Screen changed before execution - tool will fail to prevent dangerous actions."
            )
            # Fail the tool to prevent executing on wrong screen
            stale_screen_result = ToolResult(
                success=False,
                error="Screen changed before tool execution. Coordinates are no longer valid.",
                llm_content="Error: The screen state changed after coordinate resolution. Please try again."
            )
            return create_tool_result_object(tool_call, stale_screen_result, execution_time=0)
    
    # Use resolved call if available, otherwise fall back to original
    # The resolved call has the same structure but with resolved coordinates
    effective_tool_call = resolved_call.to_parsed_call() if resolved_call else tool_call

    # Initialize session attributes if needed
    if not hasattr(session_ref, '_pending_tool_results'):
        session_ref._pending_tool_results = {}
    if not hasattr(session_ref, '_tool_result_futures'):
        session_ref._tool_result_futures = {}
    
    # Create future FIRST to avoid race condition where result arrives
    # between checking storage and creating the future
    # Use centralized storage for futures
    future = session_ref._tool_result_storage.create_result_future(request_id)
    # Also maintain legacy dict for backward compatibility
    session_ref._tool_result_futures[request_id] = future

    def _cleanup_future() -> None:
        # Use centralized storage for cleanup
        session_ref._tool_result_storage.remove_result_future(request_id)
        # Also clean up legacy dict
        session_ref._tool_result_futures.pop(request_id, None)
    
    # Check if result already exists (may have arrived before we created the future)
    # This handles the race condition where frontend executes tool very quickly
    tool_result = session_ref._tool_result_storage.get_pending_result(request_id)
    if tool_result:
        # Remove from storage and resolve the future immediately
        session_ref._tool_result_storage.remove_pending_result(request_id)
        if not future.done():
            future.set_result(tool_result)
        logger.info(f"Found already completed result for request_id {request_id_short}")
        _cleanup_future()
    else:
        # Result not yet available, wait for it
        try:
            wait_start = time.perf_counter()
            logger.info(f"Waiting for frontend tool result (request_id={request_id_short})...")
            # Wait for the result with a timeout
            tool_result = await asyncio.wait_for(future, timeout=120.0)  # 2 min timeout for tools
            wait_time = time.perf_counter() - wait_start
            logger.info(f"[Timing] Tool orchestrator wait completed in {wait_time:.3f}s (request_id={request_id_short}, tool={tool_call.tool_name})")
            logger.info(f"Received result for request_id {request_id_short}")
        except asyncio.TimeoutError:
            logger.error(f"Timed out waiting for tool {tool_call.tool_name} (request_id={request_id_short})")
            tool_result = ToolResult(
                success=False,
                error=f"Timed out waiting for tool {tool_call.tool_name} execution on frontend.",
                llm_content=f"Error: Tool {tool_call.tool_name} timed out on frontend."
            )
        finally:
            _cleanup_future()
    
    # Create a result object compatible with InteractionLoop's expectations
    # Use effective_tool_call (prepared if available, original otherwise)
    return create_tool_result_object(effective_tool_call, tool_result, execution_time=0.1)
