import logging
from typing import Any, Dict

from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)

# Default thinking token budget for Anthropic models that support thinking tokens
DEFAULT_THINKING_TOKEN_BUDGET = 16384


class AnthropicProvider(OnlineLLMProvider):
    """Provider for Anthropic models."""

    provider_label = "Anthropic"
    model_prefix = "anthropic"
    stream_includes_thinking = True

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
    ) -> Dict[str, Any]:
        provider_name = "anthropic"
        if (
            provider_name in ONLINE_THINKING_MODELS
            and model in ONLINE_THINKING_MODELS[provider_name]
        ):
            params["thinking"] = {"type": "enabled", "budget_tokens": DEFAULT_THINKING_TOKEN_BUDGET}
        return params
