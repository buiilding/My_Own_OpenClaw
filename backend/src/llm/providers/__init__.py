from typing import Dict, Optional

from backend.src.core.config import AppConfig
from backend.src.llm.providers.anthropic import AnthropicProvider
from backend.src.llm.providers.base import LLMProvider
from backend.src.llm.providers.default import DefaultProvider
from backend.src.llm.providers.gemini import GeminiProvider
from backend.src.llm.providers.local import LMStudioProvider, OllamaProvider
from backend.src.llm.providers.mistral import MistralProvider
from backend.src.llm.providers.openai import OpenAIProvider
from backend.src.llm.providers.openrouter import OpenRouterProvider


def create_provider_factory(
    cfg: AppConfig,
) -> Dict[str, LLMProvider]:
    """
    Creates a factory of provider instances.
    
    Extracts only the required primitives from config, decoupling providers
    from the global config structure (Law of Demeter compliance).
    """
    # Extract common values
    api_key = cfg.api_key
    timeout = float(cfg.llm_timeout)
    
    # Extract provider-specific configs safely
    ollama_config = cfg.llm_providers.ollama if cfg.llm_providers else None
    ollama_base_url = ollama_config.base_url if ollama_config else "http://localhost:11434/v1"
    
    lmstudio_config = cfg.llm_providers.lmstudio if cfg.llm_providers else None
    lmstudio_base_url = lmstudio_config.base_url if lmstudio_config else "http://localhost:1234/v1"
    
    openrouter_config = cfg.llm_providers.openrouter if cfg.llm_providers else None
    openrouter_base_url = (
        getattr(openrouter_config, "base_url", None)
        if openrouter_config
        else None
    )
    
    return {
        "openai": OpenAIProvider(
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        ),
        "gemini": GeminiProvider(
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        ),
        "anthropic": AnthropicProvider(
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        ),
        "ollama": OllamaProvider(
            base_url=ollama_base_url,
            timeout=timeout,
        ),
        "openrouter": OpenRouterProvider(
            api_key=api_key,
            base_url=openrouter_base_url,
            timeout=timeout,
        ),
        "mistral": MistralProvider(
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        ),
        "lmstudio": LMStudioProvider(
            base_url=lmstudio_base_url,
            timeout=timeout,
        ),
        "default": DefaultProvider(
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        ),
    }


def get_provider(cfg: AppConfig, provider_name: str) -> LLMProvider:
    """Gets a provider instance from the factory."""
    factory = create_provider_factory(cfg)
    safe_provider_name = provider_name or "default"
    return factory.get(safe_provider_name, factory["default"])
