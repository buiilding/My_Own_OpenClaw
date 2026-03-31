import asyncio
from typing import Any, Dict, List

import litellm

from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.provider_native_reasoning import (
    apply_provider_native_thinking_request_params,
    extract_gemini_text_content,
    extract_gemini_thinking_content,
)
from backend.src.llm.providers.streaming_tool_call_aggregation import (
    StreamingToolCallAggregationMixin,
)
from backend.src.tools.web_search.source_normalization import extract_gemini_web_search_sources


class GeminiProvider(StreamingToolCallAggregationMixin, OnlineLLMProvider):
    """Provider for Google Gemini models."""

    provider_label = "Gemini"
    model_prefix = "gemini"
    stream_includes_thinking = True
    invalid_response_message = "Invalid response structure from Gemini"
    tool_turn_invalid_response_message = "Invalid response from Gemini stream"
    tool_turn_parse_warning_prefix = "Failed to parse streamed Gemini tool-call arguments"

    @staticmethod
    def _append_native_web_search_tool(
        params: Dict[str, Any],
        *,
        native_web_search_enabled: bool,
    ) -> Dict[str, Any]:
        if not native_web_search_enabled:
            return params
        tools = list(params.get("tools") or [])
        tools.append({"google_search": {}})
        params["tools"] = tools
        return params

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
        params["temperature"] = 1.0
        apply_provider_native_thinking_request_params(
            params,
            model=model,
            provider_name="gemini",
        )
        _ = runtime_model_id
        return params

    @staticmethod
    def _is_native_web_search_async_transform_gap(exc: Exception) -> bool:
        message = str(exc or "")
        return "Vertex AI has a custom implementation of transform_request" in message

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        native_web_search_enabled = bool(request_kwargs.get("native_web_search_enabled"))
        params = self._build_standard_completion_params(
            model,
            messages,
            tools=request_kwargs.get("tools"),
            tool_choice=request_kwargs.get("tool_choice"),
            parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
            prompt_cache_key=request_kwargs.get("prompt_cache_key"),
            max_output_tokens=request_kwargs.get("max_output_tokens"),
        )
        params = self._append_native_web_search_tool(
            params,
            native_web_search_enabled=native_web_search_enabled,
        )
        try:
            response = await litellm.acompletion(**params)
        except Exception as exc:
            if not (
                native_web_search_enabled
                and self._is_native_web_search_async_transform_gap(exc)
            ):
                raise
            # LiteLLM's async Gemini/Vertex path currently misses the custom
            # transform_request implementation needed for google_search tools.
            response = await asyncio.to_thread(litellm.completion, **params)
        self._record_usage_from_payload_container(response)
        normalized = self._extract_completion_response(
            response,
            model=model,
            invalid_response_message=self.invalid_response_message,
        )
        web_search_sources = extract_gemini_web_search_sources(response)
        if web_search_sources:
            normalized["web_search_sources"] = web_search_sources
        return normalized

    def _augment_stream_response_payload(
        self,
        normalized_response: NormalizedLLMResponse,
        *,
        last_chunk: Any,
        model: str,
    ) -> NormalizedLLMResponse:
        _ = model
        web_search_sources = extract_gemini_web_search_sources(last_chunk)
        if web_search_sources:
            normalized_response["web_search_sources"] = web_search_sources
        return normalized_response

    async def _open_stream(
        self,
        *,
        model: str,
        messages: List[LLMMessage],
        completion_kwargs: Dict[str, Any],
    ) -> Any:
        params = self._build_stream_completion_params(
            model=model,
            messages=messages,
            tools=completion_kwargs.get("tools"),
            tool_choice=completion_kwargs.get("tool_choice"),
            parallel_tool_calls=completion_kwargs.get("parallel_tool_calls"),
            prompt_cache_key=completion_kwargs.get("prompt_cache_key"),
            max_output_tokens=completion_kwargs.get("max_output_tokens"),
        )
        params = self._append_native_web_search_tool(
            params,
            native_web_search_enabled=bool(completion_kwargs.get("native_web_search_enabled")),
        )
        return await litellm.acompletion(**params)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Gemini stream payloads include tool-call deltas + reasoning chunks.
        """
        _ = model
        return True
