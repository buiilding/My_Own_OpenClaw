"""
Bundle execution helpers for tool orchestration.

Pure helper functions for executing atomic tool bundles.
No side effects beyond result creation.
"""

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any, List

from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedResponse
from backend.src.tools.result_helpers import create_tool_result_object
from backend.src.tools.result_types import ToolExecutionBatch

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


def _step_field(step: Any, field: str, default: Any = None) -> Any:
    """Read a step field from dict-like or object-like step payloads."""
    if step is None:
        return default
    if isinstance(step, dict):
        return step.get(field, default)
    return getattr(step, field, default)


async def execute_bundle(
    parsed_response: ParsedResponse,
    bundle_id: str,
    session_ref: "AgentSession",
) -> ToolExecutionBatch:
    """
    Execute an atomic bundle of tools and wait for the combined result.

    Args:
        parsed_response: Parsed LLM response with tool calls
        bundle_id: Bundle identifier
        session_ref: Agent session reference

    Returns:
        ToolExecutionBatch with tool_results
    """
    bundle_id_short = short_id(bundle_id)
    logger.info(
        f"Processing atomic bundle: {len(parsed_response.tool_calls)} tools (bundle_id={bundle_id_short})"
    )

    result_storage = session_ref.get_result_storage()
    bundle_future = result_storage.create_bundle_future(bundle_id)

    try:
        # Check if bundle result already exists
        bundle_result = result_storage.get_bundled_result(bundle_id)
        if bundle_result:
            result_storage.remove_bundled_result(bundle_id)
            if not bundle_future.done():
                bundle_future.set_result(bundle_result)
            logger.info(
                f"Found already completed bundle result for bundle_id {bundle_id_short}"
            )
        else:
            # Wait for bundle result
            try:
                wait_start = time.perf_counter()
                logger.info(
                    f"Waiting for frontend bundle result (bundle_id={bundle_id_short})..."
                )
                bundle_result = await asyncio.wait_for(bundle_future, timeout=120.0)
                wait_time = time.perf_counter() - wait_start
                logger.info(
                    f"[Timing] Bundle orchestrator wait completed in {wait_time:.3f}s (bundle_id={bundle_id_short})"
                )
            except asyncio.TimeoutError:
                logger.error(
                    f"Timed out waiting for bundle (bundle_id={bundle_id_short})"
                )
                bundle_result = ToolResult(
                    success=False,
                    error="Timed out waiting for bundle execution on frontend.",
                    llm_content="Error: Bundle execution timed out on frontend.",
                )
    finally:
        result_storage.remove_bundle_future(bundle_id)

    # Extract step_results from bundle result and create individual results
    # This maintains compatibility with existing code that expects individual tool results
    results = []
    step_results: List[Any] = []
    if isinstance(bundle_result.data, dict):
        raw_step_results = bundle_result.data.get("step_results", [])
        if isinstance(raw_step_results, list):
            step_results = raw_step_results

    for i, tool_call in enumerate(parsed_response.tool_calls):
        # Find corresponding step result
        step_result = step_results[i] if i < len(step_results) else None

        if step_result is not None and _step_field(step_result, "status") == "ok":
            tool_result = ToolResult(
                success=True,
                llm_content=_step_field(step_result, "output", ""),
                data=bundle_result.data,  # Include screenshot, system_state from bundle
            )
        else:
            step_error = (
                _step_field(step_result, "output") if step_result is not None else None
            )
            error_msg = step_error or bundle_result.error or "Bundle execution failed"
            tool_result = ToolResult(
                success=False, error=error_msg, llm_content=f"Error: {error_msg}"
            )

        results.append(
            create_tool_result_object(tool_call, tool_result, execution_time=0.1)
        )

    return ToolExecutionBatch(tool_results=results)
