"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, Optional, List, Callable

from backend.src.agent.session.config_runtime import SessionConfigRuntime
from backend.src.agent.session.initializer import (
    init_event_bus,
    init_executor,
    init_identity,
    init_parsing_and_prompt,
    init_session_state,
    init_tool_result_handler,
    init_tooling,
    subscribe_events,
)
from backend.src.agent.session.lifecycle import SessionLifecycle
from backend.src.core.config import AppConfig
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.llm.client import LLMClient, get_llm_client
from backend.src.tools.registry import ToolRegistry

if TYPE_CHECKING:
    from backend.src.core.infrastructure.bus import EventBus
    from backend.src.core.interfaces.tool import ToolResult
    from backend.src.tools.orchestrator import ToolResultOrchestrator
    from backend.src.services.ocr.ocr_service import OcrService

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
        ocr_service: Optional["OcrService"],
        llm_client: Optional[LLMClient] = None,
        llm_client_factory: Optional[Callable[[AppConfig], LLMClient]] = None,
        tool_orchestrator: Optional[ToolResultOrchestrator] = None,
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
            ocr_service: OCR service instance (optional)
            llm_client: LLM client instance (auto-created if None)
            llm_client_factory: Optional factory for creating LLM clients (used on updates)
            tool_orchestrator: Tool orchestration instance (auto-created if None)
            event_bus: EventBus instance for event communication (required)
            user_id: User identifier for session ownership
            session_id: Session identifier (auto-generated if None)
        """
        self.cfg = cfg
        self.llm_client_factory = llm_client_factory or get_llm_client
        self.llm_client: LLMClient = llm_client or self.llm_client_factory(self.cfg)
        self._lock = asyncio.Lock()

        init_tooling(self, tool_registry, tool_orchestrator)
        init_parsing_and_prompt(self, metrics_service)
        init_identity(self, user_id, session_id)
        init_event_bus(self, event_bus)
        self.ocr_service = ocr_service
        init_executor(self, self.ocr_service)
        init_session_state(self)

        # Initialize tool result handler after executor creation.
        init_tool_result_handler(self)

        subscribe_events(self)

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

    def set_current_system_state(self, system_state: Optional[Dict[str, Any]]) -> None:
        """
        Store the most recent system_state payload from the frontend.

        Used for coordinate normalization when screenshot pixel space differs from
        OS coordinate space (common with HiDPI scaling on Linux).
        """
        if system_state is None:
            self.runtime.set_system_state(None)
            return
        if not isinstance(system_state, dict):
            logger.warning(
                "Ignoring invalid system_state payload type: %s",
                type(system_state).__name__,
            )
            return
        self.runtime.set_system_state(system_state)

    def get_current_system_state(self) -> Optional[Dict[str, Any]]:
        """Return the last system_state payload captured by the frontend, if any."""
        return self.runtime.get_system_state()
    
    def register_pending_tool_result(self, request_id: str, result: "ToolResult") -> None:
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
        self.runtime.tool_results.store_pending_result(request_id, result)
    
    def register_resolved_tool_call(self, request_id: str, resolved_call: Any) -> None:
        """
        Register a resolved tool call in the session.
        
        ENCAPSULATION: Public method to register resolved tool calls without
        exposing private implementation details. This allows ToolPreparer to
        store resolved calls without tight coupling to internal storage.
        
        Delegates to ResolvedToolCallStorage for state management.
        
        Args:
            request_id: Request ID for the tool call
            resolved_call: Resolved tool call to store
        """
        self.runtime.resolved_calls.register(request_id, resolved_call)
    
    def get_resolved_tool_call(self, request_id: str) -> Optional[Any]:
        """
        Get a resolved tool call by request ID.
        
        ENCAPSULATION: Public method to retrieve resolved tool calls without
        exposing private implementation details. This allows ToolOrchestrator
        to access resolved calls without tight coupling to internal storage.
        
        Delegates to ResolvedToolCallStorage for state management.
        
        Args:
            request_id: Request ID for the tool call
            
        Returns:
            Resolved tool call or None if not found
        """
        return self.runtime.resolved_calls.get(request_id)
    
    def remove_resolved_tool_call(self, request_id: str) -> None:
        """
        Remove a resolved tool call from the session.
        
        ENCAPSULATION: Public method to remove resolved tool calls without
        exposing private implementation details. This allows cleanup code
        to remove calls without tight coupling to internal storage.
        
        Delegates to ResolvedToolCallStorage for state management.
        
        Args:
            request_id: Request ID for the tool call to remove
        """
        self.runtime.resolved_calls.remove(request_id)

    def get_result_storage(self):
        """Return session tool-result storage."""
        return self.runtime.tool_results

    def get_pending_tool_result(self, request_id: str) -> Optional["ToolResult"]:
        """Get pending tool result if available."""
        return self.runtime.tool_results.get_pending_result(request_id)

    def remove_pending_tool_result(self, request_id: str) -> bool:
        """Remove pending tool result."""
        return self.runtime.tool_results.remove_pending_result(request_id)

    def create_tool_result_future(self, request_id: str):
        """Create future for a single-tool result."""
        return self.runtime.tool_results.create_result_future(request_id)

    def remove_tool_result_future(self, request_id: str) -> bool:
        """Remove result future tracking for request_id."""
        return self.runtime.tool_results.remove_result_future(request_id)

    def create_bundle_result_future(self, bundle_id: str):
        """Create future for bundle result."""
        return self.runtime.tool_results.create_bundle_future(bundle_id)

    def remove_bundle_result_future(self, bundle_id: str) -> bool:
        """Remove bundle future tracking for bundle_id."""
        return self.runtime.tool_results.remove_bundle_future(bundle_id)

    def get_bundle_result(self, bundle_id: str) -> Optional["ToolResult"]:
        """Get stored bundle result."""
        return self.runtime.tool_results.get_bundled_result(bundle_id)

    def remove_bundle_result(self, bundle_id: str) -> bool:
        """Remove stored bundle result."""
        return self.runtime.tool_results.remove_bundled_result(bundle_id)

    def set_active_ocr_task(self, task: asyncio.Task[Any], screenshot_id: str) -> None:
        """Track active OCR task."""
        self.runtime.screenshot.set_active_ocr_task(task, screenshot_id)

    def get_active_ocr_task(
        self, screenshot_id: Optional[str] = None
    ) -> Optional[asyncio.Task[Any]]:
        """Return active OCR task."""
        return self.runtime.screenshot.get_active_ocr_task(screenshot_id)

    def clear_active_ocr_task(self, task: Optional[asyncio.Task[Any]] = None) -> None:
        """Clear active OCR task tracking."""
        self.runtime.screenshot.clear_active_ocr_task(task)

    def cancel_active_ocr_task(self) -> bool:
        """Cancel active OCR task if running."""
        return self.runtime.screenshot.cancel_active_ocr_task()

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
            SessionConfigRuntime.apply(self, new_cfg)

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
        screenshot_ref: Optional[str],
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
            bundle_id, status, step_results, screenshot, screenshot_ref, system_state, error
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
        await SessionLifecycle.cleanup(self)
