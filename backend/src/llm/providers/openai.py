import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.models.models_config import resolve_provider_thinking_preference
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.openai_responses_runtime import (
    get_openai_responses_completion,
    stream_openai_responses_events,
)
from backend.src.llm.providers.openai_tool_prep import make_openai_chat_tools_compatible

logger = logging.getLogger(__name__)


class OpenAIProvider(OnlineLLMProvider):
    """Provider for OpenAI models."""

    provider_label = "OpenAI"
    model_prefix = None
    invalid_response_message = "Invalid response from OpenAI"

    @staticmethod
    def _uses_native_reasoning_runtime(model: str) -> bool:
        return (
            resolve_provider_thinking_preference(
                model_id=model,
                provider_name="openai",
            )
            is True
        )

    @classmethod
    def _uses_responses_runtime(
        cls,
        model: str,
        *,
        native_web_search_enabled: bool = False,
    ) -> bool:
        return cls._uses_native_reasoning_runtime(model) or native_web_search_enabled

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        native_web_search_enabled = bool(request_kwargs.get("native_web_search_enabled"))
        if self._uses_responses_runtime(
            model,
            native_web_search_enabled=native_web_search_enabled,
        ):
            return await get_openai_responses_completion(
                self,
                model=model,
                messages=messages,
                tools=request_kwargs.get("tools"),
                tool_choice=request_kwargs.get("tool_choice"),
                parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
                max_output_tokens=request_kwargs.get("max_output_tokens"),
                native_web_search_enabled=native_web_search_enabled,
                include_reasoning=self._uses_native_reasoning_runtime(model),
            )
        return await super().get_completion(
            model=model,
            messages=messages,
            **request_kwargs,
        )

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> AsyncGenerator[Any, None]:
        native_web_search_enabled = bool(request_kwargs.get("native_web_search_enabled"))
        if self._uses_responses_runtime(
            model,
            native_web_search_enabled=native_web_search_enabled,
        ):
            async for event in stream_openai_responses_events(
                self,
                model=model,
                messages=messages,
                tools=request_kwargs.get("tools"),
                tool_choice=request_kwargs.get("tool_choice"),
                parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
                max_output_tokens=request_kwargs.get("max_output_tokens"),
                native_web_search_enabled=native_web_search_enabled,
                include_reasoning=self._uses_native_reasoning_runtime(model),
                request_id=request_kwargs.get("request_id"),
            ):
                yield event
            return

        async for event in super()._stream_internal(
            model=model,
            messages=messages,
            **request_kwargs,
        ):
            yield event

    def supports_streaming_tool_turns(self, model: str) -> bool:
        return self._uses_native_reasoning_runtime(model)

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
        runtime_model_id: str | None = None,
    ) -> Dict[str, Any]:
        tools = params.get("tools")
        if isinstance(tools, list):
            params["tools"] = make_openai_chat_tools_compatible(tools)
        _ = model
        _ = runtime_model_id
        return params
