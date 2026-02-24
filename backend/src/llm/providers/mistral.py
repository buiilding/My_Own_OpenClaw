import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events.streaming_events import StreamingEvent
from backend.src.core.types.schemas import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class MistralProvider(LLMProvider):
    """Provider for Mistral AI models."""

    def _validate_dependencies(self) -> None:
        """Mistral requires an API key."""
        self._require_api_key("MistralProvider")

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
            provider_label="Mistral",
            model=model,
            params=params,
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
        params = self._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        self._enable_stream_with_usage(params)
        async for event in self._stream_text_content_events(params):
            yield event

    async def list_models(self) -> List[Dict[str, str]]:
        """Lists available Mistral models."""
        return []

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("mistral/"):
            return model_id
        return f"mistral/{model_id}"
