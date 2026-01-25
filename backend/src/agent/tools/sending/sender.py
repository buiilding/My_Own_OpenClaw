"""
Tool sender.

Sends resolved tools to frontend by yielding events.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator, List

from backend.src.core.events import AgentStreamingEvent

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.sending.resolver import ToolResolver
    from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


class ToolSender:
    """
    Sends resolved tools to frontend.
    
    Responsibility: Sending events only.
    Delegates resolution to ToolResolver and yields events.
    """

    def __init__(
        self,
        resolver: "ToolResolver",
    ):
        """
        Initialize the tool sender.
        
        Args:
            resolver: Resolver for tool resolution
        """
        self.resolver = resolver

    async def send_tools(
        self,
        tool_calls: List["ParsedToolCall"],
        session: "AgentSession",
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Send resolved tools to frontend by yielding events.
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: RequestScreenshotEvent, ToolCallEvent, ToolBundleEvent, ToolOutputEvent
        """
        # Delegate to resolver which yields events
        async for event in self.resolver.resolve_tools(tool_calls, session):
            yield event
