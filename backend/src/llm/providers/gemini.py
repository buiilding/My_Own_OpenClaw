from typing import Any, Dict

from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.streaming_tool_call_aggregation import (
    StreamingToolCallAggregationMixin,
)


class GeminiProvider(StreamingToolCallAggregationMixin, OnlineLLMProvider):
    """Provider for Google Gemini models."""

    provider_label = "Gemini"
    model_prefix = "gemini"
    stream_includes_thinking = True
    invalid_response_message = "Invalid response structure from Gemini"
    tool_turn_invalid_response_message = "Invalid response from Gemini stream"
    tool_turn_parse_warning_prefix = "Failed to parse streamed Gemini tool-call arguments"

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Gemini stream payloads include tool-call deltas + reasoning chunks.
        """
        _ = model
        return True

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
