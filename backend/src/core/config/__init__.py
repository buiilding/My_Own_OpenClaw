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
    KimiCodingConfig,
)
from backend.src.core.config.loader import (
    get_default_tts_model_path,
    load_api_key_for_provider,
    load_settings_from_file,
)
from backend.src.core.config.manager import ConfigManager, get_config_manager
from backend.src.core.config.runtime import (
    apply_runtime_policies,
    assemble_runtime_config,
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
    "OCRConfig",
    "KimiCodingConfig",
    "ConfigManager",
    "get_config_manager",
    "load_settings_from_file",
    "load_api_key_for_provider",
    "get_default_tts_model_path",
    "apply_runtime_policies",
    "assemble_runtime_config",
]
