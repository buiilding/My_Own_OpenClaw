from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events.streaming_events import StreamingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.base import LLMProvider


class OnlineLLMProvider(LLMProvider):
    """Shared base provider for online LiteLLM-backed providers."""

    provider_label: str = ""
    model_prefix: Optional[str] = None
    stream_includes_thinking: bool = False
    invalid_response_message: Optional[str] = None

    def _validate_dependencies(self) -> None:
        """Online providers require an API key."""
        self._require_api_key(self.__class__.__name__)

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
            provider_label=self._provider_label_for_request(),
            model=model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
            invalid_response_message=self.invalid_response_message,
        )

    def _build_stream_completion_params(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build standard stream params with usage metadata enabled."""
        return self._build_standard_completion_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
            include_stream=True,
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
        params = self._build_stream_completion_params(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        stream_handler = (
            self._stream_thinking_and_text_events
            if self.stream_includes_thinking
            else self._stream_text_content_events
        )
        async for event in stream_handler(params):
            yield event

    async def list_models(self) -> List[Dict[str, str]]:
        """
        Lists available provider models.
        Note: For online providers, static config drives model availability.
        """
        return []

    def _get_full_model_string(self, model_id: str) -> str:
        prefix = self.model_prefix
        if not prefix:
            return model_id
        namespaced_model = f"{prefix}/"
        if model_id.startswith(namespaced_model):
            return model_id
        return f"{namespaced_model}{model_id}"

    def _provider_label_for_request(self) -> str:
        """Resolve provider label used in standardized provider error messages."""
        return self.provider_label or self.__class__.__name__
