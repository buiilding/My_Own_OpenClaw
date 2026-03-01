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
