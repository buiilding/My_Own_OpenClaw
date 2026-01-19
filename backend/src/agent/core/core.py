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
from backend.src.agent.core.tool_result_handler import ToolResultHandler
from backend.src.core.bus import EventBus
from backend.src.core.config import AppConfig
from backend.src.core.events import InteractionCompleted
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
        self.tool_result_handler = ToolResultHandler(self)

        # Subscribe to events
        self.event_bus.subscribe(InteractionCompleted, self._on_interaction_completed)

        # Session-scoped state for computer use
        # Screenshots are keyed by unique ID to prevent race conditions
        # Each screenshot gets a unique ID (hash or timestamp) to ensure OCR results match
        # MEMORY LEAK FIX: Use OrderedDict to implement LRU eviction for screenshots
        # This prevents unbounded memory growth during long sessions with many tool executions
        from collections import OrderedDict
        self._screenshots: OrderedDict[str, str] = OrderedDict()  # screenshot_id -> base64_data
        self._max_screenshots: int = 10  # Keep last 10 screenshots (LRU eviction)
        self._current_screenshot_id: Optional[str] = None  # ID of the most recent screenshot
        self._ocr_results_by_screenshot: OrderedDict[str, list[dict]] = OrderedDict()  # screenshot_id -> OCR results
        self._max_ocr_results: int = 10  # Keep last 10 OCR result sets (LRU eviction)
        # SCREENSHOT REQUEST RACE FIX: Use dict to track multiple concurrent screenshot requests
        # Maps request_id -> Future to prevent race conditions when multiple tools request screenshots
        self._pending_screenshots: Dict[str, asyncio.Future] = {}
        # Legacy single waiter (deprecated, kept for backward compatibility during migration)
        self.screenshot_waiter: Optional[asyncio.Future] = None
        self.hidden_screenshot_request_id: Optional[str] = None
        self._tool_result_futures: Dict[str, asyncio.Future] = {}
        # Tool result storage (initialized here to avoid lazy initialization)
        self._pending_tool_results: Dict[str, Any] = {}
        self._bundled_results: Dict[str, Any] = {}
        # Initialize event as set (no OCR in progress initially)
        # When OCR starts, event is cleared; when OCR completes, event is set
        self.ocr_completion_event = asyncio.Event()
        self.ocr_completion_event.set()  # Set initially (no OCR running)

    def get_screenshot(self, screenshot_id: Optional[str] = None) -> Optional[str]:
        """
        Get screenshot data by ID.
        
        MEMORY LEAK FIX: Updates LRU order when accessing screenshots.
        
        Args:
            screenshot_id: Optional screenshot ID. If None, returns current screenshot.
            
        Returns:
            Base64-encoded screenshot data or None if not found
        """
        if screenshot_id is None:
            screenshot_id = self._current_screenshot_id
        if screenshot_id and screenshot_id in self._screenshots:
            # MEMORY LEAK FIX: Move to end (most recently used) for LRU
            self._screenshots.move_to_end(screenshot_id)
            return self._screenshots[screenshot_id]
        return None
    
    def get_ocr_results(self, screenshot_id: Optional[str] = None) -> Optional[list[dict]]:
        """
        Get OCR results by screenshot ID.
        
        MEMORY LEAK FIX: Updates LRU order when accessing OCR results.
        
        Args:
            screenshot_id: Optional screenshot ID. If None, returns OCR for current screenshot.
            
        Returns:
            List of OCR results or None if not found
        """
        if screenshot_id is None:
            screenshot_id = self._current_screenshot_id
        if screenshot_id and screenshot_id in self._ocr_results_by_screenshot:
            # MEMORY LEAK FIX: Move to end (most recently used) for LRU
            self._ocr_results_by_screenshot.move_to_end(screenshot_id)
            return self._ocr_results_by_screenshot[screenshot_id]
        return None
    
    @property
    def latest_screenshot(self) -> Optional[str]:
        """Legacy property: Returns current screenshot (deprecated, use get_screenshot instead)."""
        return self.get_screenshot()
    
    @property
    def latest_ocr_results(self) -> Optional[list[dict]]:
        """Legacy property: Returns OCR for current screenshot (deprecated, use get_ocr_results instead)."""
        return self.get_ocr_results()
    
    def get_current_screenshot_id(self) -> Optional[str]:
        """
        Get the ID of the current screenshot.
        
        ENCAPSULATION: Public method to access current screenshot ID without
        exposing private implementation details. This allows ToolPreparer and
        other components to access screenshot state without tight coupling.
        
        Returns:
            Current screenshot ID or None if no screenshot is available
        """
        return self._current_screenshot_id
    
    def _store_screenshot_with_eviction(self, screenshot_id: str, screenshot_data: str) -> None:
        """
        Store screenshot with LRU eviction.
        
        MEMORY LEAK FIX: Implements LRU eviction to prevent unbounded memory growth.
        Keeps only the most recently used screenshots (up to _max_screenshots).
        
        Args:
            screenshot_id: Unique ID for the screenshot
            screenshot_data: Base64-encoded screenshot data
        """
        # Add or update screenshot (moves to end if already exists)
        self._screenshots[screenshot_id] = screenshot_data
        self._screenshots.move_to_end(screenshot_id)
        
        # Evict oldest if over limit
        while len(self._screenshots) > self._max_screenshots:
            oldest_id, _ = self._screenshots.popitem(last=False)
            # Also remove associated OCR results
            self._ocr_results_by_screenshot.pop(oldest_id, None)
            logger.debug(f"Evicted old screenshot {oldest_id[:8]} (LRU cache limit reached)")
    
    def _store_ocr_results_with_eviction(self, screenshot_id: str, ocr_results: list[dict]) -> None:
        """
        Store OCR results with LRU eviction.
        
        MEMORY LEAK FIX: Implements LRU eviction to prevent unbounded memory growth.
        Keeps only the most recently used OCR result sets (up to _max_ocr_results).
        
        Args:
            screenshot_id: Unique ID for the screenshot
            ocr_results: List of OCR results
        """
        # Add or update OCR results (moves to end if already exists)
        self._ocr_results_by_screenshot[screenshot_id] = ocr_results
        self._ocr_results_by_screenshot.move_to_end(screenshot_id)
        
        # Evict oldest if over limit
        while len(self._ocr_results_by_screenshot) > self._max_ocr_results:
            oldest_id, _ = self._ocr_results_by_screenshot.popitem(last=False)
            logger.debug(f"Evicted old OCR results for screenshot {oldest_id[:8]} (LRU cache limit reached)")
    
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
        self._pending_tool_results[request_id] = result
    
    def register_prepared_tool_call(self, request_id: str, prepared_call: Any) -> None:
        """
        Register a prepared tool call in the session.
        
        ENCAPSULATION: Public method to register prepared tool calls without
        exposing private implementation details. This allows ToolPreparer to
        store prepared calls without tight coupling to internal storage.
        
        Args:
            request_id: Request ID for the tool call
            prepared_call: Prepared tool call to store
        """
        if not hasattr(self, "_prepared_tool_calls"):
            self._prepared_tool_calls = {}
        self._prepared_tool_calls[request_id] = prepared_call
    
    def get_prepared_tool_call(self, request_id: str) -> Optional[Any]:
        """
        Get a prepared tool call by request ID.
        
        ENCAPSULATION: Public method to retrieve prepared tool calls without
        exposing private implementation details. This allows ToolOrchestrator
        to access prepared calls without tight coupling to internal storage.
        
        Args:
            request_id: Request ID for the tool call
            
        Returns:
            Prepared tool call or None if not found
        """
        if not hasattr(self, "_prepared_tool_calls"):
            return None
        return self._prepared_tool_calls.get(request_id)
    
    def remove_prepared_tool_call(self, request_id: str) -> None:
        """
        Remove a prepared tool call from the session.
        
        ENCAPSULATION: Public method to remove prepared tool calls without
        exposing private implementation details. This allows cleanup code
        to remove calls without tight coupling to internal storage.
        
        Args:
            request_id: Request ID for the tool call to remove
        """
        if hasattr(self, "_prepared_tool_calls") and request_id in self._prepared_tool_calls:
            del self._prepared_tool_calls[request_id]

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
            self.cfg = new_cfg
            # Re-initialize LLM client with new config
            self.llm_client = get_llm_client(self.cfg)
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
                image_data=image_data, 
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