"""
Tool result waiter.

Waits for frontend tool execution results via ToolOrchestrator.
"""
import logging
from typing import TYPE_CHECKING, Any

from backend.src.llm.parser import ParsedResponse

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.tools.orchestrator import ToolOrchestrator as BackendToolOrchestrator

logger = logging.getLogger(__name__)


class ToolResultWaiter:
    """
    Waits for frontend tool execution results.
    
    Responsibility: Waiting for results only.
    Delegates to backend ToolOrchestrator which waits via futures.
    """

    def __init__(
        self,
        backend_tool_orchestrator: "BackendToolOrchestrator",
    ):
        """
        Initialize the tool result waiter.
        
        Args:
            backend_tool_orchestrator: Backend ToolOrchestrator that waits for results
        """
        self.backend_tool_orchestrator = backend_tool_orchestrator

    async def wait_for_results(
        self, parsed_response: ParsedResponse, session: "AgentSession"
    ) -> Any:
        """
        Wait for frontend tool execution results.
        
        Args:
            parsed_response: Parsed LLM response with tool calls
            session: Agent session for context
            
        Returns:
            Orchestration result with tool results
        """
        # Wait for results via backend orchestrator
        orchestration_result = await self.backend_tool_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=session.user_id,
            session_id=session.session_id,
            session_ref=session,
        )
        
        return orchestration_result
