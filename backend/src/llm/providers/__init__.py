from functools import lru_cache
import logging
from typing import Any, Dict, Optional, Tuple, Type

from backend.src.core.config import AppConfig
from backend.src.llm.providers.anthropic import AnthropicProvider
from backend.src.llm.providers.base import LLMProvider
from backend.src.llm.providers.gemini import GeminiProvider
from backend.src.llm.providers.kimi_coding import KimiCodingProvider
from backend.src.llm.providers.local import LMStudioProvider, OllamaProvider
from backend.src.llm.providers.mistral import MistralProvider
from backend.src.llm.providers.openai import OpenAIProvider
from backend.src.llm.providers.openrouter import OpenRouterProvider

logger = logging.getLogger(__name__)


def _normalize_base_url(base_url: Optional[str], default: str) -> str:
    """Normalize provider URLs for stable cache keys and consistent provider config."""
    candidate = (base_url or "").strip()
    if not candidate:
        candidate = default
    return candidate.rstrip("/") or default


def _normalize_provider_name(provider_name: str) -> str:
    normalized = provider_name.lower().strip()
    if normalized in ("kimi-code", "kimi_code", "kimi-coding", "kimi_coding"):
        return "kimi-coding"
    return normalized


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


def _canonicalize_provider_urls(cfg: AppConfig) -> Tuple[str, str, str, str]:
    """
    Extract and canonicalize provider base URLs from config.
    
    Returns:
        Tuple of (ollama_url, lmstudio_url, openrouter_url, kimi_code_url) with defaults applied
    """
    providers = cfg.llm_providers

    ollama_url = _normalize_base_url(
        providers.ollama.base_url if providers and providers.ollama else None,
        "http://localhost:11434/v1",
    )
    lmstudio_url = _normalize_base_url(
        providers.lmstudio.base_url if providers and providers.lmstudio else None,
        "http://localhost:1234/v1",
    )
    openrouter_url = _normalize_base_url(
        providers.openrouter.base_url if providers and providers.openrouter else None,
        "https://openrouter.ai/api/v1",
    )
    kimi_code_url = _normalize_base_url(
        providers.kimi_coding.base_url if providers and providers.kimi_coding else None,
        "https://api.kimi.com/coding/v1",
    )
    
    return (ollama_url, lmstudio_url, openrouter_url, kimi_code_url)


def _register_provider(
    factory: Dict[str, LLMProvider],
    *,
    key: str,
    label: str,
    provider_cls: Type[LLMProvider],
    **kwargs: Any,
) -> None:
    """Create and register a provider, swallowing config errors."""
    try:
        factory[key] = provider_cls(**kwargs)
    except ValueError as exc:
        logger.debug("%s provider initialization failed: %s", label, exc)


@lru_cache(maxsize=16)
def _create_cached_provider_factory(
    api_key: Optional[str],
    timeout_str: str,
    ollama_url: str,
    lmstudio_url: str,
    openrouter_url: str,
    kimi_code_url: str,
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
        _register_provider(
            factory,
            key="openai",
            label="OpenAI",
            provider_cls=OpenAIProvider,
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        )
        _register_provider(
            factory,
            key="gemini",
            label="Gemini",
            provider_cls=GeminiProvider,
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        )
        _register_provider(
            factory,
            key="anthropic",
            label="Anthropic",
            provider_cls=AnthropicProvider,
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        )
        _register_provider(
            factory,
            key="openrouter",
            label="OpenRouter",
            provider_cls=OpenRouterProvider,
            api_key=api_key,
            base_url=openrouter_url,
            timeout=timeout,
        )
        _register_provider(
            factory,
            key="mistral",
            label="Mistral",
            provider_cls=MistralProvider,
            api_key=api_key,
            base_url=None,
            timeout=timeout,
        )
        _register_provider(
            factory,
            key="kimi-coding",
            label="Kimi Coding",
            provider_cls=KimiCodingProvider,
            api_key=api_key,
            base_url=kimi_code_url,
            timeout=timeout,
        )

    # Local providers don't require API keys (but may fail at runtime if not running)
    _register_provider(
        factory,
        key="ollama",
        label="Ollama",
        provider_cls=OllamaProvider,
        base_url=ollama_url,
        timeout=timeout,
    )
    _register_provider(
        factory,
        key="lmstudio",
        label="LM Studio",
        provider_cls=LMStudioProvider,
        base_url=lmstudio_url,
        timeout=timeout,
    )
    
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
    ollama_url, lmstudio_url, openrouter_url, kimi_code_url = _canonicalize_provider_urls(cfg)
    
    # Convert timeout to string for cache key consistency (handles None/edge cases)
    timeout_str = str(cfg.llm_timeout) if cfg.llm_timeout is not None else "60.0"
    
    # Use cached factory with hashable primitives (not the AppConfig object)
    return _create_cached_provider_factory(
        api_key=cfg.api_key,
        timeout_str=timeout_str,
        ollama_url=ollama_url,
        lmstudio_url=lmstudio_url,
        openrouter_url=openrouter_url,
        kimi_code_url=kimi_code_url,
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
    name = _normalize_provider_name(provider_name) if provider_name else ""
    
    logger.info(
        "[Provider Selection] Requested provider='%s' (normalized='%s'), "
        "config.model_provider='%s', config.api_key=%s, available_providers=%s",
        provider_name,
        name,
        cfg.model_provider,
        "set" if cfg.api_key else "not set",
        list(factory.keys()),
    )
    
    # If provider name specified, return it or raise
    if name:
        if name in factory:
            logger.info("[Provider Selection] Using provider '%s'", name)
            return factory[name]
        
        # Provider not available
        available_names = list(factory.keys())
        logger.error(
            "[Provider Selection] Provider '%s' not available. Requested='%s', Available=%s, "
            "Config provider='%s', API key=%s",
            provider_name,
            name,
            available_names,
            cfg.model_provider,
            "set" if cfg.api_key else "not set",
        )
        raise ValueError(
            f"LLM Provider '{provider_name}' is not configured or invalid. "
            f"Available providers: {available_names if available_names else 'none'}. "
            "Check your app_config.py and API keys."
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
        "Please set 'model_provider' in app_config.py and ensure you have "
        "the required API keys or local providers running. "
        "Available provider types: openai, anthropic, gemini, mistral, openrouter, kimi-coding, ollama, lmstudio"
    )
