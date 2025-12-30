"""
Agent Executor - Core execution loop for the agent.

This module implements the main agent execution loop that processes user queries,
manages tool execution, handles LLM streaming, and coordinates memory operations.
"""
import json
import logging
from typing import TYPE_CHECKING, AsyncGenerator, Optional

from backend.src.agent.interaction_loop import InteractionLoop
from backend.src.agent.plugins.manager import PluginManager
from backend.src.agent.result_processor import ResultProcessor
from backend.src.core.bus import EventBus
from backend.src.core.events import (
    AgentStreamingEvent,
    InteractionCompleted,
    StreamingCompleteEvent,
)
from backend.src.core.messages import MessageType
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.llm.llm_client import LLMClient
from backend.src.llm.parser import ResponseParser
from backend.src.llm.prompt_constructor import PromptConstructor
from backend.src.services.system_monitor import system_monitor
from backend.src.tools.orchestrator import ToolOrchestrator

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
        plugin_registry: PluginRegistry,
        event_bus: EventBus,
    ):
        self.session = session
        self.llm_client = llm_client
        self.tool_orchestrator = tool_orchestrator
        self.prompt_builder = prompt_constructor
        self.response_parser = response_parser
        self.event_bus = event_bus

        # Initialize Plugin Manager
        self.plugin_manager = PluginManager(plugin_registry)

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

    async def process_query(
        self, 
        query: str, 
        image_data: Optional[str] = None
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text
            image_data: Optional base64-encoded image data for multimodal queries
        """
        # 1. Retrieve memories for this user query and extract structured components
        memory_data = await self._retrieve_and_format_memories(query)

        # 2. Get tool schemas for first message (hybrid approach: both in content and as API parameter)
        tool_schemas = None
        if self._is_first_user_message():
            tool_schemas = self.prompt_builder.tool_registry.get_function_declarations() or []

        # 3. Build user message content (include tool schemas in first message)
        complete_content = self._build_user_message_content(
            query=query,
            episodic_memory=memory_data["episodic_memory"],
            semantic_memory=memory_data["semantic_memory"],
            tool_schemas=tool_schemas
        )

        # 4. Add user message to history
        self.session.history.add_user_message(
            content=complete_content,
            episodic_memory=memory_data["episodic_memory"],
            semantic_memory=memory_data["semantic_memory"],
            user_query_raw=query,
            image_data=image_data
        )

        # 5. Execute Main Loop
        final_response = None
        async for event in self.interaction_loop.run_loop():
            yield event
            # Capture final response from StreamingCompleteEvent
            if isinstance(event, StreamingCompleteEvent) and event.final_response:
                final_response = event.final_response

        # 5. Finalization (Events)
        if final_response:
            await self._publish_completion_event(query, final_response)

    def _is_first_user_message(self) -> bool:
        """Check if this is the first user message in the conversation."""
        stored_messages = self.session.history.get_stored_messages()
        user_query_count = sum(1 for msg in stored_messages if msg.message_type == MessageType.USER_QUERY)
        return user_query_count == 0

    def _build_user_message_content(
        self,
        query: str,
        episodic_memory: list[str],
        semantic_memory: list[str],
        tool_schemas: Optional[list[dict]] = None,
    ) -> str:
        """
        Build user message content with context, memory, and query.
        Tool schemas are included in the first user message for context, and also passed separately via the tools parameter.

        Args:
            query: User query text
            episodic_memory: List of episodic memory strings
            semantic_memory: List of semantic memory strings
            tool_schemas: Optional tool schemas to include in first message

        Returns:
            Complete message content ready for storage
        """
        parts: list[str] = []
        
        # 1. System context XML
        is_first_message = self._is_first_user_message()
        if is_first_message:
            context_xml = system_monitor.get_initial_state_xml()
        else:
            context_xml = system_monitor.get_full_state_xml()
        parts.append(context_xml)
        
        # 2. Memory sections
        memory_sections = []
        if episodic_memory:
            episodic_text = "\n".join(f"- {m}" for m in episodic_memory)
            memory_sections.append(f"<episodic_memory>\n{episodic_text}\n</episodic_memory>")
        else:
            memory_sections.append("<episodic_memory>\nNone\n</episodic_memory>")
        
        if semantic_memory:
            semantic_text = "\n".join(f"- {m}" for m in semantic_memory)
            memory_sections.append(f"<semantic_memory>\n{semantic_text}\n</semantic_memory>")
        else:
            memory_sections.append("<semantic_memory>\nNone\n</semantic_memory>")
        
        parts.extend(memory_sections)

        # 3. Tool schemas (only for first message)
        if tool_schemas and is_first_message:
            tool_schemas_json = json.dumps(tool_schemas, indent=2)
            parts.append(f"<tool_schemas>\n{tool_schemas_json}\n</tool_schemas>")

        # 4. User query
        parts.append(f"<user_query>\n{query}\n</user_query>")

        return "\n\n".join(parts)

    async def _retrieve_and_format_memories(self, query: str) -> dict:
        """
        Retrieve memories for a user query and return structured components.

        Args:
            query: User query text

        Returns:
            Dictionary with:
            - episodic_memory: List of episodic memory strings
            - semantic_memory: List of semantic memory strings
        """
        memories = await self.session.memory_manager.retrieve_memories(query)
        
        # Extract structured components
        episodic_memory = memories.get("episodic", [])
        semantic_memory = memories.get("semantic", [])

        return {
            "episodic_memory": episodic_memory,
            "semantic_memory": semantic_memory,
        }

    async def _publish_completion_event(self, query: str, response: str):
        """Publishes the InteractionCompleted event."""
        event = InteractionCompleted(
            session_id=self.session.session_id,
            user_id=self.session.user_id,
            user_message=query,
            assistant_response=response,
        )
        await self.event_bus.publish(event)
