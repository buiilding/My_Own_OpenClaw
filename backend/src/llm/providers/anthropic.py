"""Provides the anthropic module for the backend."""

import logging
from typing import Any, Dict

from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.provider_native_reasoning import (
    apply_provider_native_thinking_request_params,
    extract_anthropic_thinking_content,
)
from backend.src.llm.providers.streaming_tool_call_aggregation import (
    StreamingToolCallAggregationMixin,
)

logger = logging.getLogger(__name__)


class AnthropicProvider(StreamingToolCallAggregationMixin, OnlineLLMProvider):
    """Provider for Anthropic models."""

    provider_label = "Anthropic"
    model_prefix = "anthropic"
    stream_includes_thinking = True
    tool_turn_invalid_response_message = "Invalid response from Anthropic stream"
    tool_turn_parse_warning_prefix = (
        "Failed to parse streamed Anthropic tool-call arguments"
    )

    def _extract_thinking_content(self, delta: Any) -> str | None:
        return extract_anthropic_thinking_content(delta)

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
            provider_name="anthropic",
        )
        _ = runtime_model_id
        return params

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Anthropic streams text/thinking while tool-use blocks are buffered until finalization.
        """
        _ = model
        return True
