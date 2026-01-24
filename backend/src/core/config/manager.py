"""
Configuration Manager.

This module manages application configuration with single load at startup.
Provides immutable config access and config change events.
"""
import logging
import threading
from typing import Optional

from backend.src.core.config.loader import load_api_key_for_provider, load_settings_from_file
from backend.src.core.config.models import AppConfig

logger = logging.getLogger(__name__)


class ConfigManager:
    """
    Manages application configuration with single load at startup.
    Provides immutable config access and config change events.
    """
    
    def __init__(self):
        """Initialize the config manager."""
        self._config: Optional[AppConfig] = None
        self._lock = threading.RLock()  # Reentrant lock for thread safety
    
    def load_config(self) -> AppConfig:
        """
        Load configuration from Python config file (called once at startup).
        
        Thread-safe: Uses lock to prevent race conditions during concurrent loads.
        
        Returns:
            Loaded AppConfig instance
            
        Raises:
            RuntimeError: If config cannot be loaded
        """
        with self._lock:
            if self._config is not None:
                logger.debug("Config already loaded. Returning existing config.")
                return self._config
            
            try:
                self._config = load_settings_from_file()
            except Exception as e:
                logger.error("Failed to load config from Python file: %s", e, exc_info=True)
                # Reset state on failure
                self._config = None
                raise RuntimeError(f"Failed to load configuration: {e}") from e
            
            if self._config is None:
                raise RuntimeError("load_settings_from_file returned None")
            
            logger.info("Configuration loaded from Python config file")
            return self._config
    
    def get_config(self) -> AppConfig:
        """
        Get the current configuration.
        
        Thread-safe: Uses lock for consistent reads.
        
        Returns:
            Current AppConfig instance
            
        Raises:
            RuntimeError: If config has not been loaded
        """
        with self._lock:
            if self._config is None:
                raise RuntimeError("Config not loaded. Call load_config() first.")
            return self._config
    
    def update_config(self, new_config: AppConfig) -> AppConfig:
        """
        Update configuration in memory (runtime only, not persisted).
        
        Note: This method does NOT publish config change events. Use ConfigurationService
        for change notifications. This method only updates the in-memory cache.
        
        WARNING: Changes are not persisted. To make permanent changes, edit
        backend.src.core.config.app_config and restart the application.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        Args:
            new_config: New configuration instance. Must not be None.
            
        Returns:
            Updated config with API key loaded
            
        Raises:
            ValueError: If new_config is None
        """
        if new_config is None:
            raise ValueError("Cannot update config with None value")
        
        # Force tts_enabled to True (hardcoded, not configurable)
        if not new_config.tts_enabled:
            new_config = new_config.model_copy(update={"tts_enabled": True})
        
        # Load API key for new config
        updated_config = load_api_key_for_provider(new_config)
        
        # Validate updated config
        if updated_config is None:
            raise ValueError("load_api_key_for_provider returned None")
        
        # Update cached config (in-memory only, not persisted)
        with self._lock:
            self._config = updated_config
        
        logger.info("Configuration updated in memory (not persisted - edit app_config.py to make permanent changes)")
        
        return updated_config
    
    def reload_config(self) -> AppConfig:
        """
        Reload configuration from Python config file.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        WARNING: This method should typically be called through ConfigurationService
        to ensure subscribers are notified. Direct calls bypass the notification system.
        
        Note: This will reload the Python config module to pick up file changes.
        Changes to app_config.py will be reflected after calling this method.
        
        Returns:
            Reloaded AppConfig instance (with tts_enabled forced to True)
            
        Raises:
            RuntimeError: If config cannot be reloaded
        """
        try:
            # Explicitly reload the module to pick up changes
            reloaded_config = load_settings_from_file(reload_module=True)
        except Exception as e:
            logger.error("Failed to reload config from Python file: %s", e, exc_info=True)
            raise RuntimeError(f"Failed to reload configuration: {e}") from e
        
        if reloaded_config is None:
            raise RuntimeError("load_settings_from_file returned None")
        
        # Ensure tts_enabled is True after reload
        if not reloaded_config.tts_enabled:
            reloaded_config = reloaded_config.model_copy(update={"tts_enabled": True})
        
        # Update config in memory
        with self._lock:
            self._config = reloaded_config
        
        logger.info("Configuration reloaded from Python config file")
        return reloaded_config


# Global config manager instance
_config_manager = ConfigManager()


def get_config_manager() -> ConfigManager:
    """Get the global config manager instance."""
    return _config_manager

