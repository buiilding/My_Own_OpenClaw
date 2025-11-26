from typing import Any, AsyncGenerator, List, Optional

from backend.src.core.config import AppConfig
from backend.src.core.types import LLMMessage
from backend.src.llm.providers.base import LLMProvider
from backend.src.llm.providers.gemini import GeminiProvider


class DefaultProvider(GeminiProvider):
    """
    Fallback provider for unknown or unset providers.
    Inherits from GeminiProvider as a safe, feature-rich default.
    """

    def __init__(self, cfg: AppConfig):
        super().__init__(cfg)
        # Do NOT modify self.config here as it is frozen

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        # We want to behave like Gemini, but we can't rely on config.model_provider
        # being "gemini". So we explicitly fetch the gemini config.
        
        provider_name = "gemini"
        provider_config = self.config.llm_providers.get_provider_config(provider_name)

        params = {
            "model": self._get_full_model_string(model),
            "messages": messages,
            "api_key": self.config.api_key,
            "base_url": self._get_base_url(provider_config),
            "timeout": self.config.llm_timeout,
        }
        
        # Add Gemini-specific thinking params if applicable
        from backend.src.llm.model_registry import THINKING_MODELS
        if (
            provider_name in THINKING_MODELS
            and model in THINKING_MODELS[provider_name]
        ):
            params["thinking"] = {"type": "enabled", "budget_tokens": 16384}
            
        return params

    def _get_full_model_string(self, model_id: str) -> str:
        # Default behavior: assume it's a Gemini model if unspecified
        if "/" not in model_id:
            return f"gemini/{model_id}"
        return model_id
