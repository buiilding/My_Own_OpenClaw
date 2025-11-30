"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, Optional

from backend.src.agent.executor import AgentExecutor
from backend.src.agent.state import ConversationHistory
from backend.src.core.bus import message_bus
from backend.src.core.config import AppConfig
from backend.src.core.events import InteractionCompleted
from backend.src.core.interfaces.memory import MemoryManagerInterface
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.llm.llm_client import LLMClient, get_llm_client
from backend.src.llm.parser import ResponseParser
from backend.src.llm.prompt_constructor import PromptConstructor
from backend.src.tools.registry import ToolRegistry

if TYPE_CHECKING:
    from backend.src.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class AgentSession:
    """
    The main agent class for orchestrating tasks with tool support.

    AgentSession manages conversation state and coordinates between the LLM,
    tool execution, and memory systems. It processes user queries through
    a complete pipeline: query processing → LLM interaction → tool execution → response streaming.

    Key responsibilities:
    - Maintain conversation history and context
    - Coordinate LLM interactions with tool calls
    - Stream responses back to clients
    - Persist conversation memory
    - Handle session lifecycle events

    Attributes:
        cfg: Application configuration
        user_id: Unique identifier for the user
        session_id: Unique identifier for this session
        memory_manager: Interface for conversation memory operations
        tool_registry: Registry of available tools
        llm_client: Client for LLM provider interactions
        history: Conversation history for this session
    """

    def __init__(
        self,
        cfg: AppConfig,
        memory_manager: MemoryManagerInterface,
        tool_registry: ToolRegistry,
        plugin_registry: PluginRegistry,
        llm_client: Optional[LLMClient] = None,
        tool_orchestrator: Optional[ToolOrchestrator] = None,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
    ) -> None:
        """
        Initialize the agent session.

        Args:
            cfg: Application configuration object
            memory_manager: Memory management interface for conversation persistence
            tool_registry: Registry containing all available tools
            plugin_registry: Registry for plugin management
            llm_client: LLM client instance (auto-created if None)
            tool_orchestrator: Tool orchestration instance (auto-created if None)
            user_id: User identifier for session ownership
            session_id: Session identifier (auto-generated if None)
        """
        self.cfg = cfg
        self.llm_client: LLMClient = llm_client or get_llm_client(self.cfg)
        self._lock = asyncio.Lock()

        # Initialize tool system
        self.tool_registry = tool_registry
        if tool_orchestrator is None:
            from backend.src.tools.orchestrator import ToolOrchestrator

            self.tool_orchestrator = ToolOrchestrator(self.tool_registry, self.cfg)
        else:
            self.tool_orchestrator = tool_orchestrator
        self.response_parser = ResponseParser()

        # Initialize state management
        self.history = ConversationHistory(max_length=self.cfg.max_history_length)
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
            response_parser=self.response_parser,
            plugin_registry=plugin_registry,
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
            await self.memory_manager.store_episodic_memory(
                event.user_message, event.assistant_response
            )
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
