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
    from backend.src.agent.tools.sending.resolver import ToolResolver
    from backend.src.agent.tools.waiting.waiter import ToolResultWaiter

logger = logging.getLogger(__name__)


class ToolOrchestrator:
    """
    High-level orchestrator for the complete tool lifecycle.
    
    Orchestrates: sending → waiting → processing
    """

    def __init__(
        self,
        tool_resolver: "ToolResolver",
        tool_result_waiter: "ToolResultWaiter",
        tool_processing_coordinator: "ToolProcessingCoordinator",
    ):
        """
        Initialize the tool orchestrator.
        
        Args:
            tool_resolver: Resolver for tool call resolution and sending
            tool_result_waiter: Waiter for frontend results
            tool_processing_coordinator: Coordinator for result processing
        """
        self.tool_resolver = tool_resolver
        self.tool_result_waiter = tool_result_waiter
        self.tool_processing_coordinator = tool_processing_coordinator

    async def execute(
        self, parsed_response: ParsedResponse, session: "AgentSession"
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Execute tools: send → wait → process.
        
        Yields execution-time events (ToolResolver events, ThinkingEvent).
        
        Args:
            parsed_response: Parsed LLM response with tool calls
            session: Agent session for context
            
        Yields:
            Execution-time events: ThinkingEvent, ToolResolver events (RequestScreenshotEvent, ToolCallEvent, etc.)
        """
        # Emit thinking event
        yield ThinkingEvent(
            content=f"Executing {len(parsed_response.tool_calls)} tool(s)..."
        )

        # Resolve and send tools (yields execution-time events like RequestScreenshotEvent, ToolCallEvent)
        async for event in self.tool_resolver.resolve_tools(
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
        orchestration_result = await self.tool_result_waiter.wait_for_results(
            parsed_response, session
        )

        # Process results
        await self.tool_processing_coordinator.process(
            orchestration_result, session
        )
