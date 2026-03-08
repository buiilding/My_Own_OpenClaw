import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.models.models_config import resolve_provider_thinking_preference
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.openai_responses_runtime import (
    get_openai_responses_completion,
    stream_openai_responses_events,
)

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

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        if self._uses_native_reasoning_runtime(model):
            return await get_openai_responses_completion(
                self,
                model=model,
                messages=messages,
                tools=request_kwargs.get("tools"),
                tool_choice=request_kwargs.get("tool_choice"),
                parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
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
        if self._uses_native_reasoning_runtime(model):
            async for event in stream_openai_responses_events(
                self,
                model=model,
                messages=messages,
                tools=request_kwargs.get("tools"),
                tool_choice=request_kwargs.get("tool_choice"),
                parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
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
