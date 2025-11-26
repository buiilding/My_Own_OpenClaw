from typing import Dict

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
    """Creates a factory of provider instances."""
    return {
        "openai": OpenAIProvider(cfg),
        "gemini": GeminiProvider(cfg),
        "anthropic": AnthropicProvider(cfg),
        "ollama": OllamaProvider(cfg),
        "openrouter": OpenRouterProvider(cfg),
        "mistral": MistralProvider(cfg),
        "lmstudio": LMStudioProvider(cfg),
        "default": DefaultProvider(cfg),
    }


def get_provider(cfg: AppConfig, provider_name: str) -> LLMProvider:
    """Gets a provider instance from the factory."""
    factory = create_provider_factory(cfg)
    safe_provider_name = provider_name or "default"
    return factory.get(safe_provider_name, factory["default"])
