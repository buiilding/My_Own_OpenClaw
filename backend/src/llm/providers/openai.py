import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events.streaming_events import StreamingEvent
from backend.src.core.types.schemas import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """Provider for OpenAI models."""

    def _validate_dependencies(self) -> None:
        """OpenAI requires an API key."""
        self._require_api_key("OpenAIProvider")

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        return await self._get_completion_with_standard_params(
            provider_label="OpenAI",
            model=model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
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
        """Internal streaming implementation. Exceptions bubble up to base class."""
        params = self._build_standard_completion_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
            include_stream=True,
        )
        async for event in self._stream_text_content_events(params):
            yield event

    async def list_models(self) -> List[Dict[str, str]]:
        """
        Lists available OpenAI models.
        Note: For online providers, we typically use the static configuration
        instead of making API calls, to save on latency/rate limits.
        """
        return []

    def _get_full_model_string(self, model_id: str) -> str:
        return model_id
