import logging
from typing import Any, Dict

from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.models.models_config import resolve_model_preset
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
        preset = resolve_model_preset(model)
        thinking_override = (
            preset.get("supports_thinking")
            if isinstance(preset, dict) and isinstance(preset.get("supports_thinking"), bool)
            else None
        )
        provider_name = "anthropic"
        enable_thinking = (
            thinking_override is True
            or (
                thinking_override is None
                and provider_name in ONLINE_THINKING_MODELS
                and model in ONLINE_THINKING_MODELS[provider_name]
            )
        )

        if enable_thinking:
            params["thinking"] = {"type": "enabled", "budget_tokens": DEFAULT_THINKING_TOKEN_BUDGET}
        elif thinking_override is False and "thinking" in params:
            params.pop("thinking", None)

        _ = runtime_model_id
        return params
