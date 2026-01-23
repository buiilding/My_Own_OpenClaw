"""
Session Manager for managing user agent sessions.

This module handles the lifecycle of agent sessions, including creation, retrieval,
and cleanup.
"""
import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

from backend.src.agent.core.core import AgentSession
from backend.src.core.config import AppConfig
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.core.config.subscription_manager import ConfigSubscriber

logger = logging.getLogger(__name__)


def _get_default_tts_model_path() -> str:
    """
    Get default TTS model path, cross-platform compatible.
    
    Returns:
        Default TTS model path based on user's home directory
    """
    home = Path.home()
    return str(
        home
        / ".config"
        / "DesktopAssistant"
        / "tts_models"
        / "piper"
        / "en_GB-jenny_dioco-medium.onnx"
    )


class SessionManager(ConfigSubscriber):
    """
    Manages the lifecycle of user sessions.
    
    Thread-safe: Uses per-user locks to prevent race conditions during session creation.
    """

    def __init__(
        self,
        config: AppConfig,
        create_agent_session_func,
        session_ttl_hours: float = 24.0,
        reaper_interval_seconds: float = 3600.0,
    ):
        """
        Initialize the session manager.
        
        Args:
            config: Global application configuration
            create_agent_session_func: Function to create agent sessions (takes user_id, config)
            session_ttl_hours: Hours of inactivity before session expires (default: 24)
            reaper_interval_seconds: Seconds between reaper runs (default: 3600 = 1 hour)
        """
        self.config = config
        self.create_agent_session = create_agent_session_func
        self.active_sessions: Dict[str, AgentSession] = {}
        # Track last activity time for each session (for TTL expiry)
        self._session_last_activity: Dict[str, float] = {}
        # Per-user locks to prevent race conditions during session creation
        self._user_locks: Dict[str, asyncio.Lock] = {}
        # Lock for managing user_locks dictionary itself
        self._locks_lock = asyncio.Lock()
        # Session expiry configuration
        self.session_ttl_seconds = session_ttl_hours * 3600.0
        self.reaper_interval_seconds = reaper_interval_seconds
        self._reaper_task: Optional[asyncio.Task] = None
        self._shutdown_event = asyncio.Event()

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

    async def _apply_query_config_to_session(self, user_id: str, query_config: Dict[str, Any]) -> None:
        """
        Apply query config to an existing session.
        
        Args:
            user_id: User identifier
            query_config: Config dictionary from query payload
        """
        if user_id not in self.active_sessions:
            return
        
        session = self.active_sessions[user_id]
        config_dict = session.cfg.model_dump()
        
        logger.debug(
            f"[Session Config] Updating existing session (user_id={user_id}): "
            f"current model_provider={config_dict.get('model_provider')}, "
            f"current selected_model_id={config_dict.get('selected_model_id')}"
        )
        
        # Override session config with any keys present in query_config
        for key, value in query_config.items():
            if value is not None:
                old_value = config_dict.get(key)
                config_dict[key] = value
                if old_value != value:
                    logger.info(
                        f"[Session Config] Updated {key}: {old_value} → {value} (user_id={user_id})"
                    )
        
        # Load API key for provider if model_provider changed
        updated_config = AppConfig(**config_dict)
        updated_config = load_api_key_for_provider(updated_config)
        
        logger.info(
            f"[Session Config] Session updated (user_id={user_id}): "
            f"model_provider={updated_config.model_provider}, "
            f"selected_model_id={updated_config.selected_model_id}"
        )
        
        # Update session config
        await session.update_config(updated_config)

    async def get_or_create_session(
        self, 
        user_id: str, 
        query_config: Optional[Dict[str, Any]] = None
    ) -> AgentSession:
        """
        Retrieves an existing session or creates a new one if it doesn't exist.
        
        Thread-safe: Uses per-user locks to prevent race conditions when multiple
        async tasks try to create a session for the same user concurrently.
        
        When creating a new session, applies query config to global config.
        
        Args:
            user_id: User identifier
            query_config: Optional config dictionary from query payload (overrides global config)
            
        Returns:
            AgentSession instance for the user
            
        Raises:
            RuntimeError: If session creation fails
        """
        # If session exists, update config from query if provided
        if user_id in self.active_sessions:
            if query_config:
                await self._apply_query_config_to_session(user_id, query_config)
            return self.active_sessions[user_id]
        
        # Slow path: need to create session (with lock to prevent races)
        user_lock = await self._get_user_lock(user_id)
        async with user_lock:
            # Double-check: another task might have created it while we waited
            if user_id in self.active_sessions:
                if query_config:
                    await self._apply_query_config_to_session(user_id, query_config)
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
                
                # Override global config with any keys present in query_config
                if query_config:
                    logger.debug(
                        f"[Session Config] Applying query config overrides (user_id={user_id}): "
                        f"{list(query_config.keys())}"
                    )
                    for key, value in query_config.items():
                        if value is not None:
                            old_value = config_dict.get(key)
                            config_dict[key] = value
                            if old_value != value:
                                logger.debug(
                                    f"[Session Config] Override {key}: {old_value} → {value} (user_id={user_id})"
                                )
                
                # Set default TTS model path if TTS is enabled and path is not set
                tts_will_be_enabled = config_dict.get("tts_enabled", self.config.tts_enabled)
                if tts_will_be_enabled:
                    if not config_dict.get("tts_model_path") and not self.config.tts_model_path:
                        config_dict["tts_model_path"] = _get_default_tts_model_path()
                
                # Load API key for provider (if model_provider is in config)
                session_config = AppConfig(**config_dict)
                session_config = load_api_key_for_provider(session_config)
                
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
                # MEMORY LEAK FIX: Track last activity time for TTL expiry
                self._session_last_activity[user_id] = time.time()
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
        
        Updates last activity time to prevent expiry of active sessions.
        
        Args:
            user_id: User identifier
            
        Returns:
            AgentSession if exists, None otherwise
        """
        if user_id in self.active_sessions:
            # MEMORY LEAK FIX: Update last activity time on access
            self._session_last_activity[user_id] = time.time()
        return self.active_sessions.get(user_id)

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
                # MEMORY LEAK FIX: Remove activity tracking
                if user_id in self._session_last_activity:
                    del self._session_last_activity[user_id]
                
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
        # Update container config for future sessions (if container exists)
        if hasattr(self, 'container'):
            self.container.update_config(config)

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
    
