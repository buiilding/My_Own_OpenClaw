import logging
from typing import Any, Dict

from backend.src.llm.models.models_config import resolve_provider_thinking_preference
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
        runtime_model_id: str | None = None,
    ) -> Dict[str, Any]:
        thinking_preference = resolve_provider_thinking_preference(
            model_id=model,
            provider_name="anthropic",
        )
        if thinking_preference is True:
            params["thinking"] = {"type": "enabled", "budget_tokens": DEFAULT_THINKING_TOKEN_BUDGET}
        elif thinking_preference is False and "thinking" in params:
            params.pop("thinking", None)

        _ = runtime_model_id
        return params
