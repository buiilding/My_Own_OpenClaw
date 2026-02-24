import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.core.types.schemas import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(LLMProvider):
    """Provider for OpenRouter."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        # Default base_url for OpenRouter if not provided
        if base_url is None:
            base_url = "https://openrouter.ai/api/v1"
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """OpenRouter requires an API key."""
        if not self.api_key:
            raise ValueError("OpenRouterProvider requires an 'api_key'.")

    def _build_completion_params(
        self,
        model: str,
        messages: List[LLMMessage],
        tool_defs: Optional[List[Dict[str, Any]]],
        preferred_tool: Optional[Any],
        allow_parallel_calls: Optional[bool],
        cache_key: Optional[str],
        include_stream: bool = False,
    ) -> Dict[str, Any]:
        """Build completion params shared by stream/non-stream paths."""
        params = self._build_request_params(
            model,
            messages,
            tools=tool_defs,
            tool_choice=preferred_tool,
            parallel_tool_calls=allow_parallel_calls,
            prompt_cache_key=cache_key,
        )
        if include_stream:
            self._enable_stream_with_usage(params)
        return params

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        params = self._build_completion_params(
            model,
            messages,
            tools,
            tool_choice,
            parallel_tool_calls,
            prompt_cache_key,
        )
        return await self._get_completion_with_standard_errors(
            provider_label="OpenRouter",
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
        params = self._build_completion_params(
            model,
            messages,
            tools,
            tool_choice,
            parallel_tool_calls,
            prompt_cache_key,
            include_stream=True,
        )
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            self._record_stream_usage_from_chunk(chunk)
            delta = self._extract_stream_delta(chunk)
            content = self._extract_delta_content(delta)
            if content:
                yield ChunkEvent(content=content)

    async def list_models(self) -> List[Dict[str, str]]:
        """Lists available OpenRouter models."""
        return []

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("openrouter/"):
            return model_id
        return f"openrouter/{model_id}"
