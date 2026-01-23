"""
Configuration Manager.

This module handles loading and saving of application configuration.
"""
import logging
import os
import platform
import threading
from pathlib import Path
from typing import Optional

import yaml
from filelock import FileLock, Timeout
from pydantic import ValidationError

from backend.src.core.config.models import AppConfig

logger = logging.getLogger(__name__)

# --- Constants ---
APP_NAME = "DesktopAssistant"
CONFIG_FILE_NAME = "config.yaml"


def get_config_dir() -> Path:
    """
    Gets the application's configuration directory based on OS.
    
    Returns:
        Path to configuration directory
        
    Raises:
        ValueError: If OS is unsupported or required environment variables are missing
        OSError: If home directory cannot be determined
    """
    if os.name == "nt":  # Windows
        appdata = os.getenv("APPDATA")
        if not appdata:
            raise ValueError("APPDATA environment variable is not set on Windows")
        config_path = Path(appdata) / APP_NAME
        return config_path

    if os.name == "posix":
        try:
            home_dir = Path.home()
        except (RuntimeError, OSError) as e:
            raise OSError(f"Cannot determine home directory: {e}") from e
        
        if platform.system() == "Darwin":  # macOS
            return home_dir / "Library" / "Application Support" / APP_NAME
        # Linux and other Unix-like
        return home_dir / ".config" / APP_NAME

    raise ValueError(f"Unsupported OS: {os.name}")


