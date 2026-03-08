"""OpenAI Responses API runtime for provider-native reasoning support."""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent, ThinkingEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.openai_responses_input import (
    build_openai_responses_input,
    build_openai_responses_params,
)
from backend.src.llm.providers.openai_responses_payload import (
    normalize_openai_responses_payload,
    normalize_openai_stream_event_type,
)
from backend.src.llm.providers.response_parsing import get_value

_INVALID_OPENAI_RESPONSE = "Invalid response from OpenAI"
_REASONING_EVENT_TYPES = {
    "response.reasoning_summary_text.delta",
    "response.reasoning_text.delta",
}
_OUTPUT_TEXT_EVENT_TYPE = "response.output_text.delta"
_COMPLETED_EVENT_TYPE = "response.completed"


def _build_reasoning_responses_params(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]],
    tool_choice: Any,
    parallel_tool_calls: Optional[bool],
) -> Dict[str, Any]:
    return build_openai_responses_params(
        provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        include_reasoning=True,
    )


async def get_openai_responses_completion(
    provider: Any, *, model: str, messages: List[LLMMessage], tools: Optional[List[Dict[str, Any]]] = None, tool_choice: Any = None, parallel_tool_calls: Optional[bool] = None,
) -> NormalizedLLMResponse:
    params = _build_reasoning_responses_params(
        provider=provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
    )
    response = await litellm.aresponses(**params)
    provider._record_usage_from_payload_container(response)
    return normalize_openai_responses_payload(provider, response, model=model)


def _maybe_build_reasoning_event(event: Any) -> Optional[ThinkingEvent]:
    if normalize_openai_stream_event_type(event) not in _REASONING_EVENT_TYPES:
        return None
    delta = get_value(event, "delta")
    if isinstance(delta, str) and delta:
        return ThinkingEvent(content=delta)
    return None


def _maybe_build_chunk_event(event: Any) -> Optional[ChunkEvent]:
    if normalize_openai_stream_event_type(event) != _OUTPUT_TEXT_EVENT_TYPE:
        return None
    delta = get_value(event, "delta")
    if isinstance(delta, str) and delta:
        return ChunkEvent(content=delta)
    return None


def _maybe_extract_final_response_payload(
    provider: Any,
    event: Any,
    *,
    model: str,
) -> Optional[NormalizedLLMResponse]:
    if normalize_openai_stream_event_type(event) != _COMPLETED_EVENT_TYPE:
        return None
    response = get_value(event, "response")
    if response is None:
        return None
    provider._record_usage_from_payload_container(response)
    final_payload = normalize_openai_responses_payload(
        provider,
        response,
        model=model,
    )
    provider._set_last_stream_response_payload(final_payload)
    return final_payload


async def stream_openai_responses_events(
    provider: Any, *, model: str, messages: List[LLMMessage], tools: Optional[List[Dict[str, Any]]] = None, tool_choice: Any = None, parallel_tool_calls: Optional[bool] = None,
) -> AsyncGenerator[StreamingEvent, None]:
    params = _build_reasoning_responses_params(
        provider=provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
    )
    params["stream"] = True

    stream = await litellm.aresponses(**params)
    final_response_payload: Optional[NormalizedLLMResponse] = None

    async for event in stream:
        reasoning_event = _maybe_build_reasoning_event(event)
        if reasoning_event is not None:
            yield reasoning_event
            continue

        chunk_event = _maybe_build_chunk_event(event)
        if chunk_event is not None:
            yield chunk_event
            continue

        final_payload = _maybe_extract_final_response_payload(
            provider,
            event,
            model=model,
        )
        if final_payload is not None:
            final_response_payload = final_payload

    if final_response_payload is None:
        raise LLMAPIError(
            f"{_INVALID_OPENAI_RESPONSE}: stream completed without a final response payload",
            model=model,
        )


__all__ = [
    "build_openai_responses_input",
    "build_openai_responses_params",
    "get_openai_responses_completion",
    "normalize_openai_responses_payload",
    "stream_openai_responses_events",
]
