import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events.streaming_events import StreamingEvent
from backend.src.core.types.schemas import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    """Provider for Google Gemini models."""

    def _validate_dependencies(self) -> None:
        """Gemini requires an API key."""
        self._require_api_key("GeminiProvider")

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        params = self._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        return await self._get_completion_with_standard_errors(
            provider_label="Gemini",
            model=model,
            params=params,
            invalid_response_message="Invalid response structure from Gemini",
        )

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation. Exceptions bubble up to base class.
        Base class handles ServiceUnavailableError as APIError.
        """
        params = self._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        self._enable_stream_with_usage(params)
        async for event in self._stream_thinking_and_text_events(params):
            yield event

    async def list_models(self) -> List[Dict[str, str]]:
        """Lists available Gemini models."""
        # Return empty list as online models are handled by static config
        return []

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

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("gemini/"):
            return model_id
        return f"gemini/{model_id}"
