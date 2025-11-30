"""
Configuration Manager.

This module handles loading and saving of application configuration.
"""
import logging
import os
import platform
from pathlib import Path
from typing import Optional

import yaml
from pydantic import ValidationError

from backend.src.core.config.models import AppConfig

logger = logging.getLogger(__name__)

# --- Constants ---
APP_NAME = "DesktopAssistant"
CONFIG_FILE_NAME = "config.yaml"


def get_config_dir() -> Path:
    """Gets the application's configuration directory based on OS."""
    if os.name == "nt":  # Windows
        appdata = os.getenv("APPDATA")
        if not appdata:
            raise ValueError("APPDATA environment variable is not set on Windows")
        return Path(appdata) / APP_NAME

    if os.name == "posix":
        if platform.system() == "Darwin":  # macOS
            return Path.home() / "Library" / "Application Support" / APP_NAME
        # Linux and other Unix-like
        return Path.home() / ".config" / APP_NAME

    raise ValueError(f"Unsupported OS: {os.name}")


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
    api_key_env_var = None

    try:
        provider_config = cfg.llm_providers.get_provider_config(provider_name)
        api_key_env_var = getattr(provider_config, "api_key_env", None)
    except ValueError:
        logger.warning(
            "No config found for provider '%s' when loading API key.", provider_name
        )
        return cfg.model_copy(update={"api_key": None})

    if api_key_env_var:
        api_key = os.getenv(api_key_env_var)
        if not api_key:
            logger.warning(
                "Environment variable '%s' for provider '%s' is not set.",
                api_key_env_var,
                provider_name,
            )
        return cfg.model_copy(update={"api_key": api_key})
    else:
        # This case is for local models like Ollama that don't require an API key
        logger.info("No API key environment variable for provider '%s'.", provider_name)
        return cfg.model_copy(update={"api_key": None})


def save_settings_to_file(cfg: AppConfig) -> None:
    """Saves the application configuration to a YAML file."""
    config_dir = get_config_dir()
    config_file = config_dir / CONFIG_FILE_NAME
    config_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Exclude the runtime-only api_key field from being saved
        config_to_save = cfg.model_dump(exclude={"api_key"})
        with open(config_file, "w", encoding="utf-8") as f:
            yaml.dump(config_to_save, f, default_flow_style=False, sort_keys=False)
        logger.info("Successfully saved settings to %s", config_file)
    except (yaml.YAMLError, OSError) as e:
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
        default_config = AppConfig()
        save_settings_to_file(default_config)
        return load_api_key_for_provider(default_config)

    try:
        with open(config_file, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}
        app_config = AppConfig(**config_data)
    except (yaml.YAMLError, ValidationError, TypeError) as e:
        logger.error("Failed to load or validate config file: %s", e, exc_info=True)
        logger.warning("Falling back to default configuration.")
        app_config = AppConfig()

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
    
    def load_config(self) -> AppConfig:
        """
        Load configuration from file (called once at startup).
        
        Returns:
            Loaded AppConfig instance
        """
        if self._config is not None:
            logger.debug("Config already loaded. Returning existing config.")
            return self._config
        
        config_dir = get_config_dir()
        self._config_file_path = config_dir / CONFIG_FILE_NAME
        self._config = load_settings_from_file()
        logger.info(f"Configuration loaded from {self._config_file_path}")
        return self._config
    
    def get_config(self) -> AppConfig:
        """
        Get the current configuration.
        
        Returns:
            Current AppConfig instance
            
        Raises:
            RuntimeError: If config has not been loaded
        """
        if self._config is None:
            raise RuntimeError("Config not loaded. Call load_config() first.")
        return self._config
    
    def update_config(self, new_config: AppConfig) -> AppConfig:
        """
        Update configuration and save to file.
        Publishes config change event.
        
        Args:
            new_config: New configuration instance
            
        Returns:
            Updated config with API key loaded
        """
        # Load API key for new config
        updated_config = load_api_key_for_provider(new_config)
        
        # Save to file
        save_settings_to_file(updated_config)
        
        # Update cached config
        self._config = updated_config
        
        # Publish config change event (async, will be handled by event bus subscribers)
        logger.info("Configuration updated")
        
        return updated_config
    
    def reload_config(self) -> AppConfig:
        """
        Reload configuration from file.
        
        Returns:
            Reloaded AppConfig instance
        """
        self._config = load_settings_from_file()
        logger.info("Configuration reloaded from file")
        
        return self._config


# Global config manager instance
_config_manager = ConfigManager()


def get_config_manager() -> ConfigManager:
    """Get the global config manager instance."""
    return _config_manager

