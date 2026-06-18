"""Session Manager facade for user/session runtime lifecycle."""

import asyncio
import logging
from collections.abc import Iterable
from typing import Any, Callable, Dict, Optional

from backend.src.agent.session.active_query_tracker import (
    ActiveQueryTracker,
    ACTIVE_QUERY_STOP_CONSUMED,
)
from backend.src.agent.session.conversation_refs import (
    normalize_optional_conversation_ref,
)
from backend.src.agent.session.session import AgentSession
from backend.src.agent.session.session_config_service import SessionConfigService
from backend.src.agent.session.session_registry import SessionRegistry
from backend.src.core.config.models import AppConfig
from backend.src.core.config.loader import (
    get_default_tts_model_path,
    load_api_key_for_provider,
)
from backend.src.core.config.runtime import assemble_runtime_config
from backend.src.core.config.subscriptions import ConfigSubscriber
from backend.src.llm.prompts.prompts import PromptManager

logger = logging.getLogger(__name__)


class SessionManager(ConfigSubscriber):
    """
    Manages the lifecycle of user sessions.

    Thread-safe: Uses per-user locks to prevent race conditions during session creation.
    """

    def __init__(
        self,
        config: AppConfig,
        create_agent_session_func,
        provider_health_resolver: Optional[Callable[[AppConfig], Iterable[str]]] = None,
    ):
        """
        Initialize the session manager.

        Args:
            config: Global application configuration
            create_agent_session_func: Function to create agent sessions (takes user_id, config)
        """
        self.config = config
        self.create_agent_session = create_agent_session_func
        self._registry = SessionRegistry()
        self._config_service = SessionConfigService(
            base_config=config,
            registry=self._registry,
            assemble_runtime_session_config=lambda cfg: self._assemble_runtime_session_config(
                cfg
            ),
            render_system_prompt=PromptManager().render_system_prompt,
            provider_health_resolver=provider_health_resolver,
        )
        self._active_queries = ActiveQueryTracker()

    def _get_user_sessions(
        self,
        user_id: str,
    ) -> Dict[Optional[str], AgentSession]:
        """Return a normalized conversation->session map for a user."""
        return self._registry.get_user_sessions(user_id)

    def _iter_user_sessions(
        self,
        user_id: str,
    ) -> Iterable[tuple[Optional[str], AgentSession]]:
        return self._registry.iter_user_sessions(user_id)

    def _build_effective_config(
        self,
        user_id: str,
        *,
        base_config: Optional[AppConfig] = None,
    ) -> AppConfig:
        return self._config_service.build_effective_config(
            user_id,
            base_config=base_config or self.config,
        )

    def get_effective_config(self, user_id: str) -> AppConfig:
        """Return the effective user config after applying user-scoped overrides."""
        return self._config_service.get_effective_config(user_id)

    @staticmethod
    def _normalize_optional_conversation_ref(
        conversation_ref: Optional[str],
    ) -> Optional[str]:
        return normalize_optional_conversation_ref(conversation_ref)

    @staticmethod
    def _normalize_frontend_operating_system(
        operating_system: Optional[str],
    ) -> Optional[str]:
        return SessionConfigService.normalize_frontend_operating_system(
            operating_system
        )

    def set_frontend_operating_system(
        self,
        user_id: str,
        operating_system: Optional[str],
    ) -> None:
        normalized_operating_system = self._normalize_frontend_operating_system(
            operating_system
        )
        if normalized_operating_system is None:
            return
        self._config_service.set_frontend_operating_system(
            user_id,
            normalized_operating_system,
        )

    def get_frontend_operating_system(
        self,
        user_id: str,
    ) -> Optional[str]:
        return self._config_service.frontend_operating_systems.get(user_id)

    def set_client_tool_manifest(
        self,
        user_id: str,
        manifest_result: Any,
    ) -> None:
        self._config_service.set_client_tool_manifest(user_id, manifest_result)

    def set_agent_definition(
        self,
        user_id: str,
        agent_definition: Any,
    ) -> None:
        self._config_service.set_agent_definition(user_id, agent_definition)

    def increment_connection_count(self, user_id: str) -> int:
        return self._registry.increment_connection_count(user_id)

    def decrement_connection_count(self, user_id: str) -> int:
        return self._registry.decrement_connection_count(user_id)

    def get_connection_count(self, user_id: str) -> int:
        return self._registry.get_connection_count(user_id)

    def set_session_workspace_path(
        self,
        user_id: str,
        session: AgentSession,
        workspace_path: Optional[str],
        repo_instruction_messages: Optional[list[dict[str, str]]] = None,
    ) -> None:
        self._config_service.apply_prompt_context_to_session(
            session,
            operating_system=self._config_service.frontend_operating_systems.get(
                user_id
            ),
            workspace_path=workspace_path,
            repo_instruction_messages=repo_instruction_messages,
        )

    def register_active_query_task(
        self,
        user_id: str,
        task: asyncio.Task[Any],
        *,
        turn_ref: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        """Track the currently running query task for a user."""
        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        if self._active_queries.register_active_query_task(
            user_id,
            task,
            turn_ref=turn_ref,
            conversation_ref=normalized_conversation_ref,
        ):
            logger.info(
                "[Stop Query] Consumed pending stop request during query registration "
                "(user_id=%s, turn_ref=%s, conversation_ref=%s)",
                user_id,
                turn_ref,
                normalized_conversation_ref,
            )
            return True
        return False

    def register_active_query_task_with_limits(
        self,
        user_id: str,
        task: asyncio.Task[Any],
        *,
        turn_ref: str,
        conversation_ref: Optional[str] = None,
        max_active_queries_per_user: Optional[int] = None,
        max_active_queries_global: Optional[int] = None,
    ) -> str:
        """Apply active-query capacity limits and register as one tracker operation."""
        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        status = self._active_queries.register_active_query_task_with_limits(
            user_id,
            task,
            turn_ref=turn_ref,
            conversation_ref=normalized_conversation_ref,
            max_active_queries_per_user=max_active_queries_per_user,
            max_active_queries_global=max_active_queries_global,
        )
        if status == ACTIVE_QUERY_STOP_CONSUMED:
            logger.info(
                "[Stop Query] Consumed pending stop request during query registration "
                "(user_id=%s, turn_ref=%s, conversation_ref=%s)",
                user_id,
                turn_ref,
                normalized_conversation_ref,
            )
        return status

    def clear_active_query_task(
        self,
        user_id: str,
        task: Optional[asyncio.Task[Any]] = None,
    ) -> None:
        """
        Clear active query tracking for a user.

        If ``task`` is provided, clear only when it matches the tracked task.
        """
        self._active_queries.clear_active_query_task(user_id, task)

    def cancel_active_query_task(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
        turn_ref: Optional[str] = None,
    ) -> Optional[tuple[str, Optional[str]]]:
        """
        Cancel the currently active query task for a user.

        Returns:
            Tuple of ``(turn_ref, conversation_ref)`` when a live task was canceled;
            otherwise ``None``.
        """
        return self._active_queries.cancel_active_query_task(
            user_id,
            conversation_ref=conversation_ref,
            turn_ref=turn_ref,
        )

    def has_active_query_task(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        """Return True when at least one matching active query task is still running."""
        return self._active_queries.has_active_query_task(user_id, conversation_ref)

    def count_active_query_tasks(self, user_id: Optional[str] = None) -> int:
        return self._active_queries.count_active_query_tasks(user_id)

    async def _get_user_lock(self, user_id: str) -> asyncio.Lock:
        """Get or create the per-user session lock."""
        return await self._registry.get_user_lock(user_id)

    @staticmethod
    def _assemble_runtime_session_config(config: AppConfig) -> AppConfig:
        """Apply shared runtime config policies for session-scoped config creation."""
        return assemble_runtime_config(
            config,
            get_default_tts_model_path=get_default_tts_model_path,
            load_api_key_for_provider=load_api_key_for_provider,
            force_tts_enabled=True,
        )

    async def get_or_create_session(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> AgentSession:
        """
        Retrieves an existing session or creates a new one if it doesn't exist.

        Thread-safe: Uses per-user locks to prevent race conditions when multiple
        async tasks try to create a session for the same user concurrently.

        Args:
            user_id: User identifier

        Returns:
            AgentSession instance for the user

        Raises:
            RuntimeError: If session creation fails
        """
        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        existing_session = self._registry.get_session(
            user_id,
            conversation_ref=normalized_conversation_ref,
        )
        if existing_session is not None:
            return existing_session

        # Slow path: need to create session (with lock to prevent races)
        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            # Double-check: another task might have created it while we waited
            existing_session = self._registry.get_session(
                user_id,
                conversation_ref=normalized_conversation_ref,
            )
            if existing_session is not None:
                return existing_session

            logger.info(
                "Creating new session for user %s (conversation_ref=%s)",
                user_id,
                normalized_conversation_ref,
            )

            try:
                session_config = self._build_effective_config(user_id)

                logger.info(
                    "[Session Config] Final session config (user_id=%s, conversation_ref=%s): "
                    "model_mode=%s, model_provider=%s, selected_model_id=%s, speech_mode_enabled=%s",
                    user_id,
                    normalized_conversation_ref,
                    session_config.model_mode,
                    session_config.model_provider,
                    session_config.selected_model_id,
                    session_config.speech_mode_enabled,
                )

                # Create session with config
                session = self.create_agent_session(
                    user_id=user_id, config=session_config
                )
                session.cfg = session_config
                if normalized_conversation_ref is not None:
                    runtime = getattr(session, "runtime", None)
                    if runtime is not None:
                        runtime.active_conversation_ref = normalized_conversation_ref
                operating_system = self._config_service.frontend_operating_systems.get(
                    user_id
                )
                if operating_system:
                    self._config_service.apply_frontend_operating_system_to_session(
                        session,
                        operating_system,
                    )
                client_tool_manifest = self._config_service.client_tool_manifests.get(
                    user_id
                )
                if client_tool_manifest is not None:
                    self._config_service.apply_client_tool_manifest_to_session(
                        session,
                        client_tool_manifest,
                    )
                agent_definition = self._config_service.agent_definitions.get(user_id)
                if agent_definition is not None:
                    self._config_service.apply_agent_definition_to_session(
                        session,
                        agent_definition,
                    )
                self._registry.store_session(
                    user_id,
                    session,
                    conversation_ref=normalized_conversation_ref,
                )
                logger.info(
                    "Successfully created session for user %s (conversation_ref=%s)",
                    user_id,
                    normalized_conversation_ref,
                )
                return session
            except Exception as e:
                logger.error(
                    "Error during session creation for user %s (conversation_ref=%s): %s",
                    user_id,
                    normalized_conversation_ref,
                    e,
                    exc_info=True,
                )
                raise

    def get_session(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> Optional[AgentSession]:
        """
        Retrieves an active session for a user.

        Args:
            user_id: User identifier

        Returns:
            AgentSession if exists, None otherwise
        """
        return self._registry.get_session(user_id, conversation_ref)

    def get_session_for_request_id(
        self,
        user_id: str,
        request_id: str,
    ) -> Optional[AgentSession]:
        """Resolve the session that owns a local-runtime tool-result request id."""
        for _, session in self._iter_user_sessions(user_id):
            if session.get_resolved_tool_call(request_id) is not None:
                return session
            if session.get_pending_tool_result(request_id) is not None:
                return session
            if session.get_result_storage().get_result_future(request_id) is not None:
                return session
        return None

    def get_session_for_bundle_id(
        self,
        user_id: str,
        bundle_id: str,
    ) -> Optional[AgentSession]:
        """Resolve the session that owns a local-runtime tool-bundle-result id."""
        for _, session in self._iter_user_sessions(user_id):
            result_storage = session.get_result_storage()
            if result_storage.get_bundled_result(bundle_id) is not None:
                return session
            if result_storage.get_bundle_future(bundle_id) is not None:
                return session
        return None

    async def update_session_config(
        self,
        user_id: str,
        updates: Dict[str, Any],
    ) -> None:
        """
        Update a user's session config with validated settings.

        Args:
            user_id: User identifier
            updates: Validated client settings patch fields
        """
        if not updates:
            return

        await self._config_service.update_session_config(user_id, updates)

    async def end_session(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> None:
        """
        Ends a user's session and performs cleanup.

        Thread-safe: Uses per-user lock to prevent races during cleanup.

        Args:
            user_id: User identifier
        """
        user_sessions = self._get_user_sessions(user_id)
        if not user_sessions:
            logger.debug(f"No active session for user {user_id}")
            return

        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            # Double-check after acquiring lock
            user_sessions = self._registry.get_user_sessions(user_id)
            if not user_sessions:
                return

            normalized_conversation_ref = self._normalize_optional_conversation_ref(
                conversation_ref
            )
            if (
                normalized_conversation_ref is not None
                and normalized_conversation_ref not in user_sessions
            ):
                logger.debug(
                    "No active session for user %s conversation %s",
                    user_id,
                    normalized_conversation_ref,
                )
                return

            refs_to_end = (
                [normalized_conversation_ref]
                if conversation_ref is not None
                else list(user_sessions.keys())
            )

            logger.info(
                "Ending session(s) for user %s (conversation_refs=%s)",
                user_id,
                refs_to_end,
            )

            for ref in refs_to_end:
                session = user_sessions.get(ref)
                if session is None:
                    continue
                try:
                    # RESOURCE MANAGEMENT: Explicitly cleanup session resources
                    await session.cleanup()
                except Exception as e:
                    logger.error(
                        "Error during session cleanup for user %s (conversation_ref=%s): %s",
                        user_id,
                        ref,
                        e,
                        exc_info=True,
                    )
                finally:
                    self._registry.remove_session(user_id, ref)

            if self._registry.get_user_sessions(user_id):
                return

            self._registry.clear_user(user_id)
            self._active_queries.clear_user_state(user_id)
            self._config_service.clear_user_state(user_id)
            await self._registry.remove_user_lock(user_id)

    async def update_all_sessions_config(self, config: AppConfig):
        """Update active sessions after a global config change."""
        # NOTE: SessionManager is a config subscriber only.
        # Global container/config mutation belongs to ConfigurationService/Container.
        # This method only updates currently active sessions.

        self.config = config
        await self._config_service.update_all_sessions_config(config)

    async def on_config_changed(
        self, old_config: AppConfig, new_config: AppConfig
    ) -> None:
        """
        Handle configuration changes (implements ConfigSubscriber protocol).

        This method is called automatically by ConfigurationService when config changes.

        Args:
            old_config: Previous configuration
            new_config: New configuration
        """
        logger.info("SessionManager received config change notification")
        self._config_service.set_base_config(new_config)
        await self.update_all_sessions_config(new_config)
