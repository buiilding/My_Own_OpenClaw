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

from backend.src.agent.session.capability_application import (
    apply_agent_definition_tool_policy_to_session,
    apply_client_capability_to_session,
    capability_revision_from_agent_definition,
    client_manifest_source_counts,
    policy_rejected_client_tool_sample,
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
from backend.src.agent.session.prompt_layers import (
    prompt_layer_id_sample,
    prompt_layer_rejected_reason_sample,
    validate_client_prompt_layers,
)
from backend.src.core.config.models import AppConfig
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ThinkingEvent,
    TraceEvent,
)
from backend.src.llm.client import LLMClient, get_llm_client
from backend.src.llm.prompts.prompts import (
    PromptManager,
    render_contextual_system_prompt,
)
from backend.src.tools.client_manifest import validate_client_tool_manifest
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.tool_policy import ToolPolicy

if TYPE_CHECKING:
    from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
    from backend.src.core.inference.ocr_router import OcrRouter
    from backend.src.core.infrastructure.bus import EventBus
    from backend.src.core.interfaces.tool import ToolResult
    from backend.src.tools.orchestrator import ToolResultOrchestrator

logger = logging.getLogger(__name__)

_CLIENT_TOOL_TRACE_SAMPLE_LIMIT = 8
_CLIENT_TOOL_TRACE_REASON_LIMIT = 240


def _count_raw_client_manifest_tools(raw_manifest: Any) -> int:
    raw_tools = (
        raw_manifest.get("tools", raw_manifest)
        if isinstance(raw_manifest, dict)
        else raw_manifest
    )
    return len(raw_tools) if isinstance(raw_tools, list) else 0


def _client_manifest_tool_name_sample(names: List[str]) -> List[str]:
    return names[:_CLIENT_TOOL_TRACE_SAMPLE_LIMIT]


