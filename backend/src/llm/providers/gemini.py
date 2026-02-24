import logging
from typing import Any, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage
from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(OnlineLLMProvider):
    """Provider for Google Gemini models."""

    provider_label = "Gemini"
    model_prefix = "gemini"
    stream_includes_thinking = True
    invalid_response_message = "Invalid response structure from Gemini"

    def _build_request_params(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> dict:
        params = super()._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        provider_name = "gemini"
        if (
            provider_name in ONLINE_THINKING_MODELS
            and model in ONLINE_THINKING_MODELS[provider_name]
        ):
            # Prefer low-effort reasoning for Gemini thinking models
            params["reasoning_effort"] = "low"
        return params
