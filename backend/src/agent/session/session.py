"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, Optional, List, Callable, Union

from backend.src.agent.session.config_runtime import SessionConfigRuntime
from backend.src.agent.session.initializer import (
    init_compaction_engine,
    init_event_bus,
    init_executor,
    init_identity,
    init_prompt_and_history,
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
    from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
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
        metrics_service: Optional[Any] = None,
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
        init_prompt_and_history(self, metrics_service)
        init_compaction_engine(self)
        init_identity(self, user_id, session_id)
        init_event_bus(self, event_bus)
        self.ocr_service = ocr_service
        init_executor(self, self.ocr_service)
        init_session_state(self)

        # Initialize tool result handler after executor creation.
        init_tool_result_handler(self)

        subscribe_events(self)

    def get_screenshot(self) -> Optional[str]:
        """
        Get current screenshot data.
        """
        return self.runtime.screenshot.get_screenshot()

    def get_ocr_results(self) -> Optional[list[dict]]:
        """
        Get OCR results for current screenshot.
        """
        return self.runtime.screenshot.get_ocr_results()

    def get_current_screenshot_id(self) -> Optional[str]:
        """
        Get the ID of the current screenshot.
        """
        return self.runtime.screenshot.get_current_screenshot_id()

    def set_current_screenshot(self, screenshot_id: str, screenshot_data: str) -> None:
        """
        Set the current screenshot, discarding any previous screenshot.
        """
        self.runtime.screenshot.set_current_screenshot(screenshot_id, screenshot_data)

    def set_current_ocr_results(self, ocr_results: list[dict]) -> None:
        """
        Set OCR results for the current screenshot.
        """
        self.runtime.screenshot.set_current_ocr_results(ocr_results)

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

    def get_result_storage(self) -> "ToolResultStorage":
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

    def register_background_task(self, task: asyncio.Task[Any]) -> asyncio.Task[Any]:
        """Register session-scoped background task for lifecycle cleanup."""
        self.runtime.register_background_task(task)
        return task

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

    def _switch_conversation_ref(self, conversation_ref: str) -> None:
        """Switch active conversation and clear history when thread changes."""
        if self.runtime.active_conversation_ref == conversation_ref:
            return
        self.runtime.active_conversation_ref = conversation_ref
        self.history.clear()

    async def rehydrate_conversation(
        self,
        conversation_ref: str,
        entries: List[Dict[str, Any]],
    ) -> None:
        """Replace in-memory history with frontend-provided transcript snapshot."""
        async with self._lock:
            self.runtime.active_conversation_ref = conversation_ref
            self.history.replace_with_entries(entries)

    async def run_history_compaction(
        self,
        *,
        reason: str,
        force: bool = False,
    ):
        """Evaluate and execute history compaction under session lock."""
        async with self._lock:
            decision = self.compaction_engine.evaluate(reason=reason, force=force)
            result = await self.compaction_engine.compact(
                reason=reason,
                decision=decision,
            )
            return decision, result

    async def process_query(
        self, 
        query: str, 
        image_data: Optional[Union[str, List[str]]] = None,
        message_content: Optional[str] = None,
        conversation_ref: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text (for reference)
            image_data: Optional base64 image payload(s) for multimodal queries
            message_content: Complete message content from frontend (system state + memories + query)
            conversation_ref: Active conversation identity from frontend.
        """
        async with self._lock:
            if conversation_ref:
                self._switch_conversation_ref(conversation_ref)
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
        **tool_result_payload: Any,
    ) -> None:
        """Forward tool-result payload to ToolResultHandler."""
        await self.tool_result_handler.process_frontend_tool_result(
            **tool_result_payload
        )
    
    async def process_frontend_tool_bundle_result(
        self,
        **bundle_result_payload: Any,
    ) -> None:
        """Forward tool-bundle-result payload to ToolResultHandler."""
        await self.tool_result_handler.process_frontend_tool_bundle_result(
            **bundle_result_payload
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
