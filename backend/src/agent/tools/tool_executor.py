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

        # Process results: transform and commit to history (for LLM context only)
        for result in orchestration_result.tool_results:
            # Transform: pure computation (plugins, artifacts, formatting for history)
            processed = await self.result_transformer.transform(
                result.tool_call.tool_name, result.result
            )

            # Commit: state mutation (history update for LLM context)
            self.history_committer.commit(processed)
