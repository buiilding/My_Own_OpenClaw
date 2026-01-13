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
    Returns processed tool results for EventPresenter to format.
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
    ) -> List[Dict[str, Any]]:
        """
        Processes tool execution results.
        
        This is called after tools are executed to process and format results.
        
        Args:
            parsed_response: Parsed LLM response with tool calls
            
        Returns:
            List of processed tool results ready for EventPresenter
        """
        # Execute tools
        orchestration_result = await self.tool_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=self.session.user_id,
            session_id=self.session.session_id,
            session_ref=self.session,
        )

        # Process results: transform, commit, format for presentation
        processed_results = []
        for result in orchestration_result.tool_results:
            # Transform: pure computation (plugins, artifacts, formatting)
            processed = await self.result_transformer.transform(
                result.tool_call.tool_name, result.result
            )

            # Commit: state mutation (history update)
            self.history_committer.commit(processed)

            # Get active window from processed result or session metadata
            active_window = processed.active_window
            if not active_window and hasattr(self.session, "metadata"):
                active_window = self.session.metadata.get("active_window")

            # Format for EventPresenter
            processed_results.append(
                {
                    "tool_name": processed.tool_name,
                    "success": result.success,
                    "execution_time": result.execution_time,
                    "output": processed.formatted_message,
                    "error": processed.error,
                    "screenshot": processed.screenshot_data or "",
                    "active_window": active_window or "",
                }
            )

        return processed_results
