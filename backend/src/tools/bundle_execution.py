"""
Bundle execution helpers for tool orchestration.

Pure helper functions for executing atomic tool bundles.
No side effects beyond result creation.
"""
import asyncio
import logging
import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, List

from backend.src.agent.tools.logging_utils import short_id
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.tools.result_helpers import create_tool_result_object

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

logger = logging.getLogger(__name__)


async def execute_bundle(
    parsed_response: ParsedResponse,
    bundle_id: str,
    session_ref: "AgentSession",
) -> Any:
    """
    Execute an atomic bundle of tools and wait for the combined result.
    
    Args:
        parsed_response: Parsed LLM response with tool calls
        bundle_id: Bundle identifier
        session_ref: Agent session reference
        
    Returns:
        SimpleNamespace with tool_results list
    """
    logger.info(f"Processing atomic bundle: {len(parsed_response.tool_calls)} tools (bundle_id={short_id(bundle_id)})")
    
    # Create single bundle future
    bundle_future = session_ref._tool_result_storage.create_bundle_future(bundle_id)
    
    # Check if bundle result already exists
    bundle_result = session_ref._tool_result_storage.get_bundled_result(bundle_id)
    if bundle_result:
        session_ref._tool_result_storage.remove_bundled_result(bundle_id)
        if not bundle_future.done():
            bundle_future.set_result(bundle_result)
        logger.info(f"Found already completed bundle result for bundle_id {short_id(bundle_id)}")
    else:
        # Wait for bundle result
        try:
            wait_start = time.perf_counter()
            logger.info(f"Waiting for frontend bundle result (bundle_id={short_id(bundle_id)})...")
            bundle_result = await asyncio.wait_for(bundle_future, timeout=120.0)
            wait_time = time.perf_counter() - wait_start
            logger.info(f"[Timing] Bundle orchestrator wait completed in {wait_time:.3f}s (bundle_id={short_id(bundle_id)})")
        except asyncio.TimeoutError:
            logger.error(f"Timed out waiting for bundle (bundle_id={short_id(bundle_id)})")
            bundle_result = ToolResult(
                success=False,
                error="Timed out waiting for bundle execution on frontend.",
                llm_content="Error: Bundle execution timed out on frontend."
            )
        finally:
            session_ref._tool_result_storage.remove_bundle_future(bundle_id)
    
    # Extract step_results from bundle result and create individual results
    # This maintains compatibility with existing code that expects individual tool results
    results = []
    step_results = bundle_result.data.get("step_results", []) if isinstance(bundle_result.data, dict) else []
    
    for i, tool_call in enumerate(parsed_response.tool_calls):
        # Find corresponding step result
        step_result = step_results[i] if i < len(step_results) else None
        
        if step_result and step_result.get("status") == "ok":
            tool_result = ToolResult(
                success=True,
                llm_content=step_result.get("output", ""),
                data=bundle_result.data  # Include screenshot, system_state from bundle
            )
        else:
            error_msg = step_result.get("output", "Unknown error") if step_result else bundle_result.error or "Bundle execution failed"
            tool_result = ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: {error_msg}"
            )
        
        results.append(
            create_tool_result_object(tool_call, tool_result, execution_time=0.1)
        )
    
    return SimpleNamespace(tool_results=results)
