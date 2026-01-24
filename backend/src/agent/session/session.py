"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, Optional, List

from backend.src.agent.execution.executor import AgentExecutor
from backend.src.agent.tools.preparation.screenshot.state import ScreenshotState
from backend.src.agent.tools.preparation.storage.prepared_call_storage import PreparedToolCallStorage
from backend.src.agent.tools.waiting import ToolResultHandler
from backend.src.agent.session.state import ConversationHistory
from backend.src.core.infrastructure.bus import EventBus
from backend.src.core.config import AppConfig
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.llm.client import LLMClient, get_llm_client
from backend.src.llm.parser import ResponseParser
from backend.src.llm.prompts import PromptConstructor
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
        metrics_service: Optional[Any] = None,  # MetricsService (optional for backward compatibility)
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
        
        self.response_parser = ResponseParser(
            self.cfg, self.tool_registry, metrics_service=metrics_service
        )

        # Initialize state management
        self.prompt_builder = PromptConstructor(
            self.tool_registry, self.cfg, metrics_service=metrics_service
        )
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

        # Initialize Tool Result Handler (extracted to reduce god object complexity)
        # Handler initialization happens after executor, so we can access screenshot_manager from executor
        from backend.src.agent.tools.preparation.screenshot import ScreenshotProcessor
        from backend.src.agent.tools.waiting import ToolResultReceiver, ToolResultRouter
        from backend.src.agent.tools.waiting.storage import ToolResultStorage
        
        # Initialize handler components
        tool_result_receiver = ToolResultReceiver(self)
        # Get screenshot_manager from executor (created during executor initialization)
        screenshot_manager = self.executor.screenshot_manager if hasattr(self.executor, 'screenshot_manager') else None
        if screenshot_manager:
            screenshot_processor = ScreenshotProcessor(screenshot_manager)
        else:
            # Fallback: create a new one (shouldn't happen in normal flow)
            from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
            screenshot_processor = ScreenshotProcessor(ScreenshotManager())
        tool_result_router = ToolResultRouter(
            receiver=tool_result_receiver,
            screenshot_processor=screenshot_processor,
            result_storage=self._tool_result_storage,
            session=self,
        )
        self.tool_result_handler = ToolResultHandler(
            receiver=tool_result_receiver,
            router=tool_result_router,
        )

        # Subscribe to events
        self.event_bus.subscribe(InteractionCompleted, self._on_interaction_completed)

        # Session-scoped state for computer use
        # Extract screenshot/OCR state management to reduce complexity
        self._screenshot_state = ScreenshotState()
        # SCREENSHOT REQUEST RACE FIX: Use dict to track multiple concurrent screenshot requests
        # Maps request_id -> Future to prevent race conditions when multiple tools request screenshots
        self._pending_screenshots: Dict[str, asyncio.Future] = {}
        # Legacy single waiter (deprecated, kept for backward compatibility during migration)
        self.screenshot_waiter: Optional[asyncio.Future] = None
        self.hidden_screenshot_request_id: Optional[str] = None
        
        # CENTRALIZED TOOL RESULT STORAGE: Single source of truth for all tool results
        self._tool_result_storage = ToolResultStorage(cleanup_ttl_seconds=300)
        
        # Extract prepared tool call storage to reduce complexity
        self._prepared_tool_call_storage = PreparedToolCallStorage()
        
        # Legacy accessors for backward compatibility (delegate to storage)
        # These will be removed once all code is migrated
        self._tool_result_futures: Dict[str, asyncio.Future] = {}  # Deprecated
        self._pending_tool_results: Dict[str, Any] = {}  # Deprecated
        self._bundled_results: Dict[str, Any] = {}  # Deprecated
        # Initialize event as set (no OCR in progress initially)
        # When OCR starts, event is cleared; when OCR completes, event is set
        self.ocr_completion_event = asyncio.Event()
        self.ocr_completion_event.set()  # Set initially (no OCR running)

    def get_screenshot(self, screenshot_id: Optional[str] = None) -> Optional[str]:
        """
        Get current screenshot data.
        
        Delegates to ScreenshotState for state management.
        
        Args:
            screenshot_id: Ignored (kept for backward compatibility)
            
        Returns:
            Base64-encoded screenshot data or None if no current screenshot
        """
        return self._screenshot_state.get_screenshot(screenshot_id)
    
    def get_ocr_results(self, screenshot_id: Optional[str] = None) -> Optional[list[dict]]:
        """
        Get OCR results for current screenshot.
        
        Delegates to ScreenshotState for state management.
        
        Args:
            screenshot_id: Ignored (kept for backward compatibility)
            
        Returns:
            List of OCR results or None if no current OCR results
        """
        return self._screenshot_state.get_ocr_results(screenshot_id)
    
    @property
    def latest_screenshot(self) -> Optional[str]:
        """Legacy property: Returns current screenshot (deprecated, use get_screenshot instead)."""
        return self._screenshot_state.latest_screenshot
    
    @property
    def latest_ocr_results(self) -> Optional[list[dict]]:
        """Legacy property: Returns OCR for current screenshot (deprecated, use get_ocr_results instead)."""
        return self._screenshot_state.latest_ocr_results
    
    def get_current_screenshot_id(self) -> Optional[str]:
        """
        Get the ID of the current screenshot.
        
        ENCAPSULATION: Public method to access current screenshot ID without
        exposing private implementation details. This allows ToolPreparer and
        other components to access screenshot state without tight coupling.
        
        Returns:
            Current screenshot ID or None if no screenshot is available
        """
        return self._screenshot_state.get_current_screenshot_id()
    
    def set_current_screenshot(self, screenshot_id: str, screenshot_data: str) -> None:
        """
        Set the current screenshot, discarding any previous screenshot.
        
        Delegates to ScreenshotState for state management.
        
        Args:
            screenshot_id: Unique ID for the screenshot
            screenshot_data: Base64-encoded screenshot data
        """
        self._screenshot_state.set_current_screenshot(screenshot_id, screenshot_data)
    
    def set_current_ocr_results(self, ocr_results: list[dict]) -> None:
        """
        Set OCR results for the current screenshot.
        
        Delegates to ScreenshotState for state management.
        
        Args:
            ocr_results: List of OCR results
        """
        self._screenshot_state.set_current_ocr_results(ocr_results)
    
    def register_pending_tool_result(self, request_id: str, result: Any) -> None:
        """
        Register a pending tool result in the session.
        
        ENCAPSULATION: Public method to register tool results without exposing
        private implementation details. This allows ToolPreparer and other
        components to store results without tight coupling to internal storage.
        
        Args:
            request_id: Request ID for the tool result
            result: Tool result to store
        """
        # Use centralized storage
        self._tool_result_storage.store_pending_result(request_id, result)
    
    def register_prepared_tool_call(self, request_id: str, prepared_call: Any) -> None:
        """
        Register a prepared tool call in the session.
        
        ENCAPSULATION: Public method to register prepared tool calls without
        exposing private implementation details. This allows ToolPreparer to
        store prepared calls without tight coupling to internal storage.
        
        Delegates to PreparedToolCallStorage for state management.
        
        Args:
            request_id: Request ID for the tool call
            prepared_call: Prepared tool call to store
        """
        self._prepared_tool_call_storage.register(request_id, prepared_call)
    
    def get_prepared_tool_call(self, request_id: str) -> Optional[Any]:
        """
        Get a prepared tool call by request ID.
        
        ENCAPSULATION: Public method to retrieve prepared tool calls without
        exposing private implementation details. This allows ToolOrchestrator
        to access prepared calls without tight coupling to internal storage.
        
        Delegates to PreparedToolCallStorage for state management.
        
        Args:
            request_id: Request ID for the tool call
            
        Returns:
            Prepared tool call or None if not found
        """
        return self._prepared_tool_call_storage.get(request_id)
    
    def remove_prepared_tool_call(self, request_id: str) -> None:
        """
        Remove a prepared tool call from the session.
        
        ENCAPSULATION: Public method to remove prepared tool calls without
        exposing private implementation details. This allows cleanup code
        to remove calls without tight coupling to internal storage.
        
        Delegates to PreparedToolCallStorage for state management.
        
        Args:
            request_id: Request ID for the tool call to remove
        """
        self._prepared_tool_call_storage.remove(request_id)

    async def _on_interaction_completed(self, event: InteractionCompleted) -> None:
        """Handle interaction completed event."""
        # Only handle events for this session
        if event.session_id != self.session_id:
            return

        logger.debug(f"Interaction completion for session {self.session_id}")
        # Memory storage is now handled by the frontend

    async def update_config(self, new_cfg: AppConfig) -> None:
        """
        Updates the agent's configuration and re-initializes dependencies.
        
        STALE CONFIGURATION FIX: Propagates LLM client updates through the entire
        dependency chain: AgentSession -> AgentExecutor -> InteractionLoop -> LLMInteractionHandler.
        Without this, LLMInteractionHandler holds a stale reference to the old LLM client,
        causing settings updates (API keys, models) to not take effect until restart.
        """
        async with self._lock:
            old_provider = self.cfg.model_provider
            old_model = self.cfg.selected_model_id
            self.cfg = new_cfg
            
            logger.info(
                f"[AgentSession] Updating config: "
                f"model_provider {old_provider} → {new_cfg.model_provider}, "
                f"selected_model_id {old_model} → {new_cfg.selected_model_id}"
            )
            
            # Re-initialize LLM client with new config
            self.llm_client = get_llm_client(self.cfg)
            logger.info(
                f"[AgentSession] LLM client recreated with provider={new_cfg.model_provider}, "
                f"model={new_cfg.selected_model_id}"
            )
            self.executor.llm_client = self.llm_client
            # STALE CONFIGURATION FIX: Update LLMInteractionHandler's reference
            # This ensures settings updates (API keys, models) take effect immediately
            if hasattr(self.executor, 'interaction_loop') and self.executor.interaction_loop:
                if hasattr(self.executor.interaction_loop, 'llm_handler') and self.executor.interaction_loop.llm_handler:
                    self.executor.interaction_loop.llm_handler.llm_client = self.llm_client
                    logger.debug("Updated LLMInteractionHandler with new LLM client")

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
                screenshot=image_data, 
                message_content=message_content,
            ):
                yield event
    
    async def process_frontend_tool_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Process a tool result from the frontend.
        
        Delegates to ToolResultHandler to reduce god object complexity.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data (may contain bundled flag)
            error: Error message if execution failed
            metadata: Additional metadata
        """
        await self.tool_result_handler.process_frontend_tool_result(
            request_id, success, result_data, error, metadata
        )
    
    async def process_frontend_tool_bundle_result(
        self,
        bundle_id: str,
        status: str,
        step_results: List[Dict[str, Any]],
        screenshot: Optional[str],
        system_state: Optional[Dict[str, Any]],
        error: Optional[str]
    ) -> None:
        """
        Process an atomic tool-bundle-result from the frontend.
        
        Delegates to ToolResultHandler for processing.
        
        Args:
            bundle_id: Bundle ID for the bundle result
            status: Bundle status ("success", "partial_failure", "failure")
            step_results: List of step results with tool, status, output
            screenshot: Optional screenshot captured after bundle execution
            system_state: Optional system state captured after bundle execution
            error: Optional error message if bundle failed
        """
        await self.tool_result_handler.process_frontend_tool_bundle_result(
            bundle_id, status, step_results, screenshot, system_state, error
        )
    
    async def cleanup(self) -> None:
        """
        Clean up session resources.
        
        RESOURCE MANAGEMENT: Explicitly releases resources held by the session
        to prevent memory leaks and ensure proper cleanup even if garbage collection
        is delayed or prevented by circular references.
        
        This method should be called before the session is removed from active_sessions
        to ensure resources are freed immediately rather than waiting for GC.
        """
        logger.debug(f"Cleaning up session {self.session_id} for user {self.user_id}")
        
        try:
            # Unsubscribe from event bus to prevent memory leaks
            if hasattr(self, 'event_bus') and self.event_bus:
                self.event_bus.unsubscribe(InteractionCompleted, self._on_interaction_completed)
            
            # Shutdown response parser (may have thread pool executor)
            if hasattr(self, 'response_parser') and self.response_parser:
                self.response_parser.shutdown()
            
            # Clear session-scoped state to free memory
            if hasattr(self, '_screenshots'):
                self._screenshots.clear()
            if hasattr(self, '_ocr_results_by_screenshot'):
                self._ocr_results_by_screenshot.clear()
            # Use centralized storage for cleanup
            if hasattr(self, '_tool_result_storage'):
                self._tool_result_storage.clear_all()
            
            # Legacy cleanup (for backward compatibility during migration)
            if hasattr(self, '_tool_result_futures'):
                # Cancel any pending futures
                for future in self._tool_result_futures.values():
                    if not future.done():
                        future.cancel()
                self._tool_result_futures.clear()
            if hasattr(self, '_pending_tool_results'):
                self._pending_tool_results.clear()
            if hasattr(self, '_bundled_results'):
                self._bundled_results.clear()
            
            # SCREENSHOT REQUEST RACE FIX: Cancel all pending screenshot requests
            for request_id, future in list(self._pending_screenshots.items()):
                if not future.done():
                    future.cancel()
                del self._pending_screenshots[request_id]
            
            # Legacy cleanup: Clear single waiter if it exists
            if hasattr(self, 'screenshot_waiter') and self.screenshot_waiter:
                if not self.screenshot_waiter.done():
                    self.screenshot_waiter.cancel()
                self.screenshot_waiter = None
                self.hidden_screenshot_request_id = None
            
            logger.debug(f"Session {self.session_id} cleanup completed")
        except Exception as e:
            logger.error(
                f"Error during session cleanup for {self.session_id}: {e}",
                exc_info=True
            )
            # Don't re-raise - cleanup should be best-effort