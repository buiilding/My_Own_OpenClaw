"""
Session Manager for managing user agent sessions.

This module handles the lifecycle of agent sessions, including creation, retrieval,
and cleanup.
"""
import asyncio
import logging
from pathlib import Path
from typing import Dict, Optional

from backend.src.agent.core.core import AgentSession
from backend.src.core.config import AppConfig
from backend.src.core.config.user_config_manager import UserConfigManager
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.core.config_subscription_manager import ConfigSubscriber

logger = logging.getLogger(__name__)


def _recursive_merge(base: dict, override: dict) -> dict:
    """
    Recursively merge two dictionaries.
    
    Values from override take precedence, but nested dicts are merged recursively.
    
    Args:
        base: Base dictionary
        override: Dictionary with overrides
        
    Returns:
        Merged dictionary
    """
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _recursive_merge(result[key], value)
        else:
            result[key] = value
    return result


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


def _merge_user_config(global_config: AppConfig, user_config: Optional[dict]) -> AppConfig:
    """
    Merge user-specific config with global config.
    
    Handles special cases like TTS settings and API key loading.
    
    Args:
        global_config: Global application configuration
        user_config: Optional user-specific configuration overrides
        
    Returns:
        Merged AppConfig instance with API keys loaded
    """
    if not user_config:
        return global_config
    
    # Recursive merge: user overrides global, nested dicts merged
    complete_config_dict = _recursive_merge(
        global_config.model_dump(), user_config
    )
    
    # tts_enabled is always True (hardcoded, not configurable)
    # speech_mode_enabled controls whether TTS is actually used
    complete_config_dict["tts_enabled"] = True
    
    # Set default TTS model path if TTS is enabled and path is not set
    tts_will_be_enabled = complete_config_dict.get("tts_enabled", global_config.tts_enabled)
    if tts_will_be_enabled:
        if not complete_config_dict.get("tts_model_path") and not global_config.tts_model_path:
            complete_config_dict["tts_model_path"] = _get_default_tts_model_path()
    
    user_merged_config = AppConfig(**complete_config_dict)
    # Load API key for the selected provider
    user_merged_config = load_api_key_for_provider(user_merged_config)
    
    return user_merged_config


class SessionManager(ConfigSubscriber):
    """
    Manages the lifecycle of user sessions.
    
    Thread-safe: Uses per-user locks to prevent race conditions during session creation.
    """

    def __init__(
        self,
        config: AppConfig,
        create_agent_session_func,
        user_config_manager: UserConfigManager,
    ):
        """
        Initialize the session manager.
        
        Args:
            config: Global application configuration
            create_agent_session_func: Function to create agent sessions (takes user_id, config)
            user_config_manager: User configuration manager for per-user config
        """
        self.config = config
        self.create_agent_session = create_agent_session_func
        self.user_config_manager = user_config_manager
        self.active_sessions: Dict[str, AgentSession] = {}
        # Per-user locks to prevent race conditions during session creation
        self._user_locks: Dict[str, asyncio.Lock] = {}
        # Lock for managing user_locks dictionary itself
        self._locks_lock = asyncio.Lock()

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

    async def get_or_create_session(self, user_id: str) -> AgentSession:
        """
        Retrieves an existing session or creates a new one if it doesn't exist.
        
        Thread-safe: Uses per-user locks to prevent race conditions when multiple
        async tasks try to create a session for the same user concurrently.
        
        When creating a new session, merges user-specific config with global config.
        
        Args:
            user_id: User identifier
            
        Returns:
            AgentSession instance for the user
            
        Raises:
            RuntimeError: If session creation fails
        """
        # Fast path: session already exists
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
                # Get global config
                global_config = self.config
                
                # Merge with user-specific config
                user_config = self.user_config_manager.load_user_config(user_id)
                
                # Merge configs (handles special cases like TTS)
                merged_config = _merge_user_config(global_config, user_config)
                
                # Create session with merged config
                session = self.create_agent_session(
                    user_id=user_id, config=merged_config
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
            
            try:
                # Future: If AgentSession has cleanup() method, call it here
                # Example:
                #   session = self.active_sessions[user_id]
                #   await session.cleanup()
                # Currently AgentSession doesn't have explicit cleanup,
                # but this is where it would be called if added
                pass
            except Exception as e:
                logger.error(
                    f"Error during session cleanup for user {user_id}: {e}",
                    exc_info=True,
                )
            finally:
                # Always remove from cache, even if cleanup fails
                del self.active_sessions[user_id]
                
                # Clean up lock if no longer needed
                async with self._locks_lock:
                    if user_id in self._user_locks:
                        del self._user_locks[user_id]

    async def update_all_sessions_config(self, config: AppConfig):
        """
        Updates the configuration for all active sessions.
        
        Args:
            config: New configuration to apply
        """
        # Update container config for future sessions
        self.container.update_config(config)

        # Update all active sessions
        errors = []
        for user_id, session in list(self.active_sessions.items()):
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

    async def update_user_session_config(self, user_id: str, config: AppConfig):
        """
        Updates the configuration for a specific user's session.
        
        Args:
            user_id: User identifier
            config: Configuration to apply to this user's session
        """
        # Only update the specific user's session if it exists
        if user_id in self.active_sessions:
            logger.info(f"Updating config for user {user_id}'s session")
            try:
                await self.active_sessions[user_id].update_config(config)
            except Exception as e:
                logger.error(
                    f"Error updating config for user {user_id}'s session: {e}",
                    exc_info=True,
                )
                raise
        else:
            logger.debug(
                f"No active session for user {user_id}, "
                "config will be applied on next session creation"
            )

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
