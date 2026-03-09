import logging
from typing import Any, Dict

from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.provider_native_reasoning import (
    apply_provider_native_thinking_request_params,
    extract_anthropic_thinking_content,
)

logger = logging.getLogger(__name__)


class AnthropicProvider(OnlineLLMProvider):
    """Provider for Anthropic models."""

    provider_label = "Anthropic"
    model_prefix = "anthropic"
    stream_includes_thinking = True

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
