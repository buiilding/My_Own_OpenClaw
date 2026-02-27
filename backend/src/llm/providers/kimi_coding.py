from typing import Any, Dict, Optional

import litellm  # compatibility import for existing monkeypatch paths in tests

from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.streaming_tool_call_aggregation import (
    StreamingToolCallAggregationMixin,
)

_LITELLM_COMPAT_IMPORT = litellm


class KimiCodingProvider(StreamingToolCallAggregationMixin, OnlineLLMProvider):
    """Provider for Kimi Coding (Anthropic-compatible endpoint)."""

    DEFAULT_BASE_URL = "https://api.kimi.com/coding"
    provider_label = "Kimi Coding"
    tool_turn_invalid_response_message = "Invalid response from Kimi Coding stream"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        if base_url is None:
            base_url = self.DEFAULT_BASE_URL
        elif base_url.endswith("/v1"):
            base_url = base_url[: -len("/v1")]
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Kimi stream path accumulates and finalizes tool-call payloads safely.
        """
        _ = model
        return True

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id == "kimi-for-coding":
            return "k2p5"
        if model_id.startswith("kimi-coding/"):
            return model_id.split("/", 1)[1]
        if model_id.startswith("kimi-code/"):
            return model_id.split("/", 1)[1]
        if model_id.startswith("anthropic/"):
            return model_id.split("/", 1)[1]
        return model_id

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
    ) -> Dict[str, Any]:
        _ = model
        params["custom_llm_provider"] = "anthropic"
        return params
