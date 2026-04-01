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
    KimiCodingConfig,
)
from backend.src.core.config.loader import (
    build_runtime_config,
    get_default_tts_model_path,
    load_api_key_for_provider,
    load_settings_from_file,
)
from backend.src.core.config.domains import (
    browser_runtime_config,
    memory_config,
    provider_model_config,
    security_transport_config,
    session_runtime_config,
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
    "KimiCodingConfig",
    "provider_model_config",
    "session_runtime_config",
    "browser_runtime_config",
    "memory_config",
    "security_transport_config",
    "ConfigManager",
    "get_config_manager",
    "load_settings_from_file",
    "build_runtime_config",
    "load_api_key_for_provider",
    "get_default_tts_model_path",
    "apply_runtime_policies",
    "assemble_runtime_config",
]
