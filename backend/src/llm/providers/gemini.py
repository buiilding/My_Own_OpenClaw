import logging
from typing import Any, Dict

from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(OnlineLLMProvider):
    """Provider for Google Gemini models."""

    provider_label = "Gemini"
    model_prefix = "gemini"
    stream_includes_thinking = True
    invalid_response_message = "Invalid response structure from Gemini"

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
    ) -> Dict[str, Any]:
        provider_name = "gemini"
        if (
            provider_name in ONLINE_THINKING_MODELS
            and model in ONLINE_THINKING_MODELS[provider_name]
        ):
            # Prefer low-effort reasoning for Gemini thinking models
            params["reasoning_effort"] = "low"
        return params
