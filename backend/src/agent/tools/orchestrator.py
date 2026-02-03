"""
High-level tool orchestrator.

Orchestrates the complete tool lifecycle: sending → waiting → processing.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator

from backend.src.core.events import AgentStreamingEvent, ThinkingEvent
from backend.src.llm.parser import ParsedResponse

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.processing.coordinator import ToolProcessingCoordinator
    from backend.src.agent.tools.sending.sender import ToolSender
    from backend.src.tools.orchestrator import ToolResultOrchestrator

logger = logging.getLogger(__name__)


class ToolOrchestrator:
    """
    High-level orchestrator for the complete tool lifecycle.
    
    Orchestrates: sending → waiting → processing
    """

    def __init__(
        self,
        tool_sender: "ToolSender",
        tool_result_orchestrator: "ToolResultOrchestrator",
        tool_processing_coordinator: "ToolProcessingCoordinator",
    ):
        """
        Initialize the tool orchestrator.
        
        Args:
            tool_sender: Sender for sending resolved tools to frontend
            tool_result_orchestrator: Orchestrator for waiting on frontend results
            tool_processing_coordinator: Coordinator for result processing
        """
        self.tool_sender = tool_sender
        self.tool_result_orchestrator = tool_result_orchestrator
        self.tool_processing_coordinator = tool_processing_coordinator

    async def execute(
        self, parsed_response: ParsedResponse, session: "AgentSession"
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Execute tools: send → wait → process.
        
        Yields execution-time events (ToolSender events, ThinkingEvent).
        
        Args:
            parsed_response: Parsed LLM response with tool calls
            session: Agent session for context
            
        Yields:
            Execution-time events: ThinkingEvent, ToolSender events (ToolCallEvent, etc.)
        """
        # Emit thinking event
        yield ThinkingEvent(
            content=f"Executing {len(parsed_response.tool_calls)} tool(s)..."
        )

        # Send tools (yields execution-time events like ToolCallEvent, ToolBundleEvent)
        async for event in self.tool_sender.send_tools(
            parsed_response.tool_calls, session
        ):
            yield event

    async def process_results(
        self, parsed_response: ParsedResponse, session: "AgentSession"
    ) -> None:
        """
        Wait for results and process them.
        
        Args:
            parsed_response: Parsed LLM response with tool calls
            session: Agent session for context
        """
        # Wait for frontend results
        orchestration_result = await self.tool_result_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=session.user_id,
            session_id=session.session_id,
            session_ref=session,
        )

        # Process results
        await self.tool_processing_coordinator.process(
            orchestration_result, session
        )
