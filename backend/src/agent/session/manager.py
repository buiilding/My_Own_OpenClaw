"""
Session Manager for managing user agent sessions.

This module handles the lifecycle of agent sessions, including creation, retrieval,
and cleanup.
"""
import asyncio
import logging
from typing import Any, Dict, Optional

from backend.src.agent.session.session import AgentSession
from backend.src.core.config import AppConfig
from backend.src.core.config.loader import get_default_tts_model_path, load_api_key_for_provider
from backend.src.core.config.runtime import assemble_runtime_config
from backend.src.core.config.subscriptions import ConfigSubscriber

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
    ):
        """
        Initialize the session manager.
        
        Args:
            config: Global application configuration
            create_agent_session_func: Function to create agent sessions (takes user_id, config)
        """
        self.config = config
        self.create_agent_session = create_agent_session_func
        self.active_sessions: Dict[str, AgentSession] = {}
        # Per-user locks to prevent race conditions during session creation
        self._user_locks: Dict[str, asyncio.Lock] = {}
        # Lock for managing user_locks dictionary itself
        self._locks_lock = asyncio.Lock()
        # Active query task metadata by user_id: (task, turn_ref, conversation_ref)
        self._active_query_tasks: Dict[
            str, tuple[asyncio.Task[Any], str, Optional[str]]
        ] = {}

    def register_active_query_task(
        self,
        user_id: str,
        task: asyncio.Task[Any],
        *,
        turn_ref: str,
        conversation_ref: Optional[str] = None,
    ) -> None:
        """Track the currently running query task for a user."""
        self._active_query_tasks[user_id] = (task, turn_ref, conversation_ref)

    def clear_active_query_task(
        self,
        user_id: str,
        task: Optional[asyncio.Task[Any]] = None,
    ) -> None:
        """
        Clear active query tracking for a user.

        If ``task`` is provided, clear only when it matches the tracked task.
        """
        active_entry = self._active_query_tasks.get(user_id)
        if active_entry is None:
            return

        active_task, _, _ = active_entry
        if task is not None and active_task is not task:
            return

        self._active_query_tasks.pop(user_id, None)

    def cancel_active_query_task(
        self,
        user_id: str,
    ) -> Optional[tuple[str, Optional[str]]]:
        """
        Cancel the currently active query task for a user.

        Returns:
            Tuple of ``(turn_ref, conversation_ref)`` when a live task was canceled;
            otherwise ``None``.
        """
        active_entry = self._active_query_tasks.get(user_id)
        if active_entry is None:
            return None

        active_task, turn_ref, conversation_ref = active_entry
        if active_task.done():
            self._active_query_tasks.pop(user_id, None)
            return None

        active_task.cancel()
        return turn_ref, conversation_ref

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
        if user_id in self.active_sessions:
            return self.active_sessions[user_id]
        
        # Slow path: need to create session (with lock to prevent races)
        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            # Double-check: another task might have created it while we waited
            if user_id in self.active_sessions:
                return self.active_sessions[user_id]
            
            logger.info(f"Creating new session for user {user_id}")
            
            try:
                # Start with global config
                config_dict = self.config.model_dump()
                
                logger.debug(
                    f"[Session Config] Starting with global config (user_id={user_id}): "
                    f"model_mode={config_dict.get('model_mode')}, "
                    f"model_provider={config_dict.get('model_provider')}, "
                    f"selected_model_id={config_dict.get('selected_model_id')}"
                )

                session_config = self._assemble_runtime_session_config(
                    AppConfig(**config_dict)
                )
                
                logger.info(
                    f"[Session Config] Final session config (user_id={user_id}): "
                    f"model_mode={session_config.model_mode}, "
                    f"model_provider={session_config.model_provider}, "
                    f"selected_model_id={session_config.selected_model_id}, "
                    f"speech_mode_enabled={session_config.speech_mode_enabled}"
                )
                
                # Create session with config
                session = self.create_agent_session(
                    user_id=user_id, config=session_config
                )
                self.active_sessions[user_id] = session
                logger.info(f"Successfully created session for user {user_id}")
                return session
            except Exception as e:
                logger.error(
                    f"Error during session creation for user {user_id}: {e}",
                    exc_info=True,
                )
                raise

    def get_session(self, user_id: str) -> Optional[AgentSession]:
        """
        Retrieves an active session for a user.
        
        Args:
            user_id: User identifier
            
        Returns:
            AgentSession if exists, None otherwise
        """
        return self.active_sessions.get(user_id)

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

        await self.get_or_create_session(user_id)
        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            if user_id not in self.active_sessions:
                return

            session = self.active_sessions[user_id]
            config_dict = session.cfg.model_dump()
            changes = []

            for key, value in updates.items():
                if value is not None:
                    old_value = config_dict.get(key)
                    config_dict[key] = value
                    if old_value != value:
                        changes.append((key, old_value, value))

            if not changes:
                return

            updated_config = self._assemble_runtime_session_config(
                AppConfig(**config_dict)
            )

            logger.info(
                f"[Session Config] Session updated (user_id={user_id}, fields={len(changes)})"
            )

            await session.update_config(updated_config)

    async def end_session(self, user_id: str):
        """
        Ends a user's session and performs cleanup.
        
        Thread-safe: Uses per-user lock to prevent races during cleanup.
        
        Args:
            user_id: User identifier
        """
        if user_id not in self.active_sessions:
            logger.debug(f"No active session for user {user_id}")
            return
        
        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            # Double-check after acquiring lock
            if user_id not in self.active_sessions:
                return
            
            logger.info(f"Ending session for user {user_id}")
            
            session = self.active_sessions[user_id]
            
            try:
                # RESOURCE MANAGEMENT: Explicitly cleanup session resources
                # This prevents memory leaks by releasing resources immediately
                # rather than waiting for garbage collection (which may never happen
                # if there are circular references)
                await session.cleanup()
            except Exception as e:
                logger.error(
                    f"Error during session cleanup for user {user_id}: {e}",
                    exc_info=True,
                )
            finally:
                # Always remove from cache, even if cleanup fails
                del self.active_sessions[user_id]
                self.clear_active_query_task(user_id)
                
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
        for user_id, session in list(self.active_sessions.items()):
            # Acquire the user lock to serialize with end_session
            user_lock = await self._get_user_lock(user_id)
            async with user_lock:
                # Double-check session still exists (may have been removed while waiting)
                if user_id not in self.active_sessions:
                    continue
                
                try:
                    await session.update_config(config)
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
    
