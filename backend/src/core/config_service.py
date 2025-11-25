"""
Configuration Service Layer.

This module provides a centralized configuration service with change notifications
and type-safe access. It wraps ConfigManager and provides a cleaner interface
for components that need to react to configuration changes.
"""
import logging
from typing import Any, Callable, List, Optional, Protocol
from backend.src.core.config import AppConfig, ConfigManager
from backend.src.core.bus import message_bus
from backend.src.core.events import ConfigChanged

logger = logging.getLogger(__name__)


class ConfigSubscriber(Protocol):
    """Protocol for components that subscribe to config changes."""
    
    async def on_config_changed(self, old_config: AppConfig, new_config: AppConfig) -> None:
        """
        Called when configuration changes.
        
        Args:
            old_config: Previous configuration
            new_config: New configuration
        """
        ...


class ConfigurationService:
    """
    Centralized configuration service with change notifications.
    
    Provides a single source of truth for configuration access and
    automatic change propagation to subscribers.
    """
    
    def __init__(self, config_manager: ConfigManager):
        """
        Initialize the configuration service.
        
        Args:
            config_manager: ConfigManager instance to wrap
        """
        self._config_manager = config_manager
        self._config: Optional[AppConfig] = None
        self._subscribers: List[ConfigSubscriber] = []
        self._callbacks: List[Callable[[AppConfig, AppConfig], None]] = []
    
    def initialize(self) -> AppConfig:
        """
        Initialize the service by loading configuration.
        
        Returns:
            Loaded AppConfig instance
        """
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
        
        Args:
            subscriber: Object implementing ConfigSubscriber protocol
        """
        if subscriber not in self._subscribers:
            self._subscribers.append(subscriber)
            logger.debug(f"Subscribed {type(subscriber).__name__} to config changes")
    
    def subscribe_callback(
        self, 
        callback: Callable[[AppConfig, AppConfig], None]
    ) -> None:
        """
        Subscribe a callback function to configuration changes.
        
        Args:
            callback: Function that takes (old_config, new_config) as arguments
        """
        if callback not in self._callbacks:
            self._callbacks.append(callback)
            logger.debug(f"Subscribed callback to config changes")
    
    def unsubscribe(self, subscriber: ConfigSubscriber) -> bool:
        """
        Unsubscribe from configuration changes.
        
        Args:
            subscriber: Subscriber to remove
            
        Returns:
            True if subscriber was found and removed, False otherwise
        """
        if subscriber in self._subscribers:
            self._subscribers.remove(subscriber)
            logger.debug(f"Unsubscribed {type(subscriber).__name__} from config changes")
            return True
        return False
    
    async def update_config(self, new_config: AppConfig) -> AppConfig:
        """
        Update configuration and notify subscribers.
        
        Args:
            new_config: New configuration instance
            
        Returns:
            Updated config with API key loaded
        """
        if self._config is None:
            raise RuntimeError("ConfigurationService not initialized")
        
        old_config = self._config
        
        # Update via config manager (handles file saving, API key loading)
        updated_config = self._config_manager.update_config(new_config)
        self._config = updated_config
        
        # Notify subscribers
        await self._notify_subscribers(old_config, updated_config)
        
        # Publish event for event bus subscribers
        event = ConfigChanged(
            old_config=old_config,
            new_config=updated_config
        )
        await message_bus.publish(event)
        
        logger.info("Configuration updated and subscribers notified")
        return updated_config
    
    def get_config_value(self, path: str, default: Any = None) -> Any:
        """
        Get configuration value by dot path (e.g., 'llm.model_mode').
        
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
        if self._config is None:
            raise RuntimeError("ConfigurationService not initialized")
        
        try:
            parts = path.split('.')
            value = self._config
            
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
        
        Returns:
            Reloaded AppConfig instance
        """
        if self._config is None:
            raise RuntimeError("ConfigurationService not initialized")
        
        old_config = self._config
        
        # Reload via config manager
        reloaded_config = self._config_manager.reload_config()
        self._config = reloaded_config
        
        # Notify subscribers
        await self._notify_subscribers(old_config, reloaded_config)
        
        logger.info("Configuration reloaded and subscribers notified")
        return reloaded_config
    
    async def _notify_subscribers(
        self, 
        old_config: AppConfig, 
        new_config: AppConfig
    ) -> None:
        """Notify all subscribers of configuration change."""
        # Notify protocol-based subscribers
        for subscriber in self._subscribers:
            try:
                if hasattr(subscriber, 'on_config_changed'):
                    await subscriber.on_config_changed(old_config, new_config)
            except Exception as e:
                logger.error(
                    f"Error notifying subscriber {type(subscriber).__name__}: {e}",
                    exc_info=True
                )
        
        # Notify callback subscribers
        for callback in self._callbacks:
            try:
                callback(old_config, new_config)
            except Exception as e:
                logger.error(
                    f"Error in config change callback: {e}",
                    exc_info=True
                )


# Global configuration service instance
_config_service: Optional[ConfigurationService] = None


def get_config_service() -> ConfigurationService:
    """
    Get the global configuration service instance.
    
    Returns:
        ConfigurationService instance
        
    Raises:
        RuntimeError: If service has not been initialized
    """
    global _config_service
    if _config_service is None:
        raise RuntimeError(
            "ConfigurationService not initialized. "
            "Call initialize_config_service() first."
        )
    return _config_service


def initialize_config_service(config_manager: Optional[ConfigManager] = None) -> ConfigurationService:
    """
    Initialize the global configuration service.
    
    Args:
        config_manager: Optional ConfigManager instance (uses global if None)
        
    Returns:
        Initialized ConfigurationService instance
    """
    global _config_service
    
    if config_manager is None:
        from backend.src.core.config import get_config_manager
        config_manager = get_config_manager()
    
    _config_service = ConfigurationService(config_manager)
    _config_service.initialize()
    
    logger.info("Global ConfigurationService initialized")
    return _config_service

