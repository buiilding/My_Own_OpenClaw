"""
Tool Executor.

Coordinates tool preparation, execution, and result processing.
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List

from backend.src.agent.history.history_committer import HistoryCommitter
from backend.src.agent.tools.result_transformer import ResultTransformer
from backend.src.agent.tools.tool_preparer import ToolPreparer
from backend.src.core.events import AgentStreamingEvent, ThinkingEvent
from backend.src.llm.parser import ParsedResponse

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession
    from backend.src.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class ToolExecutor:
    """
    Coordinates tool execution.
    
    Responsibility: Tool orchestration only.
    Delegates transformation to ResultTransformer and state mutation to HistoryCommitter.
    Yields execution-time events (ToolPreparer events, ThinkingEvent).
    Processes results for history storage only (frontend handles display).
    """

    def __init__(
        self,
        tool_orchestrator: "ToolOrchestrator",
        tool_preparer: ToolPreparer,
        result_transformer: ResultTransformer,
        history_committer: HistoryCommitter,
        session: "AgentSession",
    ):
        """
        Initialize the tool executor.
        
        Args:
            tool_orchestrator: Orchestrator for tool execution
            tool_preparer: Preparer for tool call preparation
            result_transformer: Transformer for pure result processing
            history_committer: Committer for state mutation
            session: Agent session for context
        """
        self.tool_orchestrator = tool_orchestrator
        self.tool_preparer = tool_preparer
        self.result_transformer = result_transformer
        self.history_committer = history_committer
        self.session = session

    async def execute(
        self, parsed_response: ParsedResponse
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Executes tools and processes results.
        
        Yields execution-time events (ToolPreparer events, ThinkingEvent).
        Returns processed results via a callback or separate method.
        
        Args:
            parsed_response: Parsed LLM response with tool calls
            
        Yields:
            Execution-time events: ThinkingEvent, ToolPreparer events (RequestScreenshotEvent, ToolCallEvent, etc.)
        """
        # Emit thinking event
        yield ThinkingEvent(
            content=f"Executing {len(parsed_response.tool_calls)} tool(s)..."
        )

        # Prepare tools (yields execution-time events like RequestScreenshotEvent, ToolCallEvent)
        async for event in self.tool_preparer.prepare_tools(
            parsed_response.tool_calls, self.session
        ):
            yield event

    async def process_results(
        self, parsed_response: ParsedResponse
    ) -> None:
        """
        Processes tool execution results for history storage.
        
        Note: Frontend displays tool results immediately after execution.
        This method only processes results for conversation history (LLM context),
        not for frontend display. ToolOutputEvent is only emitted for backend-side
        failures (e.g., coordinate resolution failures) which are handled by ToolPreparer.
        
        For bundled tools, uses the combined bundled result instead of individual results
        to create a single history message.
        
        Args:
            parsed_response: Parsed LLM response with tool calls
        """
        # Execute tools (orchestrator waits for frontend results)
        orchestration_result = await self.tool_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=self.session.user_id,
            session_id=self.session.session_id,
            session_ref=self.session,
        )

        # Check if this is a bundled execution (multiple tools)
        # If so, try to use the combined bundled result for history
        if len(orchestration_result.tool_results) > 1:
            # Check if we have a bundled result stored
            # Since bundles are processed sequentially, the most recent bundled result
            # should correspond to these tool results
            bundled_result = None
            # Try to find bundled result from centralized storage
            # Look for bundle_id in tool call metadata
            for result in orchestration_result.tool_results:
                if hasattr(result.tool_call, 'metadata') and result.tool_call.metadata:
                    bundle_id = result.tool_call.metadata.get('bundle_id')
                    if bundle_id:
                        bundled_result = self.session._tool_result_storage.get_bundled_result(bundle_id)
                        if bundled_result:
                            logger.info(f"Found bundled result for history (bundle_id={bundle_id[:15]}, {len(orchestration_result.tool_results)} tools)")
                            # Remove from storage after use
                            self.session._tool_result_storage.remove_bundled_result(bundle_id)
                            break
            
            if bundled_result:
                # Use combined bundled result for history (single message)
                processed = await self.result_transformer.transform(
                    "bundled_tools", bundled_result
                )
                self.history_committer.commit(processed)
                logger.info(f"Committed combined bundled result to history ({len(orchestration_result.tool_results)} tools as single message)")
                return
        
        # Process individual results (non-bundled or bundled result not found)
        # MEMORY LEAK FIX: Extract ALL request_ids BEFORE processing to ensure cleanup
        # even if transform or commit raises an exception on any result
        all_request_ids = set()
        for result in orchestration_result.tool_results:
            if hasattr(result.tool_call, 'metadata') and result.tool_call.metadata:
                request_id = result.tool_call.metadata.get('request_id')
                if request_id:
                    all_request_ids.add(request_id)
        
        try:
            for result in orchestration_result.tool_results:
                # Transform: pure computation (plugins, artifacts, formatting for history)
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
            cleaned_count = self.session._tool_result_storage.cleanup_request_ids(all_request_ids)
            if cleaned_count > 0:
                logger.debug(f"Cleaned up {cleaned_count} tool results after processing")
            
            # Remove prepared tool calls (no longer needed)
            for request_id in all_request_ids:
                # ENCAPSULATION: Use public method instead of accessing private member
                self.session.remove_prepared_tool_call(request_id)
            
            # Periodic cleanup of old results (TTL-based)
            # This is a safety net for results that weren't properly cleaned up
            self.session._tool_result_storage.cleanup_old_results(max_age_seconds=300)