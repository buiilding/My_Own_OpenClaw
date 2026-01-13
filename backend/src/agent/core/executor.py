"""
Agent Executor - Core execution loop for the agent.

This module implements the main agent execution loop that processes user queries,
manages tool execution, handles LLM streaming, and coordinates memory operations.
"""
import json
import logging
from typing import TYPE_CHECKING, AsyncGenerator, Optional

from backend.src.agent.llm.event_presenter import EventPresenter
from backend.src.agent.history.history_committer import HistoryCommitter
from backend.src.agent.core.interaction_loop import InteractionLoop
from backend.src.agent.llm.llm_interaction_handler import LLMInteractionHandler
from backend.src.agent.plugins.manager import PluginManager
from backend.src.agent.llm.prompt_coordinator import PromptCoordinator
from backend.src.agent.tools.result_transformer import ResultTransformer
from backend.src.agent.tools.tool_executor import ToolExecutor
from backend.src.agent.tools.tool_preparer import ToolPreparer
from backend.src.core.bus import EventBus
from backend.src.core.events import (
    AgentStreamingEvent,
    InteractionCompleted,
    StreamingCompleteEvent,
    MemoryStoreEvent,
)
from backend.src.core.messages import MessageType
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.llm.llm_client import LLMClient
from backend.src.llm.parser import ResponseParser
from backend.src.llm.prompt_constructor import PromptConstructor
from backend.src.tools.orchestrator import ToolOrchestrator

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

logger = logging.getLogger(__name__)


class AgentExecutor:
    """
    Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
    Refactored to delegate to InteractionLoop and specialized components.
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

        # Initialize specialized components for SRP
        prompt_coordinator = PromptCoordinator(
            prompt_constructor=prompt_constructor,
            history=session.history,
        )
        
        llm_handler = LLMInteractionHandler(
            llm_client=llm_client,
            session=session,
        )
        
        # Result processing: split into pure transformation and state mutation
        result_transformer = ResultTransformer(plugin_manager=self.plugin_manager)
        history_committer = HistoryCommitter(history=session.history)
        
        # Tool preparation: split into specialized components
        from backend.src.agent.tools.resolvers.coordinate_resolvers import (
            CoordinateResolver,
            OcrResolver,
            VisionResolver,
        )
        from backend.src.agent.tools.ocr_coordinator import OcrCoordinator
        from backend.src.agent.tools.screenshot_manager import ScreenshotManager
        from backend.src.agent.tools.synthetic_result_factory import SyntheticResultFactory
        
        screenshot_manager = ScreenshotManager()
        ocr_resolver = OcrResolver()
        vision_resolver = VisionResolver()
        coordinate_resolver = CoordinateResolver(ocr_resolver, vision_resolver)
        ocr_coordinator = OcrCoordinator()
        synthetic_result_factory = SyntheticResultFactory()
        
        tool_preparer = ToolPreparer(
            screenshot_manager=screenshot_manager,
            coordinate_resolver=coordinate_resolver,
            ocr_coordinator=ocr_coordinator,
            synthetic_result_factory=synthetic_result_factory,
        )
        
        tool_executor = ToolExecutor(
            tool_orchestrator=tool_orchestrator,
            tool_preparer=tool_preparer,
            result_transformer=result_transformer,
            history_committer=history_committer,
            session=session,
        )
        
        event_presenter = EventPresenter()
        
        # Initialize InteractionLoop with all components
        self.interaction_loop = InteractionLoop(
            session=session,
            prompt_coordinator=prompt_coordinator,
            llm_handler=llm_handler,
            response_parser=response_parser,
            tool_executor=tool_executor,
            event_presenter=event_presenter,
        )

    async def process_query(
        self, 
        query: str, 
        image_data: Optional[str] = None,
        message_content: Optional[str] = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text (for reference)
            image_data: Optional base64-encoded image data for multimodal queries
            message_content: Complete message content from frontend (system state + memories + query)
        """
        # 1. Get tool schemas for first message only
        tool_schemas = None
        is_first_message = self._is_first_user_message()
        if is_first_message:
            tool_schemas = self.prompt_builder.tool_registry.get_function_declarations() or []

        # 2. Build final content: frontend content + tool schemas (if first message)
        if message_content:
            # Use frontend-provided content
            final_content = message_content
        else:
            # Fallback: just the query (shouldn't happen in normal flow)
            logger.warning("No message content provided by frontend, using query only")
            final_content = f"<user_query>\n{query}\n</user_query>"

        # 3. Add tool schemas to first message only
        if tool_schemas and is_first_message:
            tool_schemas_json = json.dumps(tool_schemas, indent=2)
            final_content = f"{final_content}\n\n<tool_schemas>\n{tool_schemas_json}\n</tool_schemas>"

        # 4. Add user message to history (backend appends for continual interaction)
        self.session.history.add_user_message(
            content=final_content,
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
            # Emit memory store event for frontend to store the interaction
            # Currently only episodic memory is automatically stored
            # Semantic memory can be stored manually via the memory tool
            memory_event = MemoryStoreEvent(
                user_query=query,
                assistant_response=final_response,
                memory_type="episodic",  # Store interactions as episodic memory
                user_id=self.session.user_id,
                session_id=self.session.session_id,  # Track conversation window
            )
            yield memory_event

    def _is_first_user_message(self) -> bool:
        """Check if this is the first user message in the conversation."""
        stored_messages = self.session.history.get_stored_messages()
        user_query_count = sum(1 for msg in stored_messages if msg.message_type == MessageType.USER_QUERY)
        return user_query_count == 0

    async def _publish_completion_event(self, query: str, response: str):
        """Publishes the InteractionCompleted event."""
        event = InteractionCompleted(
            session_id=self.session.session_id,
            user_id=self.session.user_id,
            user_message=query,
            assistant_response=response,
        )
        await self.event_bus.publish(event)
