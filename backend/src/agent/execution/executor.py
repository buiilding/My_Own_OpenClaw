"""
Agent Executor - Core execution loop for the agent.

This module implements the main agent execution loop that processes user queries,
manages tool execution, handles LLM streaming, and coordinates memory operations.
"""
import asyncio
import logging
from typing import TYPE_CHECKING, AsyncGenerator, Optional

from backend.src.agent.history.history_committer import HistoryCommitter
from backend.src.agent.execution.interaction_loop import InteractionLoop
from backend.src.agent.llm.conversation_context import ConversationContext
from backend.src.agent.llm.event_presenter import EventPresenter
from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
from backend.src.agent.plugins.manager import PluginManager
from backend.src.agent.tools.orchestrator import ToolOrchestrator as AgentToolOrchestrator
from backend.src.agent.tools.preparation.coordinate_resolution import (
    CoordinateResolver,
    OcrCoordinateResolver,
    VisionCoordinateResolver,
)
from backend.src.agent.tools.preparation.ocr import OcrCoordinator
from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
from backend.src.agent.tools.processing import (
    ResultTransformer,
    SyntheticResultFactory,
    ToolProcessingCoordinator,
    ToolResultProcessor,
)
from backend.src.agent.tools.sending import ToolPreparer, ToolSender
from backend.src.agent.tools.waiting import ToolResultWaiter
from backend.src.core.bus import EventBus
from backend.src.core.events import (
    AgentStreamingEvent,
    InteractionCompleted,
    StreamingCompleteEvent,
    MemoryStoreEvent,
)
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.llm.client import LLMClient
from backend.src.llm.parser import ResponseParser
from backend.src.llm.prompts import PromptConstructor
from backend.src.tools.orchestrator import ToolOrchestrator

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

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
        conversation_context = ConversationContext(
            prompt_constructor=prompt_constructor,
            history=session.history,
        )
        
        llm_stream_processor = LLMStreamProcessor(
            llm_client=llm_client,
            session=session,
        )
        
        # Result processing: split into pure transformation and state mutation
        result_transformer = ResultTransformer(plugin_manager=self.plugin_manager)
        history_committer = HistoryCommitter(history=session.history)
        
        # Tool preparation: split into specialized components
        self.screenshot_manager = ScreenshotManager()  # Store for use in process_query
        ocr_coordinate_resolver = OcrCoordinateResolver()
        vision_coordinate_resolver = VisionCoordinateResolver()
        coordinate_resolver = CoordinateResolver(ocr_coordinate_resolver, vision_coordinate_resolver)
        ocr_coordinator = OcrCoordinator()
        synthetic_result_factory = SyntheticResultFactory()
        
        # Get vision service for ToolPreparer (inject directly to avoid circular dependency)
        vision_service = None
        if self.tool_orchestrator and self.tool_orchestrator.context_factory:
            vision_service = self.tool_orchestrator.context_factory.vision_service
        
        tool_preparer = ToolPreparer(
            screenshot_manager=self.screenshot_manager,
            coordinate_resolver=coordinate_resolver,
            ocr_coordinator=ocr_coordinator,
            synthetic_result_factory=synthetic_result_factory,
            vision_service=vision_service,  # Inject directly instead of using provider
        )
        
        # Tool lifecycle components
        tool_sender = ToolSender(preparer=tool_preparer)
        tool_result_waiter = ToolResultWaiter(backend_tool_orchestrator=tool_orchestrator)
        tool_result_processor = ToolResultProcessor(
            result_transformer=result_transformer,
            history_committer=history_committer,
        )
        tool_processing_coordinator = ToolProcessingCoordinator(processor=tool_result_processor)
        
        # High-level orchestrator
        agent_tool_orchestrator = AgentToolOrchestrator(
            tool_preparer=tool_preparer,
            tool_result_waiter=tool_result_waiter,
            tool_processing_coordinator=tool_processing_coordinator,
        )
        
        event_presenter = EventPresenter()
        
        # Initialize InteractionLoop with all components
        self.interaction_loop = InteractionLoop(
            session=session,
            prompt_coordinator=conversation_context,
            llm_handler=llm_stream_processor,
            response_parser=response_parser,
            tool_executor=agent_tool_orchestrator,
            event_presenter=event_presenter,
        )

    async def process_query(
        self, 
        query: str, 
        screenshot: Optional[str] = None,
        message_content: Optional[str] = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text (for reference)
            screenshot: Optional base64-encoded screenshot data for multimodal queries
            message_content: Complete message content from frontend (system state + memories + query)
        """
        # 1. Format user message content (delegated to PromptConstructor)
        is_first_message = self._is_first_user_message()
        final_content = self.prompt_builder.format_user_message_content(
            message_content=message_content,
            query=query,
            is_first_message=is_first_message,
        )

        # 2. Add user message to history (backend appends for continual interaction)
        self.session.history.add_user_message(
            content=final_content,
            user_query_raw=query,
            image_data=screenshot  # History still uses image_data internally
        )

        # 3. Process user message screenshot if present (store as current, trigger OCR)
        if screenshot:
            # Use a synthetic request_id for user messages (not from tool execution)
            user_request_id = f"user_msg_{self.session.session_id[:8]}"
            await self.screenshot_manager.process_screenshot(self.session, screenshot, user_request_id)

        # 5. Execute Main Loop
        final_response = None
        try:
            async for event in self.interaction_loop.run_loop():
                yield event
                # Capture final response from StreamingCompleteEvent
                if isinstance(event, StreamingCompleteEvent) and event.final_response:
                    final_response = event.final_response
        finally:
            # RELIABILITY: Ensure side-effects run even if client disconnects/cancels
            # Critical business logic (event publishing, memory storage) must execute
            # even if the generator is closed early (GeneratorExit)
            if final_response:
                try:
                    # Publish completion event (side-effect, doesn't require yielding)
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
                    
                    # Try to yield the memory event, but handle GeneratorExit gracefully
                    try:
                        yield memory_event
                    except GeneratorExit:
                        # Client disconnected before we could yield the event
                        # FRAGILE ASYNC CLEANUP FIX: Use fire-and-forget task to ensure
                        # critical cleanup (memory storage) runs even if parent task is cancelled.
                        # If we await here, cancellation can interrupt the await and lose the event.
                        logger.warning(
                            "Client disconnected before MemoryStoreEvent could be yielded. "
                            "Publishing to event bus as fallback (fire-and-forget)."
                        )
                        # Create fire-and-forget task to ensure it runs even if we're cancelled
                        asyncio.create_task(self.event_bus.publish(memory_event))
                except Exception as e:
                    # Log but don't re-raise - we're in finally block
                    logger.error(
                        f"Error during finalization after interaction loop: {e}",
                        exc_info=True
                    )

    def _is_first_user_message(self) -> bool:
        """
        Check if this is the first user message in the conversation.
        
        PERFORMANCE: Uses O(1) length check instead of O(N) scan through all messages.
        This avoids unnecessary latency as conversation history grows.
        """
        # O(1) check: if history is empty, this is the first message
        # Access internal history list directly to avoid creating a copy
        return len(self.session.history.history) == 0

    async def _publish_completion_event(self, query: str, response: str):
        """Publishes the InteractionCompleted event."""
        event = InteractionCompleted(
            session_id=self.session.session_id,
            user_id=self.session.user_id,
            user_message=query,
            assistant_response=response,
        )
        await self.event_bus.publish(event)
