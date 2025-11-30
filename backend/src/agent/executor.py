"""
Agent Executor - Core execution loop for the agent.

This module implements the main agent execution loop that processes user queries,
manages tool execution, handles LLM streaming, and coordinates memory operations.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator, List, Optional

from backend.src.llm.parser import ResponseParser
from backend.src.tools.orchestrator import ToolOrchestrator
from backend.src.agent.plugins.manager import PluginManager
from backend.src.llm.llm_client import LLMClient
from backend.src.llm.prompt_constructor import PromptConstructor
from backend.src.core.types import StreamingEvent
from backend.src.agent.interaction_loop import InteractionLoop
from backend.src.agent.result_processor import ResultProcessor

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

logger = logging.getLogger(__name__)


class AgentExecutor:
    """
    Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
    Refactored to delegate to InteractionLoop and ResultProcessor.
    """

    def __init__(
        self,
        session: "AgentSession",
        llm_client: LLMClient,
        tool_orchestrator: ToolOrchestrator,
        prompt_constructor: PromptConstructor,
        response_parser: ResponseParser,
    ):
        self.session = session
        self.llm_client = llm_client
        self.tool_orchestrator = tool_orchestrator
        self.prompt_builder = prompt_constructor
        self.response_parser = response_parser

        # Initialize Plugin Manager (uses global plugin registry)
        self.plugin_manager = PluginManager(use_registry=True)
        
        # Initialize Components
        self.result_processor = ResultProcessor(session, self.plugin_manager)
        self.interaction_loop = InteractionLoop(
            session=session,
            llm_client=llm_client,
            tool_orchestrator=tool_orchestrator,
            prompt_constructor=prompt_constructor,
            response_parser=response_parser,
            result_processor=self.result_processor,
        )

    async def process_query(self, query: str) -> AsyncGenerator[StreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.
        """
        # 1. Retrieve memories for this user query and format with message
        user_message_with_memory = await self._retrieve_and_format_memories(query)
        
        # Add user query with memory to history (as user message)
        self.session.history.add_user_message(user_message_with_memory)

        # 2. Execute Main Loop
        async for event in self.interaction_loop.run_loop():
            yield event

        # 3. Finalization (Events)
        # Get final response from loop state if available
        # Note: InteractionLoop logic handles the response generation, but here we handle the event
        final_response = getattr(self.interaction_loop, 'final_response', None)
        if final_response:
            await self._publish_completion_event(query, final_response)

    async def _retrieve_and_format_memories(self, query: str) -> str:
        """
        Retrieve memories for a user query and format them with explicit sections.
        
        Args:
            query: User query text
            
        Returns:
            Formatted string with [MAIN MESSAGE], [EPISODIC CONTEXT], and [PROCEDURAL CONTEXT] sections
        """
        memories = await self.session.memory_manager.retrieve_memories(query)
        memory_context = self.session.memory_manager.format_context(memories)
        
        # Build formatted message with explicit sections
        sections = [
            "[MAIN MESSAGE — Assistant should respond ONLY to this section]",
            query
        ]
        
        if memory_context:
            sections.append(memory_context)
        
        return "\n\n".join(sections)

    async def _publish_completion_event(self, query: str, response: str):
        """Publishes the InteractionCompleted event."""
        from backend.src.core.bus import message_bus
        from backend.src.core.events import InteractionCompleted
        
        event = InteractionCompleted(
            session_id=self.session.session_id,
            user_id=self.session.user_id,
            user_message=query,
            assistant_response=response
        )
        await message_bus.publish(event)
