"""
SDK Agents Module.

This module defines the Agent class, which provides a clean API for creating
sub-agents with custom personalities and tool restrictions.
"""
import logging
from typing import List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


class Agent:
    """
    Agent API for creating sub-agents with custom personalities and tool restrictions.
    
    This is a thin wrapper around AgentSession creation that provides a clean,
    intuitive API matching the pseudo-code structure.
    
    Agents inherit all infrastructure from the parent session (memory, OCR service, tool registry)
    but have:
    - Their own conversation history (scoped)
    - Restricted tools (filtered from parent's tool registry)
    - Custom system prompt (personality)
    - Overridden model_id (which LLM to use)
    
    Example:
        agent = Agent(
            parent_session=parent_session,
            model_id="gemini-2.5-flash",
            system_prompt="You are a helpful assistant...",
            tools=["screenshot", "click_ocr_element"]
        )
        
        response = await agent.respond(text="Open Chrome", image=screenshot_b64)
        agent.clear_history()
    """
    
    def __init__(
        self,
        parent_session: "AgentSession",
        model_id: str,
        system_prompt: str,
        tools: Optional[List[str]] = None,
    ):
        """
        Initialize an Agent.
        
        Args:
            parent_session: The parent AgentSession to inherit resources from
            model_id: The model_id to use for this agent (overrides parent's selected_model_id)
            system_prompt: Custom system prompt for the agent's personality
            tools: List of allowed tool names. If None, no tools are allowed.
        """
        from backend.src.sdk.agents.session_builder import build_session
        
        self.parent_session = parent_session
        self.model_id = model_id
        self.system_prompt = system_prompt
        self.tools = tools
        
        # Create the sub-session
        self._session = build_session(
            parent_session=parent_session,
            model_id=model_id,
            system_prompt=system_prompt,
            tools=tools,
        )
    
    async def respond(
        self, 
        text: str, 
        image: Optional[str] = None,
        collect_tool_calls: bool = False
    ) -> str | tuple[str, list[dict]]:
        """
        Send a query to the agent and get the response.
        
        The agent will run its tool loop automatically if tools are available.
        When the agent stops calling tools, it returns the final response text.
        
        Args:
            text: The text query to send to the agent
            image: Optional base64-encoded image data for multimodal queries
            collect_tool_calls: If True, also return list of tool calls made
            
        Returns:
            The final response text as a plain string, or tuple (response, tool_calls) if collect_tool_calls=True
        """
        from backend.src.sdk.agents.response_extractor import extract_response
        
        return await extract_response(self._session, text, image, collect_tool_calls=collect_tool_calls)
    
    def clear_history(self) -> None:
        """
        Clear the agent's conversation history.
        
        This clears all user and assistant messages but keeps the system prompt
        (which is stored in PromptConstructor, not in history).
        """
        self._session.history.clear()
        logger.debug(f"Cleared history for agent session {self._session.session_id}")
    
    @property
    def session(self) -> "AgentSession":
        """
        Access the underlying AgentSession if needed for advanced use cases.
        
        Returns:
            The underlying AgentSession instance
        """
        return self._session
