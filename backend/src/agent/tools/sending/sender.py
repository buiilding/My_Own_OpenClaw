"""
Tool sender.

Sends prepared tools to frontend by yielding events.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator, List

from backend.src.core.events import AgentStreamingEvent

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.sending.preparer import ToolPreparer
    from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


class ToolSender:
    """
    Sends prepared tools to frontend.
    
    Responsibility: Sending events only.
    Delegates preparation to ToolPreparer and yields events.
    """

    def __init__(
        self,
        preparer: "ToolPreparer",
    ):
        """
        Initialize the tool sender.
        
        Args:
            preparer: Preparer for tool preparation
        """
        self.preparer = preparer

    async def send_tools(
        self,
        tool_calls: List["ParsedToolCall"],
        session: "AgentSession",
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Send prepared tools to frontend by yielding events.
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: RequestScreenshotEvent, ToolCallEvent, ToolBundleEvent, ToolOutputEvent
        """
        # Delegate to preparer which yields events
        async for event in self.preparer.prepare_tools(tool_calls, session):
            yield event
