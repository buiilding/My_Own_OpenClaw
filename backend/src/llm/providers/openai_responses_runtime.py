"""OpenAI Responses API runtime for provider-native reasoning support."""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    SearchSourceEvent,
    StreamingEvent,
    ThinkingEvent,
)
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
from backend.src.tools.web_search.source_normalization import extract_openai_web_search_sources

_INVALID_OPENAI_RESPONSE = "Invalid response from OpenAI"
_REASONING_EVENT_TYPES = {
    "response.reasoning_summary_text.delta",
    "response.reasoning_text.delta",
}
_OUTPUT_TEXT_EVENT_TYPE = "response.output_text.delta"
_OUTPUT_ITEM_EVENT_TYPES = {
    "response.output_item.added",
    "response.output_item.done",
}
_COMPLETED_EVENT_TYPE = "response.completed"


def _build_reasoning_responses_params(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]],
    tool_choice: Any,
    parallel_tool_calls: Optional[bool],
    max_output_tokens: Optional[int],
    include_reasoning: bool,
    native_web_search_enabled: bool,
) -> Dict[str, Any]:
    return build_openai_responses_params(
        provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        max_output_tokens=max_output_tokens,
        include_reasoning=include_reasoning,
        native_web_search_enabled=native_web_search_enabled,
    )


async def get_openai_responses_completion(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
    max_output_tokens: Optional[int] = None,
    native_web_search_enabled: bool = False,
    include_reasoning: bool = True,
) -> NormalizedLLMResponse:
    params = _build_reasoning_responses_params(
        provider=provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        max_output_tokens=max_output_tokens,
        include_reasoning=include_reasoning,
        native_web_search_enabled=native_web_search_enabled,
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


def _to_plain_data(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_to_plain_data(item) for item in value]
    if isinstance(value, tuple):
        return [_to_plain_data(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _to_plain_data(item) for key, item in value.items()}

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump()
        except TypeError:
            dumped = model_dump(mode="python")
        return _to_plain_data(dumped)

    dict_method = getattr(value, "dict", None)
    if callable(dict_method):
        return _to_plain_data(dict_method())

    value_dict = getattr(value, "__dict__", None)
    if isinstance(value_dict, dict):
        return {
            str(key): _to_plain_data(item)
            for key, item in value_dict.items()
            if not str(key).startswith("_")
        }

    return value


def _iter_web_search_stream_items(event: Any) -> List[Dict[str, Any]]:
    event_type = normalize_openai_stream_event_type(event)
    items: List[Dict[str, Any]] = []

    if event_type in _OUTPUT_ITEM_EVENT_TYPES:
        output_item = get_value(event, "item")
        if output_item is None:
            output_item = get_value(event, "output_item")
        plain_item = _to_plain_data(output_item)
        if isinstance(plain_item, dict):
            items.append(plain_item)

    if event_type.startswith("response.web_search_call."):
        direct_item = {
            "type": "web_search_call",
            "query": get_value(event, "query"),
            "action": get_value(event, "action"),
            "sources": get_value(event, "sources"),
        }
        plain_item = _to_plain_data(direct_item)
        if isinstance(plain_item, dict):
            items.append(plain_item)

    return items


def _iter_search_source_events(
    event: Any,
    *,
    seen_urls: set[str],
) -> List[SearchSourceEvent]:
    emitted: List[SearchSourceEvent] = []
    for output_item in _iter_web_search_stream_items(event):
        for source in extract_openai_web_search_sources({"output": [output_item]}):
            url = source.get("url")
            provider = source.get("provider")
            if not isinstance(url, str) or not url.strip():
                continue
            if not isinstance(provider, str) or not provider.strip():
                continue
            normalized_url = url.strip()
            if normalized_url in seen_urls:
                continue
            seen_urls.add(normalized_url)
            emitted.append(
                SearchSourceEvent(
                    url=normalized_url,
                    provider=provider.strip(),
                    title=source.get("title")
                    if isinstance(source.get("title"), str)
                    else None,
                    query=source.get("query")
                    if isinstance(source.get("query"), str)
                    else None,
                    rank=source.get("rank")
                    if isinstance(source.get("rank"), int)
                    else None,
                )
            )
    return emitted


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
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
    max_output_tokens: Optional[int] = None,
    native_web_search_enabled: bool = False,
    include_reasoning: bool = True,
) -> AsyncGenerator[StreamingEvent, None]:
    params = _build_reasoning_responses_params(
        provider=provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        max_output_tokens=max_output_tokens,
        include_reasoning=include_reasoning,
        native_web_search_enabled=native_web_search_enabled,
    )
    params["stream"] = True

    stream = await litellm.aresponses(**params)
    final_response_payload: Optional[NormalizedLLMResponse] = None
    seen_search_source_urls: set[str] = set()

    async for event in stream:
        search_source_events = _iter_search_source_events(
            event,
            seen_urls=seen_search_source_urls,
        )
        for search_source_event in search_source_events:
            yield search_source_event

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
