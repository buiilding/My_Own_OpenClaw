"""
Session Manager for managing user agent sessions.

This module handles the lifecycle of agent sessions, including creation, retrieval,
and cleanup.
"""
import asyncio
import logging
from typing import Dict, Optional

from backend.src.agent.core import AgentSession
from backend.src.core.config import AppConfig
from backend.src.core.config.user_config_manager import get_user_config_manager
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.core.config_subscription_manager import ConfigSubscriber
from backend.src.core.container import Container

logger = logging.getLogger(__name__)


class SessionManager(ConfigSubscriber):
    """
    Manages the lifecycle of user sessions.
    """

    def __init__(self, container: Container):
        self.container = container
        self.active_sessions: Dict[str, AgentSession] = {}

    async def get_or_create_session(self, user_id: str) -> AgentSession:
        """
        Retrieves an existing session or creates a new one if it doesn't exist.
        
        When creating a new session, merges user-specific config with global config.
        """
        if user_id not in self.active_sessions:
            logger.info(f"Creating new session for user {user_id}")
            
            # Get global config from container
            global_config = self.container.config
            
            # Merge with user-specific config
            user_config_manager = get_user_config_manager()
            user_config = user_config_manager.load_user_config(user_id)
            
            if user_config:
                # Build complete config: global + user overrides
                complete_config_dict = {**global_config.model_dump(), **user_config}
                
                # tts_enabled is always True (hardcoded, not configurable)
                # speech_mode_enabled controls whether TTS is actually used
                complete_config_dict["tts_enabled"] = True
                
                # Set default TTS model path if TTS is enabled and path is not set
                tts_will_be_enabled = complete_config_dict.get("tts_enabled", global_config.tts_enabled)
                if tts_will_be_enabled:
                    if not complete_config_dict.get("tts_model_path") and not global_config.tts_model_path:
                        complete_config_dict["tts_model_path"] = "/home/peter/.config/DesktopAssistant/tts_models/piper/en_GB-jenny_dioco-medium.onnx"
                
                user_merged_config = AppConfig(**complete_config_dict)
                # Load API key for the selected provider
                user_merged_config = load_api_key_for_provider(user_merged_config)
                
                # Temporarily update container config for this session creation
                # (we'll restore it after, but this ensures the session gets the right config)
                original_config = self.container.config
                self.container.update_config(user_merged_config)
                
                try:
                    session = self.container.create_agent_session(user_id=user_id)
                    self.active_sessions[user_id] = session
                finally:
                    # Restore original global config
                    self.container.update_config(original_config)
            else:
                # No user-specific config, use global config
                session = self.container.create_agent_session(user_id=user_id)
                self.active_sessions[user_id] = session
                
        return self.active_sessions[user_id]

    def get_session(self, user_id: str) -> Optional[AgentSession]:
        """
        Retrieves an active session for a user.
        """
        return self.active_sessions.get(user_id)

    async def end_session(self, user_id: str):
        """
        Ends a user's session and performs cleanup.
        """
        if user_id in self.active_sessions:
            logger.info(f"Ending session for user {user_id}")
            del self.active_sessions[user_id]

    async def update_all_sessions_config(self, config: AppConfig):
        """
        Updates the configuration for all active sessions.
        """
        # Update container config for future sessions
        self.container.update_config(config)

        for session in self.active_sessions.values():
            await session.update_config(config)

    async def update_user_session_config(self, user_id: str, config: AppConfig):
        """
        Updates the configuration for a specific user's session.
        
        Args:
            user_id: User identifier
            config: Configuration to apply to this user's session
        """
        # Update container config for future sessions (but this is global, so we don't update it)
        # Only update the specific user's session if it exists
        if user_id in self.active_sessions:
            logger.info(f"Updating config for user {user_id}'s session")
            await self.active_sessions[user_id].update_config(config)
        else:
            logger.debug(f"No active session for user {user_id}, config will be applied on next session creation")

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
