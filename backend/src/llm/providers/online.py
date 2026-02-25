from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm

from backend.src.core.events.streaming_events import StreamingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.base import LLMProvider


class OnlineLLMProvider(LLMProvider):
    """Shared base provider for online LiteLLM-backed providers."""

    provider_label: str = ""
    model_prefix: Optional[str] = None
    stream_includes_thinking: bool = False
    invalid_response_message: Optional[str] = None
    _REQUEST_OPTION_KEYS = (
        "tools",
        "tool_choice",
        "parallel_tool_calls",
        "prompt_cache_key",
    )

    def _validate_dependencies(self) -> None:
        """Online providers require an API key."""
        self._require_api_key(self.__class__.__name__)

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        options = self._extract_request_options(request_kwargs)
        return await self._get_completion_with_standard_params(
            provider_label=self._provider_label_for_request(),
            model=model,
            messages=messages,
            invalid_response_message=self.invalid_response_message,
            **options,
        )

    def _build_stream_completion_params(
        self,
        *,
        model: str,
        messages: List[LLMMessage],
        **completion_kwargs: Any,
    ) -> Dict[str, Any]:
        """Build standard stream params with usage metadata enabled."""
        return self._build_standard_completion_params(
            model,
            messages,
            include_stream=True,
            **completion_kwargs,
        )

    def _build_stream_request_kwargs(
        self,
        *,
        model: str,
        messages: List[LLMMessage],
        completion_kwargs: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build normalized kwargs payload used by provider stream implementations."""
        return self._build_stream_completion_params(
            model=model,
            messages=messages,
            **completion_kwargs,
        )

    @classmethod
    def _extract_request_options(
        cls,
        request_kwargs: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Extract provider request options supported by base completion helpers."""
        return {key: request_kwargs.get(key) for key in cls._REQUEST_OPTION_KEYS}

    async def _open_stream(
        self,
        *,
        model: str,
        messages: List[LLMMessage],
        completion_kwargs: Dict[str, Any],
    ) -> Any:
        """Open a provider stream with normalized request options."""
        params = self._build_stream_request_kwargs(
            model=model,
            messages=messages,
            completion_kwargs=self._extract_request_options(completion_kwargs),
        )
        return await litellm.acompletion(**params)

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Internal streaming implementation. Exceptions bubble up to base class."""
        params = self._build_stream_request_kwargs(
            model=model,
            messages=messages,
            completion_kwargs=self._extract_request_options(request_kwargs),
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
