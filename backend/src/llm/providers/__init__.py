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

# Module-level cache for provider factories to prevent recreation on every call
# Key: hash of config values that affect provider initialization
# Value: Dict[str, LLMProvider] factory
_provider_factory_cache: Dict[int, Dict[str, LLMProvider]] = {}


def _get_config_cache_key(cfg: AppConfig) -> int:
    """
    Generate a cache key from config values that affect provider initialization.
    
    Since AppConfig is frozen (immutable), we can use a hash of relevant values
    to cache factories per config state.
    """
    # Build a tuple of config values that affect provider initialization
    ollama_url = cfg.llm_providers.ollama.base_url if cfg.llm_providers else "http://localhost:11434/v1"
    lmstudio_url = cfg.llm_providers.lmstudio.base_url if cfg.llm_providers else "http://localhost:1234/v1"
    openrouter_url = getattr(cfg.llm_providers.openrouter, "base_url", None) if cfg.llm_providers else None
    
    cache_tuple = (
        cfg.api_key,
        cfg.llm_timeout,
        ollama_url,
        lmstudio_url,
        openrouter_url,
    )
    
    # Use hash of tuple for cache key
    return hash(cache_tuple)


def create_provider_factory(
    cfg: AppConfig,
) -> Dict[str, LLMProvider]:
    """
    Creates a factory of provider instances.
    
    CACHED: Factory instances are cached per config state to prevent
    recreation on every request. This is critical for performance as
    provider initialization creates HTTP clients and connection pools.
    
    Extracts only the required primitives from config, decoupling providers
    from the global config structure (Law of Demeter compliance).
    """
    # Check cache first
    cache_key = _get_config_cache_key(cfg)
    if cache_key in _provider_factory_cache:
        return _provider_factory_cache[cache_key]
    
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
    
    factory = {
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
    
    # Cache the factory
    _provider_factory_cache[cache_key] = factory
    return factory


def get_provider(cfg: AppConfig, provider_name: str) -> LLMProvider:
    """
    Gets a provider instance from the cached factory.
    
    Raises:
        ValueError: If provider_name is invalid and not in factory
    """
    factory = create_provider_factory(cfg)
    safe_provider_name = provider_name or "default"
    
    if safe_provider_name not in factory:
        raise ValueError(
            f"Unknown provider: '{safe_provider_name}'. "
            f"Available providers: {', '.join(factory.keys())}"
        )
    
    return factory[safe_provider_name]
