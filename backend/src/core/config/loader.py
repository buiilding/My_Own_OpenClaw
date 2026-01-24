"""
Configuration Loader.

This module handles loading application configuration from Python config files.
Configuration is loaded from backend.src.core.config.app_config module.
"""
import importlib
import logging
import os
from pathlib import Path
import platform
from typing import Optional

from backend.src.core.config.models import AppConfig

logger = logging.getLogger(__name__)


def get_default_tts_model_path() -> str:
    """
    Get the default TTS model path.
    
    Returns:
        Default TTS model path string
    """
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