def _client_manifest_rejected_reason_sample(
    rejected: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    sample: List[Dict[str, str]] = []
    for item in rejected[:_CLIENT_TOOL_TRACE_SAMPLE_LIMIT]:
        name = item.get("name") if isinstance(item, dict) else ""
        reason = item.get("reason") if isinstance(item, dict) else ""
        if len(reason) > _CLIENT_TOOL_TRACE_REASON_LIMIT:
            reason = f"{reason[:_CLIENT_TOOL_TRACE_REASON_LIMIT]}..."
        sample.append({"name": name or "", "reason": reason or ""})
    return sample


def _agent_definition_capability_revision(agent_definition: Any) -> Optional[str]:
    return capability_revision_from_agent_definition(agent_definition)


def _empty_capability_source_counts() -> Dict[str, int]:
    return {
        "builtin": 0,
        "client": 0,
        "mcp": 0,
        "plugin": 0,
        "backend_remote": 0,
    }


def _count_skill_prompt_layers(layers: Any) -> int:
    if not isinstance(layers, list):
        return 0
    count = 0
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        layer_type = layer.get("type")
        source_path = layer.get("source_path")
        if isinstance(layer_type, str) and "skill" in layer_type.lower():
            count += 1
            continue
        if isinstance(source_path, str) and source_path.startswith("skills/"):
            count += 1
    return count


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
        ocr_router: Optional["OcrRouter"],
        metrics_service: Any,
        llm_client: Optional[LLMClient] = None,
        llm_client_factory: Optional[Callable[[AppConfig], LLMClient]] = None,
        tool_orchestrator: Optional[ToolResultOrchestrator] = None,
        event_bus: Optional[EventBus] = None,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
    ) -> None:
        """
        Initialize the agent session.

        Args:
            cfg: Application configuration object
            tool_registry: Registry containing all available tools
            ocr_router: OCR router instance (optional)
            llm_client: LLM client instance (auto-created if None)
            llm_client_factory: Optional factory for creating LLM clients (used on updates)
            tool_orchestrator: Tool orchestration instance (auto-created if None)
            event_bus: EventBus instance for event communication (required)
            user_id: User identifier for session ownership
            session_id: Session identifier (auto-generated if None)
        """
        self.cfg = cfg
        self.metrics_service = metrics_service
        self.llm_client_factory = llm_client_factory or get_llm_client
        self.llm_client: LLMClient = llm_client or self.llm_client_factory(self.cfg)
        self._lock = asyncio.Lock()

        init_tooling(self, tool_registry, tool_orchestrator)
        init_prompt_and_history(self, metrics_service)
        init_compaction_engine(self)
        init_identity(self, user_id, session_id)
        init_event_bus(self, event_bus)
        self.ocr_router = ocr_router
        init_executor(self)
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
        Store the most recent system_state payload from the SDK/local runtime.

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
        """Return the last client runtime system_state payload, if any."""
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
        # Durable memory storage is coordinated outside the hosted session runtime.

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

    async def try_update_config(self, new_cfg: AppConfig) -> bool:
        """
        Apply config only when the session lock is immediately available.

        Settings websocket handlers must not wait behind a long-running query:
        those waiting handlers count against the per-connection task pool that
        tool-result messages need to unblock the query.
        """
        if self._lock.locked():
            return False
        await self._lock.acquire()
        try:
            SessionConfigRuntime.apply(self, new_cfg)
            return True
        finally:
            self._lock.release()

    def _switch_conversation_ref(self, conversation_ref: str) -> None:
        """Switch active conversation and clear history when thread changes."""
        if self.runtime.active_conversation_ref == conversation_ref:
            return
        self.runtime.active_conversation_ref = conversation_ref
        self.runtime.active_turn_ref = None
        self.history.clear()

    @staticmethod
    def _normalize_optional_runtime_ref(value: Optional[str]) -> Optional[str]:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized or None

    def set_active_stream_context(
        self,
        *,
        turn_ref: str,
        conversation_ref: Optional[str],
        revision_id: Optional[str] = None,
    ) -> None:
        """Record the authoritative stream context for tool-result echoes."""
        normalized_turn_ref = self._normalize_optional_runtime_ref(turn_ref)
        if normalized_turn_ref is None:
            return
        normalized_conversation_ref = self._normalize_optional_runtime_ref(
            conversation_ref
        )
        self.runtime.active_turn_ref = normalized_turn_ref
        self.runtime.active_revision_id = self._normalize_optional_runtime_ref(
            revision_id
        )
        if normalized_conversation_ref is not None:
            self.runtime.active_conversation_ref = normalized_conversation_ref

    def clear_active_stream_context(self, *, turn_ref: Optional[str] = None) -> None:
        """Clear the active stream context when the matching query finishes."""
        normalized_turn_ref = self._normalize_optional_runtime_ref(turn_ref)
        if (
            normalized_turn_ref is not None
            and self.runtime.active_turn_ref != normalized_turn_ref
        ):
            return
        self.runtime.active_turn_ref = None

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
        return validate_client_prompt_layers(client_prompt_layers).accepted

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
            render_contextual_system_prompt(
                system_prompt_override,
                operating_system,
                normalized_workspace_path,
            )
            if isinstance(system_prompt_override, str)
            and system_prompt_override.strip()
            else PromptManager().render_system_prompt(
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
        """Replace in-memory history with SDK-projected snapshot entries."""
        async with self._lock:
            self.runtime.active_conversation_ref = conversation_ref
            self.history.replace_with_entries(entries)

    async def install_model_history(
        self,
        *,
        conversation_ref: str,
        revision_id: str,
        entries: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
    ) -> None:
        """Replace in-memory history with backend-normalized model-history rows."""
        async with self._lock:
            self.runtime.active_conversation_ref = conversation_ref
            self.runtime.active_revision_id = revision_id
            self.history.replace_with_entries(entries)
            if system_prompt:
                self.history.system_prompt = system_prompt

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
        image_refs: Optional[List[str]] = None,
        capture_meta: Optional[Dict[str, Any]] = None,
        message_content: Optional[str] = None,
        conversation_ref: Optional[str] = None,
        revision_id: Optional[str] = None,
        operating_system: Optional[str] = None,
        workspace_path: Optional[str] = None,
        repo_instruction_messages: Optional[List[Dict[str, str]]] = None,
        client_prompt_layers: Optional[List[Dict[str, Any]]] = None,
        agent_definition: Optional[Any] = None,
        runtime_system_state: Optional[Dict[str, str]] = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.

        Args:
            query: The user's query text (for reference)
            image_data: Optional inline base64 image payload(s) for multimodal queries
            image_refs: Optional artifact refs for prompt-time image projection
            capture_meta: Optional capture metadata for image_data[0]
            message_content: Backend-rendered model-visible user message content.
            conversation_ref: Active conversation identity from SDK/client transport.
        """
        async with self._lock:
            if conversation_ref:
                self._switch_conversation_ref(conversation_ref)
            self.runtime.active_revision_id = self._normalize_optional_runtime_ref(
                revision_id
            )
            definition_runtime = getattr(agent_definition, "runtime", None)
            resolved_operating_system = (
                getattr(definition_runtime, "operating_system", None)
                if agent_definition is not None
                else operating_system
            )
            resolved_workspace_path = (
                getattr(definition_runtime, "workspace_path", None)
                if agent_definition is not None
                else workspace_path
            )
            resolved_client_prompt_layers = (
                agent_definition.client_prompt_layers()
                if agent_definition is not None
                and hasattr(agent_definition, "client_prompt_layers")
                else client_prompt_layers
            )
            resolved_system_prompt_override = (
                agent_definition.system_prompt_override()
                if agent_definition is not None
                and hasattr(agent_definition, "system_prompt_override")
                else None
            )
            capability_trace_payload: Optional[Dict[str, Any]] = None
            prompt_layer_trace_payload: Optional[Dict[str, Any]] = None
            capability_revision = (
                _agent_definition_capability_revision(agent_definition)
                if agent_definition is not None
                else None
            )
            raw_manifest: Any = None
            raw_tool_count = 0
            manifest_result: Any = None
            prompt_layer_validation: Any = None
            raw_prompt_layer_count = (
                len(resolved_client_prompt_layers)
                if isinstance(resolved_client_prompt_layers, list)
                else 0
            )
            raw_skill_prompt_layer_count = _count_skill_prompt_layers(
                resolved_client_prompt_layers
            )
            if agent_definition is not None:
                self.runtime.agent_definition = agent_definition
                raw_manifest = (
                    agent_definition.client_tool_manifest()
                    if hasattr(agent_definition, "client_tool_manifest")
                    else None
                )
                raw_tool_count = _count_raw_client_manifest_tools(raw_manifest)
                if raw_manifest is None:
                    apply_agent_definition_tool_policy_to_session(
                        self,
                        agent_definition,
                    )
                    yield TraceEvent(
                        path="client_tool_manifest.validate",
                        stage="validate",
                        status="skipped",
                        runtime="backend",
                        data={
                            "hasAgentDefinition": True,
                            "hasClientManifest": False,
                            "rawToolCount": 0,
                            "capabilityRevision": capability_revision,
                        },
                    )
                else:
                    manifest_result = validate_client_tool_manifest(raw_manifest)
                    accepted_tool_names = manifest_result.accepted_tool_names
                    rejected_reasons = _client_manifest_rejected_reason_sample(
                        list(manifest_result.rejected)
                    )
                    yield TraceEvent(
                        path="client_tool_manifest.validate",
                        stage="validate",
                        status="succeeded",
                        runtime="backend",
                        data={
                            "hasAgentDefinition": True,
                            "hasClientManifest": True,
                            "rawToolCount": raw_tool_count,
                            "capabilityRevision": capability_revision,
                            "acceptedCount": len(manifest_result.accepted),
                            "rejectedCount": len(manifest_result.rejected),
                            "acceptedToolNameSample": _client_manifest_tool_name_sample(
                                accepted_tool_names
                            ),
                            "rejectedReasonSample": rejected_reasons,
                        },
                    )
                    capability_counts = apply_client_capability_to_session(
                        self,
                        manifest_result,
                        agent_definition=agent_definition,
                    )
                    capability_trace_payload = {
                        "acceptedCount": len(manifest_result.accepted),
                        "rejectedCount": len(manifest_result.rejected),
                        "capabilityRevision": capability_revision,
                        "runtimeAcceptedToolCount": len(
                            self.runtime.client_tool_manifest.accepted
                        ),
                        "promptBuilderClientToolCount": capability_counts[
                            "prompt_builder_client_tool_count"
                        ],
                        "effectiveAvailableToolCount": capability_counts[
                            "effective_available_tool_count"
                        ],
                        "policyAllowedClientToolCount": capability_counts[
                            "policy_allowed_client_tool_count"
                        ],
                        "acceptedToolNameSample": _client_manifest_tool_name_sample(
                            accepted_tool_names
                        ),
                        "sourceCounts": client_manifest_source_counts(manifest_result),
                    }
            if (
                resolved_operating_system is not None
                or resolved_workspace_path is not None
                or repo_instruction_messages is not None
                or resolved_client_prompt_layers is not None
                or resolved_system_prompt_override is not None
            ):
                if resolved_client_prompt_layers is not None:
                    prompt_layer_validation = validate_client_prompt_layers(
                        resolved_client_prompt_layers
                    )
                    yield TraceEvent(
                        path="client_prompt_layers.validate",
                        stage="validate",
                        status="succeeded",
                        runtime="backend",
                        data={
                            "rawLayerCount": len(resolved_client_prompt_layers),
                            "capabilityRevision": capability_revision,
                            "acceptedCount": len(prompt_layer_validation.accepted),
                            "rejectedCount": len(prompt_layer_validation.rejected),
                            "acceptedLayerIdSample": prompt_layer_id_sample(
                                prompt_layer_validation.accepted
                            ),
                            "rejectedReasonSample": prompt_layer_rejected_reason_sample(
                                prompt_layer_validation.rejected
                            ),
                        },
                    )
                    resolved_client_prompt_layers = prompt_layer_validation.accepted
                    prompt_layer_trace_payload = {
                        "acceptedCount": len(prompt_layer_validation.accepted),
                        "rejectedCount": len(prompt_layer_validation.rejected),
                        "capabilityRevision": capability_revision,
                        "acceptedLayerIdSample": prompt_layer_id_sample(
                            prompt_layer_validation.accepted
                        ),
                    }
                self._apply_query_prompt_context_locked(
                    operating_system=resolved_operating_system,
                    workspace_path=resolved_workspace_path,
                    repo_instruction_messages=repo_instruction_messages,
                    client_prompt_layers=resolved_client_prompt_layers,
                    system_prompt_override=resolved_system_prompt_override,
                )
                if prompt_layer_trace_payload is not None:
                    prompt_layer_trace_payload.update(
                        {
                            "runtimePromptLayerCount": len(
                                getattr(self.runtime, "client_prompt_layers", [])
                            ),
                            "promptBuilderPromptLayerCount": len(
                                getattr(
                                    self.prompt_builder,
                                    "client_prompt_layers",
                                    [],
                                )
                            ),
                        }
                    )
            should_emit_capability_aggregate = agent_definition is not None and (
                raw_manifest is not None or raw_prompt_layer_count > 0
            )
            accepted_tool_count = (
                len(manifest_result.accepted) if manifest_result is not None else 0
            )
            rejected_tool_count = (
                len(manifest_result.rejected) if manifest_result is not None else 0
            )
            accepted_prompt_layer_count = (
                len(prompt_layer_validation.accepted)
                if prompt_layer_validation is not None
                else 0
            )
            rejected_prompt_layer_count = (
                len(prompt_layer_validation.rejected)
                if prompt_layer_validation is not None
                else 0
            )
            accepted_skill_prompt_layer_count = _count_skill_prompt_layers(
                prompt_layer_validation.accepted
                if prompt_layer_validation is not None
                else []
            )
            accepted_source_counts = (
                client_manifest_source_counts(manifest_result)
                if manifest_result is not None
                else _empty_capability_source_counts()
            )
            logger.info(
                "[Turn Tool Counts] stage=backend_received has_agent_definition=%s "
                "raw_tools=%s accepted_tools=%s rejected_tools=%s "
                "client_tools=%s mcp_tools=%s plugin_tools=%s backend_remote_tools=%s "
                "raw_prompt_layers=%s accepted_prompt_layers=%s "
                "raw_skill_layers=%s accepted_skill_layers=%s capability_revision=%s",
                agent_definition is not None,
                raw_tool_count,
                accepted_tool_count,
                rejected_tool_count,
                accepted_source_counts.get("client", 0),
                accepted_source_counts.get("mcp", 0),
                accepted_source_counts.get("plugin", 0),
                accepted_source_counts.get("backend_remote", 0),
                raw_prompt_layer_count,
                accepted_prompt_layer_count,
                raw_skill_prompt_layer_count,
                accepted_skill_prompt_layer_count,
                capability_revision,
            )
            if should_emit_capability_aggregate:
                yield TraceEvent(
                    path="client_capability_manifest.validate",
                    stage="validate",
                    status="succeeded",
                    runtime="backend",
                    data={
                        "capabilityRevision": capability_revision,
                        "rawToolCount": raw_tool_count,
                        "acceptedToolCount": accepted_tool_count,
                        "rejectedToolCount": rejected_tool_count,
                        "rawPromptLayerCount": raw_prompt_layer_count,
                        "acceptedPromptLayerCount": accepted_prompt_layer_count,
                        "rejectedPromptLayerCount": rejected_prompt_layer_count,
                        "rawSkillPromptLayerCount": raw_skill_prompt_layer_count,
                        "acceptedSkillPromptLayerCount": accepted_skill_prompt_layer_count,
                        "sourceCounts": accepted_source_counts,
                        "mcpToolCount": accepted_source_counts.get("mcp", 0),
                        "pluginToolCount": accepted_source_counts.get("plugin", 0),
                        "clientToolCount": accepted_source_counts.get("client", 0),
                        "backendRemoteToolCount": accepted_source_counts.get(
                            "backend_remote", 0
                        ),
                    },
                )
            if capability_trace_payload is not None:
                yield TraceEvent(
                    path="client_tool_manifest.apply",
                    stage="apply",
                    status="succeeded",
                    runtime="backend",
                    data=capability_trace_payload,
                )
                yield TraceEvent(
                    path="client_capability_manifest.policy",
                    stage="policy",
                    status="succeeded",
                    runtime="backend",
                    data={
                        "capabilityRevision": capability_revision,
                        "policyInputCount": capability_trace_payload["acceptedCount"],
                        "policyAllowedCount": capability_trace_payload[
                            "policyAllowedClientToolCount"
                        ],
                        "policyRejectedCount": max(
                            0,
                            capability_trace_payload["acceptedCount"]
                            - capability_trace_payload["policyAllowedClientToolCount"],
                        ),
                        "rejectedByPolicySample": policy_rejected_client_tool_sample(
                            manifest_result,
                            self.prompt_builder,
                        ),
                    },
                )
            if prompt_layer_trace_payload is not None:
                yield TraceEvent(
                    path="client_prompt_layers.apply",
                    stage="apply",
                    status="succeeded",
                    runtime="backend",
                    data=prompt_layer_trace_payload,
                )
            if should_emit_capability_aggregate:
                yield TraceEvent(
                    path="client_capability_manifest.apply",
                    stage="apply",
                    status="succeeded",
                    runtime="backend",
                    data={
                        "capabilityRevision": capability_revision,
                        "acceptedToolCount": accepted_tool_count,
                        "acceptedPromptLayerCount": accepted_prompt_layer_count,
                        "effectiveAvailableToolCount": (
                            capability_trace_payload or {}
                        ).get("effectiveAvailableToolCount", 0),
                        "toolPolicyRebuilt": capability_trace_payload is not None,
                        "promptBuilderClientToolCount": (
                            capability_trace_payload or {}
                        ).get("promptBuilderClientToolCount", 0),
                        "promptBuilderPromptLayerCount": (
                            prompt_layer_trace_payload or {}
                        ).get("promptBuilderPromptLayerCount", 0),
                    },
                )
            self._apply_query_runtime_system_state_locked(runtime_system_state)
            if not self.cfg.selected_model_id:
                yield ThinkingEvent(
                    content="No model selected. Please select a model in settings."
                )
                return

            async for event in self.executor.process_query(
                query,
                screenshot=image_data,
                screenshot_refs=image_refs,
                capture_meta=capture_meta,
                message_content=message_content,
            ):
                yield event

    async def process_local_tool_result(
        self,
        **tool_result_payload: Any,
    ) -> Any:
        """Forward tool-result payload to ToolResultHandler."""
        return await self.tool_result_handler.process_local_tool_result(
            **tool_result_payload
        )

    async def process_local_tool_bundle_result(
        self,
        **bundle_result_payload: Any,
    ) -> Any:
        """Forward tool-bundle-result payload to ToolResultHandler."""
        return await self.tool_result_handler.process_local_tool_bundle_result(
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
