"""
Agent Executor - Core execution loop for the agent.

This module implements the main agent execution loop that processes user queries,
manages tool execution, handles LLM streaming, and coordinates memory operations.
"""
import asyncio
import logging
from typing import TYPE_CHECKING, AsyncGenerator, List, Optional, Union

from backend.src.agent.history.history_committer import HistoryCommitter
from backend.src.agent.execution.interaction_loop import InteractionLoop
from backend.src.agent.llm.conversation_context import ConversationContext
from backend.src.agent.llm.event_presenter import EventPresenter
from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
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
from backend.src.agent.tools.preparation import ToolPreparer
from backend.src.agent.tools.sending import ToolSender
from backend.src.core.infrastructure.bus import EventBus
from backend.src.core.events import (
    AgentStreamingEvent,
    ContextCompactionCompletedEvent,
    ContextCompactionFailedEvent,
    ContextCompactionStartedEvent,
    InteractionCompleted,
    MemoryStoreEvent,
    StreamingCompleteEvent,
)
from backend.src.llm.client import LLMClient
from backend.src.llm.prompts import PromptConstructor
from backend.src.tools.orchestrator import ToolResultOrchestrator

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.services.ocr.ocr_service import OcrService

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
        tool_orchestrator: ToolResultOrchestrator,
        prompt_constructor: PromptConstructor,
        ocr_service: Optional["OcrService"],
        event_bus: EventBus,
    ):
        self.session = session
        self.llm_client = llm_client
        self.tool_orchestrator = tool_orchestrator
        self.prompt_builder = prompt_constructor
        self.event_bus = event_bus

        self.ocr_service = ocr_service

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
        result_transformer = ResultTransformer()
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
        
        # Tool preparation: orchestrates resolution
        tool_preparer = ToolPreparer(
            screenshot_manager=self.screenshot_manager,
            coordinate_resolver=coordinate_resolver,
            ocr_coordinator=ocr_coordinator,
            vision_service=vision_service,  # Inject directly instead of using provider
        )
        
        # Tool sending: sends resolved tools to frontend
        tool_sender = ToolSender(
            preparer=tool_preparer,
            synthetic_result_factory=synthetic_result_factory,
        )
        
        # Tool lifecycle components
        tool_result_processor = ToolResultProcessor(
            result_transformer=result_transformer,
            history_committer=history_committer,
        )
        tool_processing_coordinator = ToolProcessingCoordinator(processor=tool_result_processor)
        
        # High-level orchestrator
        agent_tool_orchestrator = AgentToolOrchestrator(
            tool_sender=tool_sender,
            tool_result_orchestrator=tool_orchestrator,
            tool_processing_coordinator=tool_processing_coordinator,
        )
        
        event_presenter = EventPresenter()
        
        # Initialize InteractionLoop with all components
        self.interaction_loop = InteractionLoop(
            session=session,
            prompt_coordinator=conversation_context,
            llm_handler=llm_stream_processor,
            tool_executor=agent_tool_orchestrator,
            event_presenter=event_presenter,
        )

    async def process_query(
        self, 
        query: str, 
        screenshot: Optional[Union[str, List[str]]] = None,
        message_content: Optional[str] = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text (for reference)
            screenshot: Optional base64 screenshot payload(s) for multimodal queries
            message_content: Complete message content from frontend (system state + memories + query)
        """
        # 1. Format user message content (delegated to PromptConstructor)
        is_first_message = self._is_first_user_message()
        final_content = self.prompt_builder.format_user_message_content(
            message_content=message_content,
            query=query,
            is_first_message=is_first_message,
        )

        # 2. Pre-sampling auto-compaction check (before user message append).
        compaction_engine = getattr(self.session, "compaction_engine", None)
        pre_compaction_decision = None
        if compaction_engine is not None:
            pre_compaction_decision = compaction_engine.evaluate(
                reason="auto-pre",
                pending_user_content=final_content,
            )
        if pre_compaction_decision and pre_compaction_decision.should_compact:
            yield ContextCompactionStartedEvent(
                reason="auto-pre",
                strategy=pre_compaction_decision.strategy_name,
                before_tokens=pre_compaction_decision.before_tokens,
                projected_tokens=pre_compaction_decision.projected_tokens,
            )
            try:
                pre_compaction_result = await compaction_engine.compact(
                    reason="auto-pre",
                    decision=pre_compaction_decision,
                )
                summary_preview = self._build_summary_preview(
                    pre_compaction_result.summary_text
                )
                yield ContextCompactionCompletedEvent(
                    reason="auto-pre",
                    strategy=pre_compaction_result.strategy_name,
                    before_tokens=pre_compaction_result.before_tokens,
                    after_tokens=pre_compaction_result.after_tokens,
                    removed_messages=pre_compaction_result.removed_messages,
                    summary_preview=summary_preview,
                    skipped_reason=pre_compaction_result.skip_reason,
                )
            except Exception as exc:
                logger.error(
                    "[Compaction] Pre-query compaction failed: %s",
                    exc,
                    exc_info=True,
                )
                yield ContextCompactionFailedEvent(
                    reason="auto-pre",
                    strategy=pre_compaction_decision.strategy_name,
                    error=str(exc),
                    before_tokens=pre_compaction_decision.before_tokens,
                )

        # 3. Add user message to history (backend appends for continual interaction)
        self.session.history.add_user_message(
            content=final_content,
            user_query_raw=query,
            image_data=screenshot  # History still uses image_data internally
        )

        # 4. Process user message screenshot if present (store as current, trigger OCR)
        primary_screenshot = self._resolve_primary_screenshot(screenshot)
        if primary_screenshot:
            # Use a synthetic request_id for user messages (not from tool execution)
            user_request_id = f"user_msg_{self.session.session_id[:8]}"
            await self.screenshot_manager.process_screenshot(
                self.session,
                primary_screenshot,
                user_request_id,
            )

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
                        session_id=(
                            self.session.runtime.active_conversation_ref
                            or self.session.session_id
                        ),
                    )
                    
                    # Try to yield the memory event, but handle GeneratorExit gracefully
                    try:
                        yield memory_event
                    except GeneratorExit:
                        # Client disconnected before we could yield the event
                        # Route fallback publish through session-managed task tracking so
                        # lifecycle cleanup can cancel/drain it deterministically.
                        logger.warning(
                            "Client disconnected before MemoryStoreEvent could be yielded. "
                            "Publishing to event bus as fallback."
                        )
                        self.session.register_background_task(
                            asyncio.create_task(self.event_bus.publish(memory_event))
                        )
                except Exception as e:
                    # Log but don't re-raise - we're in finally block
                    logger.error(
                        f"Error during finalization after interaction loop: {e}",
                        exc_info=True
                    )

    @staticmethod
    def _build_summary_preview(summary_text: str) -> Optional[str]:
        """Return a short summary preview suitable for websocket payloads."""
        preview = (summary_text or "").strip()
        if not preview:
            return None
        if len(preview) > 180:
            return f"{preview[:177]}..."
        return preview

    @staticmethod
    def _resolve_primary_screenshot(
        screenshot: Optional[Union[str, List[str]]],
    ) -> Optional[str]:
        """Return the first screenshot payload for OCR/system-state preparation."""
        if isinstance(screenshot, str) and screenshot:
            return screenshot
        if isinstance(screenshot, list):
            for screenshot_item in screenshot:
                if isinstance(screenshot_item, str) and screenshot_item:
                    return screenshot_item
        return None

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
