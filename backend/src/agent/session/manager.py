"""
Session Manager for managing user agent sessions.

This module handles the lifecycle of agent sessions, including creation, retrieval,
and cleanup.
"""
import asyncio
import logging
import time
from collections.abc import Iterable
from typing import Any, Dict, Optional

from backend.src.agent.session.session import AgentSession
from backend.src.core.config import AppConfig
from backend.src.core.config.loader import get_default_tts_model_path, load_api_key_for_provider
from backend.src.core.config.runtime import assemble_runtime_config
from backend.src.core.config.subscriptions import ConfigSubscriber
from backend.src.llm.prompts.prompts import get_system_prompt

logger = logging.getLogger(__name__)
_PENDING_STOP_GRACE_SECONDS = 5.0




class SessionManager(ConfigSubscriber):
    """
    Manages the lifecycle of user sessions.
    
    Thread-safe: Uses per-user locks to prevent race conditions during session creation.
    """

    def __init__(
        self,
        config: AppConfig,
        create_agent_session_func,
    ):
        """
        Initialize the session manager.
        
        Args:
            config: Global application configuration
            create_agent_session_func: Function to create agent sessions (takes user_id, config)
        """
        self.config = config
        self.create_agent_session = create_agent_session_func
        self.active_sessions: Dict[str, Dict[Optional[str], AgentSession]] = {}
        # Per-user locks to prevent race conditions during session creation
        self._user_locks: Dict[str, asyncio.Lock] = {}
        # Lock for managing user_locks dictionary itself
        self._locks_lock = asyncio.Lock()
        # Active query task metadata by user_id:
        # task -> (turn_ref, conversation_ref)
        self._active_query_tasks: Dict[
            str, Dict[asyncio.Task[Any], tuple[str, Optional[str]]]
        ] = {}
        # Pending stop-query requests keyed by user_id and optional conversation_ref.
        # Value is expiry timestamp (monotonic seconds).
        self._pending_stop_requests: Dict[str, Dict[Optional[str], float]] = {}
        self._frontend_operating_systems: Dict[str, str] = {}
        self._latest_conversation_refs: Dict[str, Optional[str]] = {}
        self._user_config_overrides: Dict[str, Dict[str, Any]] = {}

    def _get_user_sessions(
        self,
        user_id: str,
    ) -> Dict[Optional[str], AgentSession]:
        """Return a normalized conversation->session map for a user."""
        raw_sessions = self.active_sessions.get(user_id)
        if raw_sessions is None:
            return {}
        if isinstance(raw_sessions, dict):
            return raw_sessions

        normalized_sessions = {None: raw_sessions}
        self.active_sessions[user_id] = normalized_sessions
        return normalized_sessions

    def _iter_user_sessions(
        self,
        user_id: str,
    ) -> Iterable[tuple[Optional[str], AgentSession]]:
        user_sessions = self._get_user_sessions(user_id)
        return tuple(user_sessions.items())

    def _build_effective_config(
        self,
        user_id: str,
        *,
        base_config: Optional[AppConfig] = None,
    ) -> AppConfig:
        config_dict = (base_config or self.config).model_dump()
        overrides = self._user_config_overrides.get(user_id, {})
        for key, value in overrides.items():
            if value is not None:
                config_dict[key] = value
        return self._assemble_runtime_session_config(AppConfig(**config_dict))

    def get_effective_config(self, user_id: str) -> AppConfig:
        """Return the effective user config after applying user-scoped overrides."""
        return self._build_effective_config(user_id)

    def _resolve_default_conversation_ref(
        self,
        user_id: str,
    ) -> Optional[str]:
        user_sessions = self._get_user_sessions(user_id)
        if not user_sessions:
            return None

        latest_conversation_ref = self._latest_conversation_refs.get(user_id)
        if latest_conversation_ref in user_sessions:
            return latest_conversation_ref
        if None in user_sessions:
            return None
        return next(iter(user_sessions.keys()))

    @staticmethod
    def _normalize_optional_conversation_ref(
        conversation_ref: Optional[str],
    ) -> Optional[str]:
        if not isinstance(conversation_ref, str):
            return None
        normalized = conversation_ref.strip()
        return normalized or None

    def _register_pending_stop_request(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> None:
        """Store a short-lived stop intent for races before query registration."""
        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        user_pending = self._pending_stop_requests.setdefault(user_id, {})
        user_pending[normalized_conversation_ref] = (
            time.monotonic() + _PENDING_STOP_GRACE_SECONDS
        )

    def _consume_pending_stop_request(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        """Consume a pending stop request if still valid."""
        user_pending = self._pending_stop_requests.get(user_id)
        if not user_pending:
            return False
        now = time.monotonic()
        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        candidate_keys = [normalized_conversation_ref]
        if normalized_conversation_ref is not None:
            candidate_keys.append(None)
        for pending_key in candidate_keys:
            expires_at = user_pending.get(pending_key)
            if expires_at is None:
                continue
            if expires_at <= now:
                user_pending.pop(pending_key, None)
                continue
            user_pending.pop(pending_key, None)
            if not user_pending:
                self._pending_stop_requests.pop(user_id, None)
            return True
        if not user_pending:
            self._pending_stop_requests.pop(user_id, None)
        return False

    @staticmethod
    def _normalize_frontend_operating_system(
        operating_system: Optional[str],
    ) -> Optional[str]:
        if not isinstance(operating_system, str):
            return None
        normalized = operating_system.strip()
        return normalized or None

    @staticmethod
    def _apply_frontend_operating_system_to_session(
        session: AgentSession,
        operating_system: str,
    ) -> None:
        rendered_prompt = get_system_prompt(operating_system)
        session.prompt_builder.system_prompt = rendered_prompt
        session.history.system_prompt = rendered_prompt

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
        self._frontend_operating_systems[user_id] = normalized_operating_system
        for _, session in self._iter_user_sessions(user_id):
            self._apply_frontend_operating_system_to_session(
                session,
                normalized_operating_system,
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
        if self._consume_pending_stop_request(user_id, normalized_conversation_ref):
            logger.info(
                "[Stop Query] Consumed pending stop request during query registration "
                "(user_id=%s, turn_ref=%s, conversation_ref=%s)",
                user_id,
                turn_ref,
                normalized_conversation_ref,
            )
            return True
        user_tasks = self._active_query_tasks.setdefault(user_id, {})
        user_tasks[task] = (turn_ref, normalized_conversation_ref)
        return False

    def clear_active_query_task(
        self,
        user_id: str,
        task: Optional[asyncio.Task[Any]] = None,
    ) -> None:
        """
        Clear active query tracking for a user.

        If ``task`` is provided, clear only when it matches the tracked task.
        """
        user_tasks = self._active_query_tasks.get(user_id)
        if not user_tasks:
            return

        if task is None:
            self._active_query_tasks.pop(user_id, None)
            return

        user_tasks.pop(task, None)
        if not user_tasks:
            self._active_query_tasks.pop(user_id, None)

    def cancel_active_query_task(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> Optional[tuple[str, Optional[str]]]:
        """
        Cancel the currently active query task for a user.

        Returns:
            Tuple of ``(turn_ref, conversation_ref)`` when a live task was canceled;
            otherwise ``None``.
        """
        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        user_tasks = self._active_query_tasks.get(user_id)
        if not user_tasks:
            self._register_pending_stop_request(user_id, normalized_conversation_ref)
            return None

        cancelled_entries: list[tuple[str, Optional[str]]] = []
        for active_task, (turn_ref, conversation_ref) in list(user_tasks.items()):
            if active_task.done():
                user_tasks.pop(active_task, None)
                continue
            if (
                normalized_conversation_ref is not None
                and conversation_ref != normalized_conversation_ref
            ):
                continue
            active_task.cancel()
            user_tasks.pop(active_task, None)
            cancelled_entries.append((turn_ref, conversation_ref))

        if not user_tasks:
            self._active_query_tasks.pop(user_id, None)

        if not cancelled_entries:
            self._register_pending_stop_request(user_id, normalized_conversation_ref)
            return None
        if normalized_conversation_ref is None:
            self._pending_stop_requests.pop(user_id, None)
        else:
            pending = self._pending_stop_requests.get(user_id)
            if pending is not None:
                pending.pop(normalized_conversation_ref, None)
                if not pending:
                    self._pending_stop_requests.pop(user_id, None)
        return cancelled_entries[-1]

    def has_active_query_task(self, user_id: str) -> bool:
        """Return True when at least one active query task is still running."""
        user_tasks = self._active_query_tasks.get(user_id)
        if not user_tasks:
            return False
        for task in list(user_tasks.keys()):
            if task.done():
                user_tasks.pop(task, None)
                continue
            return True
        if not user_tasks:
            self._active_query_tasks.pop(user_id, None)
        return False

    async def _get_user_lock(self, user_id: str) -> asyncio.Lock:
        """
        Get or create a lock for a specific user.
        
        Thread-safe: Uses _locks_lock to protect the user_locks dictionary.
        
        Args:
            user_id: User identifier
            
        Returns:
            Async lock for this user
        """
        async with self._locks_lock:
            if user_id not in self._user_locks:
                self._user_locks[user_id] = asyncio.Lock()
            return self._user_locks[user_id]

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
        existing_session = self.get_session(
            user_id,
            conversation_ref=normalized_conversation_ref,
        )
        if existing_session is not None:
            return existing_session
        
        # Slow path: need to create session (with lock to prevent races)
        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            # Double-check: another task might have created it while we waited
            existing_session = self.get_session(
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
                operating_system = self._frontend_operating_systems.get(user_id)
                if operating_system:
                    self._apply_frontend_operating_system_to_session(
                        session,
                        operating_system,
                    )
                self.active_sessions.setdefault(user_id, {})[
                    normalized_conversation_ref
                ] = session
                self._latest_conversation_refs[user_id] = normalized_conversation_ref
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
        user_sessions = self._get_user_sessions(user_id)
        if not user_sessions:
            return None

        normalized_conversation_ref = self._normalize_optional_conversation_ref(
            conversation_ref
        )
        if (
            normalized_conversation_ref is not None
            and normalized_conversation_ref in user_sessions
        ):
            return user_sessions[normalized_conversation_ref]

        if normalized_conversation_ref is not None:
            return None

        fallback_conversation_ref = self._resolve_default_conversation_ref(user_id)
        return user_sessions.get(fallback_conversation_ref)

    def get_session_for_request_id(
        self,
        user_id: str,
        request_id: str,
    ) -> Optional[AgentSession]:
        """Resolve the session that owns a frontend tool-result request id."""
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
        """Resolve the session that owns a frontend tool-bundle-result id."""
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
            updates: Validated config updates (frontend-owned fields)
        """
        if not updates:
            return

        overrides = self._user_config_overrides.setdefault(user_id, {})
        changed_override_keys = False
        for key, value in updates.items():
            if value is None:
                continue
            if overrides.get(key) != value:
                overrides[key] = value
                changed_override_keys = True

        user_sessions = self._get_user_sessions(user_id)
        if not user_sessions:
            if not changed_override_keys:
                return
            logger.info(
                "[Session Config] Stored user override without active session (user_id=%s, fields=%s)",
                user_id,
                len(overrides),
            )
            return

        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            user_sessions = self._get_user_sessions(user_id)
            if not user_sessions:
                return

            updated_config = self._build_effective_config(user_id)
            sessions_needing_update = [
                session
                for session in user_sessions.values()
                if session.cfg.model_dump() != updated_config.model_dump()
            ]
            if not sessions_needing_update:
                return

            logger.info(
                "[Session Config] Session updated (user_id=%s, sessions=%s)",
                user_id,
                len(sessions_needing_update),
            )

            for session in sessions_needing_update:
                await session.update_config(updated_config)

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
            user_sessions = self._get_user_sessions(user_id)
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
                    user_sessions.pop(ref, None)

            if user_sessions:
                fallback_ref = self._resolve_default_conversation_ref(user_id)
                self._latest_conversation_refs[user_id] = fallback_ref
                return

            self.active_sessions.pop(user_id, None)
            self._latest_conversation_refs.pop(user_id, None)
            self.clear_active_query_task(user_id)
            self._pending_stop_requests.pop(user_id, None)
            self._frontend_operating_systems.pop(user_id, None)
            self._user_config_overrides.pop(user_id, None)
            
            # Clean up lock if no longer needed
            async with self._locks_lock:
                if user_id in self._user_locks:
                    del self._user_locks[user_id]

    async def update_all_sessions_config(self, config: AppConfig):
        """
        Updates the configuration for all active sessions.
        
        Thread-safe: Acquires per-user locks to prevent race conditions with
        end_session during cleanup. This ensures update_config doesn't run on
        a session that's being destroyed.
        
        Args:
            config: New configuration to apply
        """
        # NOTE: SessionManager is a config subscriber only.
        # Global container/config mutation belongs to ConfigurationService/Container.
        # This method only updates currently active sessions.

        # RACE CONDITION FIX: Acquire user locks before updating to prevent
        # conflicts with end_session which also holds the lock during cleanup
        errors = []
        for user_id, _user_sessions in list(self.active_sessions.items()):
            # Acquire the user lock to serialize with end_session
            user_lock = await self._get_user_lock(user_id)
            async with user_lock:
                # Double-check session still exists (may have been removed while waiting)
                user_sessions = self._get_user_sessions(user_id)
                if not user_sessions:
                    continue
                
                try:
                    updated_config = self._build_effective_config(
                        user_id,
                        base_config=config,
                    )
                    for session in user_sessions.values():
                        await session.update_config(updated_config)
                except Exception as e:
                    logger.error(
                        f"Error updating config for user {user_id}'s session: {e}",
                        exc_info=True,
                    )
                    errors.append((user_id, e))
        
        if errors:
            logger.warning(f"Failed to update config for {len(errors)} session(s)")

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
        await self.update_all_sessions_config(new_config)
    
