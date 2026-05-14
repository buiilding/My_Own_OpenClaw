"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""

from __future__ import annotations

import asyncio
import logging
from typing import (
    TYPE_CHECKING,
    Any,
    AsyncGenerator,
    Callable,
    Dict,
    List,
    Optional,
    Union,
)

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
from backend.src.llm.prompts.prompts import get_system_prompt
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.client_manifest import validate_client_tool_manifest
from backend.src.tools.tool_policy import ToolPolicy

if TYPE_CHECKING:
    from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
    from backend.src.core.infrastructure.bus import EventBus
    from backend.src.core.interfaces.tool import ToolResult
    from backend.src.services.ocr.ocr_service import OcrService
    from backend.src.tools.orchestrator import ToolResultOrchestrator

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
        self.ocr_router = ocr_service
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

    def get_ocr_runtime_state(self):
        """Return mutable OCR runtime state for the current screenshot."""
        return self.runtime.screenshot.ocr

    def get_current_screenshot_id(self) -> Optional[str]:
        """
        Get the ID of the current screenshot.
        """
        return self.runtime.screenshot.get_current_screenshot_id()

    def get_current_capture_meta(self) -> Optional[Dict[str, Any]]:
        """Get normalized capture metadata for the current screenshot."""
        capture_meta = self.runtime.screenshot.get_current_capture_meta()
        return dict(capture_meta) if isinstance(capture_meta, dict) else None

    def set_current_screenshot(
        self,
        screenshot_id: str,
        screenshot_data: str,
        capture_meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Set the current screenshot, discarding any previous screenshot.
        """
        self.runtime.screenshot.set_current_screenshot(
            screenshot_id,
            screenshot_data,
            capture_meta=capture_meta,
        )

    def set_current_ocr_results(self, ocr_results: list[dict]) -> None:
        """
        Set OCR results for the current screenshot.
        """
        self.runtime.screenshot.set_current_ocr_results(ocr_results)

    def set_current_system_state(self, system_state: Optional[Dict[str, Any]]) -> None:
        """
        Store the most recent system_state payload from the frontend.

        Used for runtime observability and tool-context diagnostics.
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

    def register_pending_tool_result(
        self, request_id: str, result: "ToolResult"
    ) -> None:
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

    @staticmethod
    def _normalize_workspace_path(workspace_path: Optional[str]) -> Optional[str]:
        if not isinstance(workspace_path, str):
            return None
        normalized = workspace_path.strip()
        return normalized or None

    @staticmethod
    def _normalize_repo_instruction_messages(
        repo_instruction_messages: Optional[List[Dict[str, str]]],
    ) -> list[Dict[str, str]]:
        return [
            {"role": message["role"], "content": message["content"]}
            for message in (repo_instruction_messages or [])
            if (
                isinstance(message, dict)
                and message.get("role") == "user"
                and isinstance(message.get("content"), str)
                and message["content"].strip()
            )
        ]

    @staticmethod
    def _normalize_client_prompt_layers(
        client_prompt_layers: Optional[List[Dict[str, Any]]],
    ) -> list[Dict[str, Any]]:
        normalized_layers: list[Dict[str, Any]] = []
        for layer in client_prompt_layers or []:
            if not isinstance(layer, dict):
                continue
            layer_id = layer.get("id")
            layer_type = layer.get("type")
            content = layer.get("content")
            priority = layer.get("priority", 100)
            if (
                not isinstance(layer_id, str)
                or not layer_id.strip()
                or not isinstance(layer_type, str)
                or not layer_type.strip()
                or not isinstance(content, str)
                or not content.strip()
            ):
                continue
            try:
                normalized_priority = int(priority)
            except (TypeError, ValueError):
                normalized_priority = 100
            normalized_layers.append(
                {
                    "id": layer_id.strip(),
                    "type": layer_type.strip(),
                    "priority": normalized_priority,
                    "content": content.strip(),
                }
            )
        return normalized_layers

    def _apply_query_prompt_context_locked(
        self,
        *,
        operating_system: Optional[str],
        workspace_path: Optional[str],
        repo_instruction_messages: Optional[List[Dict[str, str]]],
        client_prompt_layers: Optional[List[Dict[str, Any]]],
        system_prompt_override: Optional[str] = None,
    ) -> None:
        if (
            operating_system is None
            and workspace_path is None
            and repo_instruction_messages is None
            and client_prompt_layers is None
            and system_prompt_override is None
        ):
            return
        normalized_workspace_path = self._normalize_workspace_path(workspace_path)
        normalized_repo_instruction_messages = (
            self._normalize_repo_instruction_messages(repo_instruction_messages)
        )
        normalized_client_prompt_layers = self._normalize_client_prompt_layers(
            client_prompt_layers
        )
        rendered_prompt = (
            system_prompt_override.strip()
            if isinstance(system_prompt_override, str)
            and system_prompt_override.strip()
            else get_system_prompt(
                operating_system,
                normalized_workspace_path,
                allowed_coordinate_methods=ToolPolicy.from_config(
                    self.cfg
                ).get_allowed_mouse_coordinate_methods(),
            )
        )

        self.runtime.workspace_path = normalized_workspace_path
        self.runtime.repo_instruction_messages = normalized_repo_instruction_messages
        self.runtime.client_prompt_layers = normalized_client_prompt_layers
        self.prompt_builder.system_prompt = rendered_prompt
        setattr(self.prompt_builder, "workspace_path", normalized_workspace_path)
        setattr(
            self.prompt_builder,
            "repo_instruction_messages",
            list(normalized_repo_instruction_messages),
        )
        setattr(
            self.prompt_builder,
            "client_prompt_layers",
            list(normalized_client_prompt_layers),
        )
        self.history.system_prompt = rendered_prompt

    def _apply_query_runtime_system_state_locked(
        self,
        runtime_system_state: Optional[Dict[str, str]],
    ) -> None:
        if runtime_system_state is None:
            return

        existing_state = self.get_current_system_state() or {}
        merged_state: Dict[str, Any] = dict(existing_state)
        merged_state.update(runtime_system_state)
        self.set_current_system_state(merged_state)

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
        capture_meta: Optional[Dict[str, Any]] = None,
        message_content: Optional[str] = None,
        conversation_ref: Optional[str] = None,
        operating_system: Optional[str] = None,
        workspace_path: Optional[str] = None,
        repo_instruction_messages: Optional[List[Dict[str, str]]] = None,
        client_prompt_layers: Optional[List[Dict[str, Any]]] = None,
        agent_definition: Optional[Any] = None,
        runtime_system_state: Optional[Dict[str, str]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.

        Args:
            query: The user's query text (for reference)
            image_data: Optional base64 image payload(s) for multimodal queries
            capture_meta: Optional capture metadata for image_data[0]
            message_content: Complete message content from frontend (system state + memories + query)
            conversation_ref: Active conversation identity from frontend.
        """
        async with self._lock:
            if conversation_ref:
                self._switch_conversation_ref(conversation_ref)
            definition_runtime = getattr(agent_definition, "runtime", None)
            self._apply_query_prompt_context_locked(
                operating_system=(
                    getattr(definition_runtime, "operating_system", None)
                    if agent_definition is not None
                    else operating_system
                ),
                workspace_path=(
                    getattr(definition_runtime, "workspace_path", None)
                    if agent_definition is not None
                    else workspace_path
                ),
                repo_instruction_messages=repo_instruction_messages,
                client_prompt_layers=(
                    agent_definition.client_prompt_layers()
                    if agent_definition is not None
                    and hasattr(agent_definition, "client_prompt_layers")
                    else client_prompt_layers
                ),
                system_prompt_override=(
                    agent_definition.system_prompt_override()
                    if agent_definition is not None
                    and hasattr(agent_definition, "system_prompt_override")
                    else None
                ),
            )
            if agent_definition is not None:
                self.runtime.agent_definition = agent_definition
                manifest_result = validate_client_tool_manifest(
                    agent_definition.client_tool_manifest()
                    if hasattr(agent_definition, "client_tool_manifest")
                    else None
                )
                self.runtime.client_tool_manifest = manifest_result
                setattr(
                    self.prompt_builder,
                    "client_tool_schemas",
                    list(manifest_result.accepted_tool_schemas),
                )
            self._apply_query_runtime_system_state_locked(runtime_system_state)
            if not self.cfg.selected_model_id:
                yield {
                    "type": "llm-thought",
                    "content": "No model selected. Please select a model in settings.",
                }
                return

            async for event in self.executor.process_query(
                query,
                screenshot=image_data,
                capture_meta=capture_meta,
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
