"""
Configuration Manager.

This module handles loading application configuration from Python config files.
Configuration is loaded from backend.src.core.config.app_config module.
"""
import importlib
import logging
import os
import threading
from typing import Optional

from backend.src.core.config.models import AppConfig

logger = logging.getLogger(__name__)


def get_default_tts_model_path() -> str:
    """
    Get the default TTS model path.
    
    Returns:
        Default TTS model path string
    """
    from pathlib import Path
    import platform
    
    if os.name == "nt":  # Windows
        appdata = os.getenv("APPDATA")
        if appdata:
            return str(Path(appdata) / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")
    elif os.name == "posix":
        home_dir = Path.home()
        if platform.system() == "Darwin":  # macOS
            return str(home_dir / "Library" / "Application Support" / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")
        else:  # Linux
            return str(home_dir / ".config" / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")
    # Fallback
    return str(Path.home() / ".config" / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")


def load_api_key_for_provider(cfg: AppConfig) -> AppConfig:
    """
    Loads the API key for the currently selected provider from environment variables.
    Returns a new AppConfig instance with the api_key set.
    For local models, no API key is required.
    """
    # For local models, no API key is needed
    if cfg.model_mode == "local":
        logger.info("Local model mode selected - no API key required.")
        return cfg.model_copy(update={"api_key": None})

    provider_name = cfg.model_provider
    logger.info(
        f"[API Key Load] Loading API key for provider='{provider_name}', "
        f"model_mode='{cfg.model_mode}', selected_model_id='{cfg.selected_model_id}'"
    )
    api_key_env_var = None

    try:
        provider_config = cfg.llm_providers.get_provider_config(provider_name)
        api_key_env_var = getattr(provider_config, "api_key_env", None)
        logger.info(
            f"[API Key Load] Provider config found: api_key_env='{api_key_env_var}'"
        )
    except ValueError as e:
        logger.warning(
            f"[API Key Load] No config found for provider '{provider_name}' when loading API key: {e}"
        )
        return cfg.model_copy(update={"api_key": None})

    if api_key_env_var:
        api_key = os.getenv(api_key_env_var)
        if not api_key:
            logger.warning(
                f"[API Key Load] Environment variable '{api_key_env_var}' for provider '{provider_name}' is not set."
            )
        else:
            logger.info(
                f"[API Key Load] API key loaded for provider '{provider_name}' from '{api_key_env_var}'"
            )
        return cfg.model_copy(update={"api_key": api_key})
    else:
        # This case is for local models like Ollama that don't require an API key
        logger.info(f"[API Key Load] No API key environment variable for provider '{provider_name}'.")
        return cfg.model_copy(update={"api_key": None})


def load_settings_from_file(reload_module: bool = False) -> AppConfig:
    """
    Loads the application configuration from Python config file.
    This function should only be called once at startup.
    Use ConfigManager for runtime config access.
    
    Configuration is loaded from backend.src.core.config.app_config.APP_CONFIG.
    To change configuration, edit that file and restart the application.
    
    Args:
        reload_module: If True, reload the config module to pick up changes.
                      Only use this when explicitly reloading config.
    
    Returns:
        AppConfig instance with API key loaded
    """
    try:
        # Import the config module to get the APP_CONFIG
        from backend.src.core.config import app_config as config_module
        
        # Reload module only if explicitly requested (for reload_config)
        if reload_module:
            try:
                importlib.reload(config_module)
                logger.debug("Config module reloaded")
            except Exception as reload_error:
                logger.warning(
                    f"Failed to reload config module (may not be loaded yet): {reload_error}"
                )
                # Continue with current module state
        
        app_config = config_module.APP_CONFIG
        
        # Ensure tts_enabled is True (hardcoded)
        if not app_config.tts_enabled:
            app_config = app_config.model_copy(update={"tts_enabled": True})
        
        # Set default TTS model path if not set
        if app_config.tts_model_path is None:
            default_path = get_default_tts_model_path()
            logger.info(f"Setting default TTS model path: {default_path}")
            app_config = app_config.model_copy(update={"tts_model_path": default_path})
        
        logger.info("Configuration loaded from Python config file")
        
    except ImportError as e:
        logger.error("Failed to import config module: %s", e, exc_info=True)
        logger.warning("Falling back to default configuration.")
        app_config = AppConfig()
        # Set default TTS model path
        if app_config.tts_model_path is None:
            default_path = get_default_tts_model_path()
            app_config = app_config.model_copy(update={"tts_model_path": default_path})
    except Exception as e:
        logger.error("Failed to load config from Python file: %s", e, exc_info=True)
        logger.warning("Falling back to default configuration.")
        app_config = AppConfig()
        # Set default TTS model path
        if app_config.tts_model_path is None:
            default_path = get_default_tts_model_path()
            app_config = app_config.model_copy(update={"tts_model_path": default_path})

    # Load API key for the selected provider (returns new instance)
    return load_api_key_for_provider(app_config)


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

