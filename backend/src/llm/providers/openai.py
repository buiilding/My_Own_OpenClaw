import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.models.models_config import resolve_provider_thinking_preference
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.openai_responses_input import OPENAI_IMAGE_DETAIL
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
    def _with_original_image_detail(messages: List[LLMMessage]) -> List[LLMMessage]:
        changed = False
        normalized_messages: List[LLMMessage] = []

        for message in messages:
            content = message.get("content") if isinstance(message, dict) else None
            if not isinstance(content, list):
                normalized_messages.append(message)
                continue

            normalized_content = []
            message_changed = False
            for part in content:
                if not isinstance(part, dict) or part.get("type") != "image_url":
                    normalized_content.append(part)
                    continue

                image_url = part.get("image_url")
                if isinstance(image_url, dict):
                    updated_image_url = dict(image_url)
                    updated_image_url["detail"] = OPENAI_IMAGE_DETAIL
                elif isinstance(image_url, str) and image_url:
                    updated_image_url = {
                        "url": image_url,
                        "detail": OPENAI_IMAGE_DETAIL,
                    }
                else:
                    normalized_content.append(part)
                    continue

                updated_part = dict(part)
                updated_part["image_url"] = updated_image_url
                normalized_content.append(updated_part)
                message_changed = True

            if message_changed:
                updated_message = dict(message)
                updated_message["content"] = normalized_content
                normalized_messages.append(updated_message)
                changed = True
            else:
                normalized_messages.append(message)

        return normalized_messages if changed else messages

    @staticmethod
    def _normalize_messages_for_provider(
        messages: List[LLMMessage],
        *,
        model: str,
    ) -> List[LLMMessage]:
        normalized_messages = OnlineLLMProvider._normalize_messages_for_provider(
            messages,
            model=model,
        )
        return OpenAIProvider._with_original_image_detail(normalized_messages)

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
        tools: Optional[List[Dict[str, Any]]] = None,
        native_web_search_enabled: bool = False,
    ) -> bool:
        _ = tools
        return cls._uses_native_reasoning_runtime(model) or native_web_search_enabled

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        native_web_search_enabled = bool(
            request_kwargs.get("native_web_search_enabled")
        )
        if self._uses_responses_runtime(
            model,
            tools=request_kwargs.get("tools"),
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
                previous_response_id=request_kwargs.get("previous_response_id"),
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
        native_web_search_enabled = bool(
            request_kwargs.get("native_web_search_enabled")
        )
        if self._uses_responses_runtime(
            model,
            tools=request_kwargs.get("tools"),
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
                previous_response_id=request_kwargs.get("previous_response_id"),
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
