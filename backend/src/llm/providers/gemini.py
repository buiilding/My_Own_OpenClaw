from typing import Any, Dict

from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.provider_native_reasoning import (
    apply_provider_native_thinking_request_params,
    extract_gemini_text_content,
    extract_gemini_thinking_content,
)
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

    def _extract_thinking_content(self, delta: Any) -> str | None:
        return extract_gemini_thinking_content(delta)

    def _extract_delta_content(self, delta: Any) -> str | None:
        provider_text = extract_gemini_text_content(delta)
        if provider_text is not None:
            return provider_text
        return super()._extract_delta_content(delta)

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
        runtime_model_id: str | None = None,
    ) -> Dict[str, Any]:
        apply_provider_native_thinking_request_params(
            params,
            model=model,
            provider_name="gemini",
        )
        _ = runtime_model_id
        return params

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Gemini stream payloads include tool-call deltas + reasoning chunks.
        """
        _ = model
        return True
