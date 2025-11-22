"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""
import asyncio
import logging
import uuid
from typing import Any, AsyncGenerator, Optional, Dict

from backend.src.brain.processing.parser import ResponseParser
from backend.src.brain.control.orchestrator import ToolOrchestrator
from backend.src.brain.control.agent_loop import AgentExecutor
from backend.src.brain.llm.llm_client import LLMClient, get_llm_client
from backend.src.brain.llm.prompt_constructor import PromptConstructor
from backend.src.brain.state.conversation_history import ConversationHistory
from backend.src.core.config import AppConfig
from backend.src.core.interfaces.memory import MemoryManagerInterface
from backend.src.tools.registry import ToolRegistry
from backend.src.core.bus import message_bus
from backend.src.core.events import InteractionCompleted

logger = logging.getLogger(__name__)

class AgentSession:
    """The main agent class for orchestrating tasks with tool support."""

    def __init__(
        self,
        cfg: AppConfig,
        memory_manager: MemoryManagerInterface,
        tool_registry: ToolRegistry,
        llm_client: Optional[LLMClient] = None,
        tool_orchestrator: Optional[ToolOrchestrator] = None,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
    ) -> None:
        """Initializes the agent session."""
        self.cfg = cfg
        self.llm_client: LLMClient = llm_client or get_llm_client(self.cfg)
        self._lock = asyncio.Lock()

        # Initialize tool system
        self.tool_registry = tool_registry
        self.tool_orchestrator = ToolOrchestrator(self.tool_registry, self.cfg) if tool_orchestrator is None else tool_orchestrator
        self.response_parser = ResponseParser()

        # Initialize state management
        self.history = ConversationHistory()
        self.prompt_builder = PromptConstructor(self.tool_registry)

        # Initialize memory system
        self.user_id = user_id
        self.session_id = session_id or str(uuid.uuid4())
        self.memory_manager = memory_manager
        
        # Initialize Executor
        self.executor = AgentExecutor(
            session=self,
            llm_client=self.llm_client,
            tool_orchestrator=self.tool_orchestrator,
            prompt_constructor=self.prompt_builder,
            response_parser=self.response_parser
        )

        # Subscribe to events
        message_bus.subscribe(InteractionCompleted, self._on_interaction_completed)

    async def _on_interaction_completed(self, event: InteractionCompleted) -> None:
        """Handle interaction completed event."""
        # Only handle events for this session
        if event.session_id != self.session_id:
            return
            
        logger.debug(f"Processing interaction completion for session {self.session_id}")
        try:
            self.memory_manager.store_episodic_memory(event.user_message, event.assistant_response)
        except Exception as e:
            logger.error(f"Failed to store episodic memory: {e}", exc_info=True)

    async def update_config(self, new_cfg: AppConfig) -> None:
        """Updates the agent's configuration and re-initializes dependencies."""
        async with self._lock:
            self.cfg = new_cfg
            # Re-initialize LLM client with new config
            self.llm_client = get_llm_client(self.cfg)
            self.executor.llm_client = self.llm_client
            
            # Update memory manager configuration as well
            await self.memory_manager.update_config(new_cfg)

    async def process_query(self, query: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.
        """
        async with self._lock:
            if not self.cfg.selected_model_id:
                yield {
                    "type": "thinking",
                    "content": "No model selected. Please select a model in settings.",
                }
                return

            async for event in self.executor.process_query(query):
                yield event
