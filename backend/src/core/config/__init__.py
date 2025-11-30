"""
Core Configuration Package.

This package handles application configuration, loading, and validation.
"""
from backend.src.core.config.models import (
    AppConfig,
    LLMProviders,
    OpenAIConfig,
    AnthropicConfig,
    GeminiConfig,
    OllamaConfig,
    OpenRouterConfig,
    MistralConfig,
    LMStudioConfig,
    Preferences,
)
from backend.src.core.config.manager import (
    ConfigManager,
    get_config_manager,
    get_config_dir,
    load_settings_from_file,
    save_settings_to_file,
    load_api_key_for_provider,
    APP_NAME,
    CONFIG_FILE_NAME,
)

__all__ = [
    "AppConfig",
    "LLMProviders",
    "OpenAIConfig",
    "AnthropicConfig",
    "GeminiConfig",
    "OllamaConfig",
    "OpenRouterConfig",
    "MistralConfig",
    "LMStudioConfig",
    "Preferences",
    "ConfigManager",
    "get_config_manager",
    "get_config_dir",
    "load_settings_from_file",
    "save_settings_to_file",
    "load_api_key_for_provider",
    "APP_NAME",
    "CONFIG_FILE_NAME",
]
