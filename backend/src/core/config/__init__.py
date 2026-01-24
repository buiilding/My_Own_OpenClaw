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
    OCRConfig,
)
from backend.src.core.config.loader import (
    get_default_tts_model_path,
    load_api_key_for_provider,
    load_settings_from_file,
)
from backend.src.core.config.manager import ConfigManager, get_config_manager

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
    "OCRConfig",
    "ConfigManager",
    "get_config_manager",
    "load_settings_from_file",
    "load_api_key_for_provider",
    "get_default_tts_model_path",
]
