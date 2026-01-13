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

from backend.src.agent.core.executor import AgentExecutor
from backend.src.agent.core.state import ConversationHistory
from backend.src.core.bus import EventBus
from backend.src.core.config import AppConfig
from backend.src.core.events import InteractionCompleted
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
        tool_registry: Registry of available tools
        llm_client: Client for LLM provider interactions
        history: Conversation history for this session
    """

    def __init__(
        self,
        cfg: AppConfig,
        tool_registry: ToolRegistry,
        plugin_registry: PluginRegistry,
        llm_client: Optional[LLMClient] = None,
        tool_orchestrator: Optional[ToolOrchestrator] = None,
        event_bus: Optional[EventBus] = None,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
    ) -> None:
        """
        Initialize the agent session.

        Args:
            cfg: Application configuration object
            tool_registry: Registry containing all available tools
            plugin_registry: Registry for plugin management
            llm_client: LLM client instance (auto-created if None)
            tool_orchestrator: Tool orchestration instance (auto-created if None)
            event_bus: EventBus instance for event communication (required)
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
        self.prompt_builder = PromptConstructor(self.tool_registry)
        self.history = ConversationHistory(
            max_length=None,  # Disable pruning
            system_prompt=self.prompt_builder.system_prompt
        )

        # Initialize context info
        self.user_id = user_id
        self.session_id = session_id or str(uuid.uuid4())

        # Store event bus
        if event_bus is None:
            raise ValueError("event_bus is required for AgentSession")
        self.event_bus = event_bus

        # Initialize Executor
        self.executor = AgentExecutor(
            session=self,
            llm_client=self.llm_client,
            tool_orchestrator=self.tool_orchestrator,
            prompt_constructor=self.prompt_builder,
            response_parser=self.response_parser,
            plugin_registry=plugin_registry,
            event_bus=self.event_bus,
        )

        # Subscribe to events
        self.event_bus.subscribe(InteractionCompleted, self._on_interaction_completed)

        # Session-scoped state for computer use
        self.latest_screenshot: Optional[str] = None
        self.latest_ocr_results: Optional[list[dict]] = None
        self.screenshot_waiter: Optional[asyncio.Future] = None
        self.hidden_screenshot_request_id: Optional[str] = None
        self._tool_result_futures: Dict[str, asyncio.Future] = {}
        # Initialize event as set (no OCR in progress initially)
        # When OCR starts, event is cleared; when OCR completes, event is set
        self.ocr_completion_event = asyncio.Event()
        self.ocr_completion_event.set()  # Set initially (no OCR running)

    async def _on_interaction_completed(self, event: InteractionCompleted) -> None:
        """Handle interaction completed event."""
        # Only handle events for this session
        if event.session_id != self.session_id:
            return

        logger.debug(f"Interaction completion for session {self.session_id}")
        # Memory storage is now handled by the frontend

    async def update_config(self, new_cfg: AppConfig) -> None:
        """Updates the agent's configuration and re-initializes dependencies."""
        async with self._lock:
            self.cfg = new_cfg
            # Re-initialize LLM client with new config
            self.llm_client = get_llm_client(self.cfg)
            self.executor.llm_client = self.llm_client

    async def process_query(
        self, 
        query: str, 
        image_data: Optional[str] = None,
        message_content: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text (for reference)
            image_data: Optional base64-encoded image data for multimodal queries
            message_content: Complete message content from frontend (system state + memories + query)
        """
        async with self._lock:
            if not self.cfg.selected_model_id:
                yield {
                    "type": "thinking",
                    "content": "No model selected. Please select a model in settings.",
                }
                return

            async for event in self.executor.process_query(
                query, 
                image_data=image_data, 
                message_content=message_content,
            ):
                yield event
