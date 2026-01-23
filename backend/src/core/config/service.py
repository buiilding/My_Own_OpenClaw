"""
Configuration Service Layer.

This module provides a centralized configuration service with change notifications
and type-safe access. It wraps ConfigManager and provides a cleaner interface
for components that need to react to configuration changes.
"""
import asyncio
import logging
import threading
from typing import Any, Callable, Dict, Optional

from pydantic import ValidationError as PydanticValidationError

from backend.src.core.bus import EventBus
from backend.src.core.config import AppConfig, ConfigManager
from backend.src.core.config.subscription_manager import (
    ConfigSubscriber,
    ConfigSubscriptionManager,
)
from backend.src.core.events import ConfigChanged
from backend.src.core.plugins.config import PluginConfigManager

logger = logging.getLogger(__name__)


class ConfigurationService:
    """
    Centralized configuration service with change notifications.

    Provides a single source of truth for configuration access, including:
    - Application configuration (AppConfig)
    - Plugin configuration (PluginConfigManager)
    
    Delegates subscriber management to ConfigSubscriptionManager.
    """

    def __init__(
        self,
        config_manager: ConfigManager,
        event_bus: Optional[EventBus] = None,
        plugin_config_manager: Optional[PluginConfigManager] = None,
    ):
        """
        Initialize the configuration service.

        Args:
            config_manager: ConfigManager instance to wrap
            event_bus: EventBus instance for publishing config change events (optional)
            plugin_config_manager: Optional PluginConfigManager instance (created if not provided)
        """
        self._config_manager = config_manager
        self._config: Optional[AppConfig] = None
        self._subscription_manager = ConfigSubscriptionManager()
        self._event_bus = event_bus
        self._plugin_config_manager = plugin_config_manager or PluginConfigManager()
        self._lock = threading.RLock()  # Reentrant lock for thread-safe config updates

    def initialize(self) -> AppConfig:
        """
        Initialize the service by loading configuration.

        Thread-safe: Uses lock to prevent race conditions during concurrent initialization.

        Returns:
            Loaded AppConfig instance
        """
        with self._lock:
            if self._config is None:
                self._config = self._config_manager.load_config()
                logger.info("ConfigurationService initialized")
            return self._config

    def get_config(self) -> AppConfig:
        """
        Get current configuration (immutable).

        Returns:
            Current AppConfig instance

        Raises:
            RuntimeError: If config has not been initialized
        """
        if self._config is None:
            raise RuntimeError(
                "ConfigurationService not initialized. Call initialize() first."
            )
        return self._config

    def subscribe(self, subscriber: ConfigSubscriber) -> None:
        """
        Subscribe to configuration changes.

        Delegates to ConfigSubscriptionManager.

        Args:
            subscriber: Object implementing ConfigSubscriber protocol
        """
        self._subscription_manager.subscribe(subscriber)

    def subscribe_callback(
        self, callback: Callable[[AppConfig, AppConfig], None]
    ) -> None:
        """
        Subscribe a callback function to configuration changes.

        Delegates to ConfigSubscriptionManager.

        Args:
            callback: Function that takes (old_config, new_config) as arguments
        """
        self._subscription_manager.subscribe_callback(callback)

    def unsubscribe(self, subscriber: ConfigSubscriber) -> bool:
        """
        Unsubscribe from configuration changes.

        Delegates to ConfigSubscriptionManager.

        Args:
            subscriber: Subscriber to remove

        Returns:
            True if subscriber was found and removed, False otherwise
        """
        return self._subscription_manager.unsubscribe(subscriber)

    async def update_config(self, new_config: AppConfig) -> AppConfig:
        """
        Update configuration and notify subscribers.

        Thread-safe: Uses lock to prevent race conditions during concurrent updates.

        Args:
            new_config: New configuration instance

        Returns:
            Updated config with API key loaded
        """
        with self._lock:
            if self._config is None:
                raise RuntimeError("ConfigurationService not initialized")

            old_config = self._config

        # Run blocking I/O operations in thread pool to avoid blocking event loop
        loop = asyncio.get_running_loop()
        updated_config = await loop.run_in_executor(
            None, self._config_manager.update_config, new_config
        )
        
        with self._lock:
            self._config = updated_config

        # Notify subscribers outside lock to avoid deadlocks
        # (subscribers may need to acquire other locks)
        await self._subscription_manager.notify_subscribers(old_config, updated_config)

        # Publish event for event bus subscribers
        if self._event_bus:
            event = ConfigChanged(old_config=old_config, new_config=updated_config)
            await self._event_bus.publish(event)

        logger.info("Configuration updated and subscribers notified")
        return updated_config

    def get_config_value(self, path: str, default: Any = None) -> Any:
        """
        Get configuration value by dot path (e.g., 'llm.model_mode').

        Thread-safe: Uses lock to ensure consistent reads.

        Args:
            path: Dot-separated path to config value
            default: Default value if path not found

        Returns:
            Configuration value or default

        Example:
            >>> service.get_config_value('llm.model_mode')
            'online'
            >>> service.get_config_value('memory.enabled', False)
            True
        """
        with self._lock:
            if self._config is None:
                raise RuntimeError("ConfigurationService not initialized")
            
            # Get reference to config while holding lock
            config = self._config
        
        # Access config attributes outside lock (AppConfig is immutable)
        try:
            parts = path.split(".")
            value = config

            for part in parts:
                if not hasattr(value, part):
                    if default is not None:
                        return default
                    raise AttributeError(f"Config path '{path}' not found")
                value = getattr(value, part)

            return value
        except AttributeError:
            if default is not None:
                return default
            raise

    async def reload_config(self) -> AppConfig:
        """
        Reload configuration from file and notify subscribers.

        Thread-safe: Uses lock to prevent race conditions during concurrent reloads.

        Returns:
            Reloaded AppConfig instance
        """
        with self._lock:
            if self._config is None:
                raise RuntimeError("ConfigurationService not initialized")

            old_config = self._config

        # Run blocking I/O operations in thread pool to avoid blocking event loop
        loop = asyncio.get_running_loop()
        reloaded_config = await loop.run_in_executor(
            None, self._config_manager.reload_config
        )
        
        with self._lock:
            self._config = reloaded_config

        # Notify subscribers outside lock to avoid deadlocks
        # (subscribers may need to acquire other locks)
        await self._subscription_manager.notify_subscribers(old_config, reloaded_config)

        logger.info("Configuration reloaded and subscribers notified")
        return reloaded_config

    def get_plugin_config(self, plugin_name: str) -> Dict[str, Any]:
        """
        Get configuration for a specific plugin.

        Args:
            plugin_name: Name of the plugin

        Returns:
            Plugin configuration dictionary
        """
        return self._plugin_config_manager.get_plugin_config(plugin_name)

    def update_plugin_config(self, plugin_name: str, config: Dict[str, Any]) -> None:
        """
        Update configuration for a specific plugin.

        Args:
            plugin_name: Name of the plugin
            config: Configuration dictionary
        """
        self._plugin_config_manager.update_plugin_config(plugin_name, config)

    @property
    def config(self) -> AppConfig:
        """
        Get application configuration (property access for convenience).

        Returns:
            Current AppConfig instance
        """
        return self.get_config()
    
    def get_default_tts_model_path(self) -> str:
        """
        Get default TTS model path if none is configured.
        
        Policy: Default TTS model path for Piper TTS.
        This policy is centralized here so it can be configured or changed
        without modifying handler code.
        
        Returns:
            Default TTS model path
        """
        from backend.src.core.config.manager import get_default_tts_model_path as _get_default_tts_model_path
        return _get_default_tts_model_path()
    
    def build_user_config(self, user_config: Dict[str, Any]) -> AppConfig:
        """
        Build complete user configuration by merging global config with user overrides.
        
        Applies configuration policies:
        - Sets default TTS model path if TTS is enabled and path is not set
        - Loads API keys for selected provider
        
        CONFIGURATION: Respects tts_enabled from config (removed hardcoded override).
        Users can now disable TTS for headless/silent mode operation.
        speech_mode_enabled controls whether TTS is actually used during interactions.
        
        This method centralizes config building logic to avoid duplication
        between handlers and session managers.
        
        Args:
            user_config: User-specific configuration overrides (dict)
            
        Returns:
            Complete AppConfig instance with policies applied and API keys loaded
        """
        from backend.src.core.config.manager import load_api_key_for_provider
        
        global_config = self.get_config()
        
        # Merge: user config overrides global
        complete_config_dict = {**global_config.model_dump(), **user_config}
        
        # Set default TTS model path if TTS is enabled and path is not set
        tts_will_be_enabled = complete_config_dict.get("tts_enabled", global_config.tts_enabled)
        if tts_will_be_enabled:
            if not complete_config_dict.get("tts_model_path") and not global_config.tts_model_path:
                complete_config_dict["tts_model_path"] = self.get_default_tts_model_path()
        
        try:
            validated_config = AppConfig(**complete_config_dict)
        except PydanticValidationError as e:
            error_details = {}
            for error in e.errors():
                field = ".".join(str(loc) for loc in error["loc"])
                error_details[field] = error["msg"]
            raise ValueError(
                f"Invalid configuration: {error_details}"
            ) from e
        
        # Load API key for the selected provider
        validated_config = load_api_key_for_provider(validated_config)
        
        return validated_config


