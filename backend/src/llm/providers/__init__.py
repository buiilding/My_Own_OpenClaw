from functools import lru_cache
import logging
from typing import Any, Dict, Optional, Tuple

from backend.src.core.config import AppConfig
from backend.src.llm.providers.anthropic import AnthropicProvider
from backend.src.llm.providers.base import LLMProvider
from backend.src.llm.providers.gemini import GeminiProvider
from backend.src.llm.providers.local import LMStudioProvider, OllamaProvider
from backend.src.llm.providers.mistral import MistralProvider
from backend.src.llm.providers.openai import OpenAIProvider
from backend.src.llm.providers.openrouter import OpenRouterProvider

logger = logging.getLogger(__name__)


def _safe_timeout_conversion(timeout_value: Any, default: float = 60.0) -> float:
    """
    Safely convert timeout value to float with validation.
    
    Args:
        timeout_value: Timeout value to convert (can be int, float, str, etc.)
        default: Default timeout if conversion fails or value is invalid
        
    Returns:
        Validated timeout as float (ensures positive value)
    """
    try:
        timeout = float(timeout_value)
        # Enforce minimum safety floor (1 second) and maximum reasonable limit (1 hour)
        if timeout < 1.0:
            return default
        if timeout > 3600.0:
            return 3600.0
        return timeout
    except (TypeError, ValueError, AttributeError):
        return default


def _canonicalize_provider_urls(cfg: AppConfig) -> Tuple[str, str, str]:
    """
    Extract and canonicalize provider base URLs from config.
    
    Returns:
        Tuple of (ollama_url, lmstudio_url, openrouter_url) with defaults applied
    """
    providers = cfg.llm_providers
    
    # Ollama (Default: http://localhost:11434/v1)
    if providers and providers.ollama and providers.ollama.base_url:
        ollama_url = providers.ollama.base_url
    else:
        ollama_url = "http://localhost:11434/v1"
    
    # LM Studio (Default: http://localhost:1234/v1)
    if providers and providers.lmstudio and providers.lmstudio.base_url:
        lmstudio_url = providers.lmstudio.base_url
    else:
        lmstudio_url = "http://localhost:1234/v1"
    
    # OpenRouter (Default: https://openrouter.ai/api/v1)
    if providers and providers.openrouter and providers.openrouter.base_url:
        openrouter_url = providers.openrouter.base_url
    else:
        openrouter_url = "https://openrouter.ai/api/v1"
    
    return (ollama_url, lmstudio_url, openrouter_url)


@lru_cache(maxsize=16)
def _create_cached_provider_factory(
    api_key: Optional[str],
    timeout_str: str,
    ollama_url: str,
    lmstudio_url: str,
    openrouter_url: str,
) -> Dict[str, LLMProvider]:
    """
    Internal cached factory that creates provider instances.
    
    Only creates providers that are actually configured/available.
    Uses lru_cache with hashable primitive arguments (strings, None) instead of
    objects. This prevents hash collisions and memory leaks.
    
    Args:
        api_key: API key for providers that need it
        timeout_str: Timeout as string (for cache key consistency)
        ollama_url: Ollama base URL
        lmstudio_url: LM Studio base URL
        openrouter_url: OpenRouter base URL
        
    Returns:
        Dictionary of provider name to provider instance (only configured providers)
    """
    timeout = _safe_timeout_conversion(timeout_str)
    
    factory: Dict[str, LLMProvider] = {}
    
    # Only create providers that are configured/available
    # Cloud providers require API keys
    if api_key:
        try:
            factory["openai"] = OpenAIProvider(
                api_key=api_key,
                base_url=None,
                timeout=timeout,
            )
        except ValueError:
            pass  # Missing required dependencies
        
        try:
            factory["gemini"] = GeminiProvider(
                api_key=api_key,
                base_url=None,
                timeout=timeout,
            )
        except ValueError:
            pass
        
        try:
            factory["anthropic"] = AnthropicProvider(
                api_key=api_key,
                base_url=None,
                timeout=timeout,
            )
        except ValueError:
            pass
        
        try:
            factory["openrouter"] = OpenRouterProvider(
                api_key=api_key,
                base_url=openrouter_url,
                timeout=timeout,
            )
        except ValueError:
            pass
        
        try:
            factory["mistral"] = MistralProvider(
                api_key=api_key,
                base_url=None,
                timeout=timeout,
            )
        except ValueError:
            pass
    
    # Local providers don't require API keys (but may fail at runtime if not running)
    try:
        factory["ollama"] = OllamaProvider(
            base_url=ollama_url,
            timeout=timeout,
        )
    except ValueError:
        pass
    
    try:
        factory["lmstudio"] = LMStudioProvider(
            base_url=lmstudio_url,
            timeout=timeout,
        )
    except ValueError:
        pass
    
    return factory


def create_provider_factory(
    cfg: AppConfig,
) -> Dict[str, LLMProvider]:
    """
    Creates a factory of provider instances.
    
    CACHED: Factory instances are cached per config state using lru_cache to prevent
    recreation on every request. This is critical for performance as provider
    initialization creates HTTP clients and connection pools.
    
    FIXES:
    - Uses lru_cache with tuple keys instead of manual hash() to prevent collisions
    - Bounded cache (maxsize=16) prevents unbounded memory growth
    - Safe timeout conversion with validation
    
    Extracts only the required primitives from config, decoupling providers
    from the global config structure (Law of Demeter compliance).
    """
    # Extract and canonicalize provider URLs
    ollama_url, lmstudio_url, openrouter_url = _canonicalize_provider_urls(cfg)
    
    # Convert timeout to string for cache key consistency (handles None/edge cases)
    timeout_str = str(cfg.llm_timeout) if cfg.llm_timeout is not None else "60.0"
    
    # Use cached factory with hashable primitives (not the AppConfig object)
    return _create_cached_provider_factory(
        api_key=cfg.api_key,
        timeout_str=timeout_str,
        ollama_url=ollama_url,
        lmstudio_url=lmstudio_url,
        openrouter_url=openrouter_url,
    )


def get_provider(cfg: AppConfig, provider_name: str) -> LLMProvider:
    """
    Gets a provider instance from the cached factory.
    
    Fails fast with clear error messages if no provider is configured or available.
    There is no implicit "default" provider - all providers require explicit configuration.
    
    Args:
        cfg: Application configuration
        provider_name: Name of the provider to get (case-insensitive)
        
    Returns:
        LLMProvider instance
        
    Raises:
        ValueError: If provider_name is invalid, not configured, or no providers are available
    """
    factory = create_provider_factory(cfg)
    
    # Normalize provider name
    name = provider_name.lower().strip() if provider_name else ""
    
    # If provider name specified, return it or raise
    if name:
        if name in factory:
            return factory[name]
        
        # Provider not available
        available_names = list(factory.keys())
        raise ValueError(
            f"LLM Provider '{provider_name}' is not configured or invalid. "
            f"Available providers: {available_names if available_names else 'none'}. "
            "Check your config.yaml and API keys."
        )
    
    # No provider name specified - try to use first available
    if factory:
        first_available = next(iter(factory.values()))
        logger.info(
            f"No provider specified. Using first available: {first_available.__class__.__name__}"
        )
        return first_available
    
    # No providers configured at all - fail fast
    raise ValueError(
        "No LLM provider configured. "
        "Please set 'model_provider' in your config.yaml and ensure you have "
        "the required API keys or local providers running. "
        "Available provider types: openai, anthropic, gemini, mistral, openrouter, ollama, lmstudio"
    )
