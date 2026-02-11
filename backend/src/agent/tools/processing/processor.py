"""
Tool result processor.

Processes tool execution results: transforms and commits to history.
"""
import logging
from typing import TYPE_CHECKING

from backend.src.agent.history.history_committer import HistoryCommitter
from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.agent.tools.shared.bundle_detection import is_atomic_bundle_from_results
from backend.src.agent.tools.processing.transformer import ResultTransformer

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.tools.result_types import ToolExecutionBatch

logger = logging.getLogger(__name__)


class ToolResultProcessor:
    """
    Processes tool execution results.
    
    Responsibility: Transform results and commit to history.
    """

    def __init__(
        self,
        result_transformer: ResultTransformer,
        history_committer: HistoryCommitter,
    ):
        """
        Initialize the tool result processor.
        
        Args:
            result_transformer: Transformer for pure result processing
            history_committer: Committer for state mutation
        """
        self.result_transformer = result_transformer
        self.history_committer = history_committer

    async def process(
        self, orchestration_result: "ToolExecutionBatch", session: "AgentSession"
    ) -> None:
        """
        Process tool execution results for history storage.
        
        Note: Frontend displays tool results immediately after execution.
        This method only processes results for conversation history (LLM context),
        not for frontend display.
        
        For bundled tools, uses the combined bundled result instead of individual results
        to create a single history message.
        
        Args:
            orchestration_result: Result from tool orchestrator with tool results
            session: Agent session for context
        """
        # Check if this is an atomic bundle (all tools have bundle_id, no request_id)
        if is_atomic_bundle_from_results(orchestration_result.tool_results):
            # ATOMIC BUNDLE: Use bundle result from storage
            first_tool_call = orchestration_result.tool_results[0].tool_call
            execution_ref = ExecutionRef.from_metadata(first_tool_call.metadata)
            bundle_id = execution_ref.bundle_id if execution_ref else None
            if bundle_id:
                bundled_result = session.get_bundle_result(bundle_id)
                if bundled_result:
                    logger.info(f"Found atomic bundle result for history (bundle_id={bundle_id[:15]}, {len(orchestration_result.tool_results)} tools)")
                    
                    # Format bundle result using BundleResultFormatter
                    from backend.src.agent.tools.shared.bundle_result_formatter import BundleResultFormatter
                    formatter = BundleResultFormatter()
                    bundle_data = bundled_result.data if isinstance(bundled_result.data, dict) else {}
                    formatted_message = formatter.format(
                        {
                            "bundle_id": bundle_id,
                            "status": "success" if bundled_result.success else "failure",
                            "step_results": bundle_data.get("step_results", []),
                            "screenshot": bundle_data.get("screenshot"),
                            "screenshot_ref": bundle_data.get("screenshot_ref"),
                            "system_state": bundle_data.get("system_state"),
                            "error": bundled_result.error
                        },
                        bundle_data.get("system_state")
                    )
                    
                    # Create ToolResult with formatted message
                    from backend.src.core.interfaces.tool import ToolResult
                    formatted_bundle_result = ToolResult(
                        success=bundled_result.success,
                        llm_content=formatted_message,
                        data=bundled_result.data,
                        error=bundled_result.error,
                        artifacts=bundled_result.artifacts
                    )
                    
                    # Transform and commit to history
                    processed = await self.result_transformer.transform(
                        "bundled_tools", formatted_bundle_result
                    )
                    self.history_committer.commit(processed)
                    logger.info(f"Committed atomic bundle result to history ({len(orchestration_result.tool_results)} tools as single message)")
                    
                    # Remove from storage after use
                    session.remove_bundle_result(bundle_id)
                    return
        
        # Process individual results (non-bundled or bundled result not found)
        # MEMORY LEAK FIX: Extract ALL request_ids BEFORE processing to ensure cleanup
        # even if transform or commit raises an exception on any result
        all_request_ids = set()
        for result in orchestration_result.tool_results:
            execution_ref = ExecutionRef.from_metadata(result.tool_call.metadata)
            if execution_ref and execution_ref.request_id:
                all_request_ids.add(execution_ref.request_id)
        
        try:
            for result in orchestration_result.tool_results:
                # Transform: pure computation (artifacts, formatting for history)
                processed = await self.result_transformer.transform(
                    result.tool_call.tool_name, result.result
                )

                # Commit: state mutation (history update for LLM context)
                self.history_committer.commit(processed)
        finally:
            # MEMORY LEAK FIX: Cleanup in finally block to ensure removal even if
            # transform or commit raises an exception. This prevents tool results
            # from leaking memory in long-running sessions.
            # Cleanup ALL request_ids that were involved in this turn, regardless of
            # whether processing succeeded or failed. This is critical for long-running
            # sessions with many tool executions.
            
            # Use centralized storage for cleanup
            cleaned_count = session.get_result_storage().cleanup_request_ids(all_request_ids)
            if cleaned_count > 0:
                logger.debug(f"Cleaned up {cleaned_count} tool results after processing")
            
            # Remove resolved tool calls (no longer needed)
            for request_id in all_request_ids:
                # ENCAPSULATION: Use public method instead of accessing private member
                session.remove_resolved_tool_call(request_id)
            
            # Periodic cleanup of old results (TTL-based)
            # This is a safety net for results that weren't properly cleaned up
            session.get_result_storage().cleanup_old_results(max_age_seconds=300)