def get_default_tts_model_path() -> str:
    """
    Get the default TTS model path.
    
    Returns:
        Default TTS model path string
    """
    config_dir = get_config_dir()
    return str(config_dir / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")


def _set_default_tts_model_path(config: AppConfig) -> AppConfig:
    """
    Set default TTS model path if it's not already set.
    
    Args:
        config: Current AppConfig instance
        
    Returns:
        AppConfig with default TTS model path set if it was null
    """
    if config.tts_model_path is None:
        default_path = get_default_tts_model_path()
        logger.info(f"Setting default TTS model path: {default_path}")
        return config.model_copy(update={"tts_model_path": default_path})
    return config


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


def save_settings_to_file(cfg: AppConfig) -> None:
    """
    Saves the application configuration to a YAML file.
    
    Thread-safe: Uses file locking to prevent race conditions during concurrent writes.
    
    Args:
        cfg: AppConfig instance to save
        
    Raises:
        ValueError: If cfg is None
        OSError: If directory creation or file write fails
        yaml.YAMLError: If YAML serialization fails
    """
    if cfg is None:
        raise ValueError("Cannot save None configuration")
    
    try:
        config_dir = get_config_dir()
    except (ValueError, OSError) as e:
        logger.error("Failed to get config directory: %s", e, exc_info=True)
        raise
    
    config_file = config_dir / CONFIG_FILE_NAME
    lock_file = config_file.with_suffix(config_file.suffix + ".lock")
    
    try:
        config_dir.mkdir(parents=True, exist_ok=True)
    except (OSError, PermissionError) as e:
        logger.error(
            "Failed to create config directory %s: %s", config_dir, e, exc_info=True
        )
        raise OSError(f"Cannot create config directory: {e}") from e

    # Use file lock to prevent concurrent writes (race conditions)
    lock = FileLock(lock_file, timeout=10.0)  # 10 second timeout
    try:
        with lock:
            # Exclude the runtime-only api_key field and tts_enabled (hardcoded to True)
            config_to_save = cfg.model_dump(exclude={"api_key", "tts_enabled"})
            with open(config_file, "w", encoding="utf-8") as f:
                yaml.dump(config_to_save, f, default_flow_style=False, sort_keys=False)
            logger.info("Successfully saved settings to %s", config_file)
    except Timeout:
        logger.error("Failed to acquire lock for config file: timeout after 10s")
        raise OSError("Config file is locked by another process") from None
    except (yaml.YAMLError, OSError, PermissionError) as e:
        logger.error("Failed to save settings to file: %s", e, exc_info=True)
        raise


def load_settings_from_file() -> AppConfig:
    """
    Loads the application configuration from a YAML file.
    This function should only be called once at startup.
    Use ConfigManager for runtime config access.
    """
    config_dir = get_config_dir()
    config_file = config_dir / CONFIG_FILE_NAME

    if not config_file.exists():
        logger.info("Config file not found. Creating a default one.")
        try:
            default_config = AppConfig()
            # Set default TTS model path
            default_config = _set_default_tts_model_path(default_config)
            save_settings_to_file(default_config)
            return load_api_key_for_provider(default_config)
        except Exception as e:
            logger.error(
                "Failed to create default config file: %s", e, exc_info=True
            )
            # Return default config even if save fails (non-critical)
            # The config will be saved on next update
            default_config = AppConfig()
            default_config = _set_default_tts_model_path(default_config)
            return load_api_key_for_provider(default_config)

    try:
        with open(config_file, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}
        
        # Always set tts_enabled to True (hardcoded, ignore config file value)
        # This ensures tts_enabled is only changeable by modifying the default in code
        if "tts_enabled" in config_data:
            del config_data["tts_enabled"]
        
        app_config = AppConfig(**config_data)
        # Force tts_enabled to True after loading (in case default was overridden)
        if not app_config.tts_enabled:
            app_config = app_config.model_copy(update={"tts_enabled": True})
    except (yaml.YAMLError, ValidationError, TypeError) as e:
        logger.error("Failed to load or validate config file: %s", e, exc_info=True)
        logger.warning("Falling back to default configuration.")
        app_config = AppConfig()

    # Set default TTS model path if not set
    tts_path_was_none = app_config.tts_model_path is None
    app_config = _set_default_tts_model_path(app_config)
    
    # Save config if TTS model path was updated (was None, now set)
    if tts_path_was_none and app_config.tts_model_path is not None:
        try:
            save_settings_to_file(app_config)
        except Exception as e:
            # Non-critical: log warning but continue with in-memory config
            logger.warning(
                "Failed to save config after setting default TTS path: %s", e
            )

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
        self._config_file_path: Optional[Path] = None
        self._lock = threading.RLock()  # Reentrant lock for thread safety
    
    def load_config(self) -> AppConfig:
        """
        Load configuration from file (called once at startup).
        
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
                config_dir = get_config_dir()
                self._config_file_path = config_dir / CONFIG_FILE_NAME
            except (ValueError, OSError) as e:
                logger.error("Failed to get config directory: %s", e, exc_info=True)
                raise RuntimeError(f"Cannot determine config directory: {e}") from e
            
            try:
                self._config = load_settings_from_file()
            except Exception as e:
                logger.error("Failed to load config from file: %s", e, exc_info=True)
                # Reset state on failure
                self._config = None
                self._config_file_path = None
                raise RuntimeError(f"Failed to load configuration: {e}") from e
            
            if self._config is None:
                raise RuntimeError("load_settings_from_file returned None")
            
            logger.info(f"Configuration loaded from {self._config_file_path}")
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
        Update configuration and save to file.
        
        Note: This method does NOT publish config change events. Use ConfigurationService
        for change notifications. This method only updates the file and cache.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        Args:
            new_config: New configuration instance. Must not be None.
            
        Returns:
            Updated config with API key loaded
            
        Raises:
            ValueError: If new_config is None
            OSError: If file save fails
            yaml.YAMLError: If YAML serialization fails
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
        
        # Save to file first (fail fast if save fails)
        # This ensures file and cache stay in sync
        try:
            save_settings_to_file(updated_config)
        except Exception as e:
            logger.error("Failed to save config file during update: %s", e, exc_info=True)
            # Don't update cache if save failed - keep old config
            raise
        
        # Update cached config only after successful save
        with self._lock:
            self._config = updated_config
        
        logger.info("Configuration updated and saved to file")
        
        return updated_config
    
    def reload_config(self) -> AppConfig:
        """
        Reload configuration from file.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        WARNING: This method should typically be called through ConfigurationService
        to ensure subscribers are notified. Direct calls bypass the notification system.
        
        Returns:
            Reloaded AppConfig instance (with tts_enabled forced to True)
            
        Raises:
            RuntimeError: If config file cannot be loaded
        """
        try:
            reloaded_config = load_settings_from_file()
        except Exception as e:
            logger.error("Failed to reload config from file: %s", e, exc_info=True)
            raise RuntimeError(f"Failed to reload configuration: {e}") from e
        
        if reloaded_config is None:
            raise RuntimeError("load_settings_from_file returned None")
        
        # Ensure tts_enabled is True after reload
        if not reloaded_config.tts_enabled:
            reloaded_config = reloaded_config.model_copy(update={"tts_enabled": True})
        
        # Update both config and file path
        with self._lock:
            # Update file path in case it changed
            try:
                config_dir = get_config_dir()
                self._config_file_path = config_dir / CONFIG_FILE_NAME
            except Exception as e:
                logger.warning(
                    "Failed to update config file path during reload: %s", e
                )
                # Continue with reload even if path update fails
            
            self._config = reloaded_config
        
        logger.info("Configuration reloaded from file")
        return reloaded_config


# Global config manager instance
_config_manager = ConfigManager()


def get_config_manager() -> ConfigManager:
    """Get the global config manager instance."""
    return _config_manager

