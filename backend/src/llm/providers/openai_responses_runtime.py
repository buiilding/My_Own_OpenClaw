"""OpenAI Responses API runtime for provider-native reasoning support."""

from __future__ import annotations

from urllib.parse import urlsplit
from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    StreamingEvent,
    ThinkingEvent,
    WebSearchProgressEvent,
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

_INVALID_OPENAI_RESPONSE = "Invalid response from OpenAI"
_REASONING_EVENT_TYPES = {
    "response.reasoning_summary_text.delta",
    "response.reasoning_text.delta",
}
_OUTPUT_TEXT_EVENT_TYPE = "response.output_text.delta"
_OUTPUT_ITEM_DONE_EVENT_TYPE = "response.output_item.done"
_COMPLETED_EVENT_TYPE = "response.completed"
_INCOMPLETE_EVENT_TYPE = "response.incomplete"


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
    previous_response_id: Optional[str],
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
        previous_response_id=previous_response_id,
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
    previous_response_id: Optional[str] = None,
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
        previous_response_id=previous_response_id,
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


def _normalize_source_label(url: str) -> str:
    parsed = urlsplit(url)
    hostname = (parsed.netloc or parsed.path or "").strip().lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname or url.strip()


def _build_web_search_progress_events(
    event: Any,
    *,
    request_id: Optional[str],
    emitted_keys: set[str],
) -> list[WebSearchProgressEvent]:
    if normalize_openai_stream_event_type(event) != _OUTPUT_ITEM_DONE_EVENT_TYPE:
        return []

    item = get_value(event, "item")
    if item is None or str(get_value(item, "type") or "").strip() != "web_search_call":
        return []

    action = get_value(item, "action")
    if action is None:
        return []

    action_type = str(get_value(action, "type") or "").strip() or None
    item_query = get_value(item, "query")
    item_query = item_query.strip() if isinstance(item_query, str) and item_query.strip() else None
    progress_events: list[WebSearchProgressEvent] = []

    def append_progress(
        *,
        text: str,
        key: str,
        query: Optional[str] = None,
        url: Optional[str] = None,
        pattern: Optional[str] = None,
    ) -> None:
        normalized_text = text.strip()
        if not normalized_text or key in emitted_keys:
            return
        emitted_keys.add(key)
        progress_events.append(
            WebSearchProgressEvent(
                text=normalized_text,
                request_id=request_id,
                action_type=action_type,
                query=query,
                url=url,
                pattern=pattern,
            )
        )

    if action_type == "search":
        raw_sources = get_value(action, "sources")
        if isinstance(raw_sources, list) and raw_sources:
            for raw_source in raw_sources:
                url = get_value(raw_source, "url") or get_value(raw_source, "uri")
                if not isinstance(url, str) or not url.strip():
                    continue
                source_query = get_value(raw_source, "query")
                normalized_query = (
                    source_query.strip()
                    if isinstance(source_query, str) and source_query.strip()
                    else item_query
                )
                normalized_url = url.strip()
                append_progress(
                    text=f"Searched {_normalize_source_label(normalized_url)}",
                    key=f"search-source:{normalized_url}",
                    query=normalized_query,
                    url=normalized_url,
                )
            return progress_events

        raw_queries = get_value(action, "queries")
        if isinstance(raw_queries, list):
            for raw_query in raw_queries:
                if not isinstance(raw_query, str) or not raw_query.strip():
                    continue
                normalized_query = raw_query.strip()
                append_progress(
                    text=f"Searched web for {normalized_query}",
                    key=f"search-query:{normalized_query}",
                    query=normalized_query,
                )
        elif item_query:
            append_progress(
                text=f"Searched web for {item_query}",
                key=f"search-query:{item_query}",
                query=item_query,
            )
        return progress_events

    if action_type == "open_page":
        raw_url = get_value(action, "url")
        if isinstance(raw_url, str) and raw_url.strip():
            normalized_url = raw_url.strip()
            append_progress(
                text=f"Opened {_normalize_source_label(normalized_url)}",
                key=f"open-page:{normalized_url}",
                url=normalized_url,
            )
        return progress_events

    if action_type == "find_in_page":
        raw_url = get_value(action, "url")
        raw_pattern = get_value(action, "pattern")
        if isinstance(raw_url, str) and raw_url.strip():
            normalized_url = raw_url.strip()
            normalized_pattern = (
                raw_pattern.strip()
                if isinstance(raw_pattern, str) and raw_pattern.strip()
                else None
            )
            text = (
                f"Searched {_normalize_source_label(normalized_url)} for {normalized_pattern}"
                if normalized_pattern
                else f"Searched {_normalize_source_label(normalized_url)}"
            )
            append_progress(
                text=text,
                key=f"find-in-page:{normalized_url}:{normalized_pattern or ''}",
                url=normalized_url,
                pattern=normalized_pattern,
            )
        return progress_events

    return []


def _maybe_extract_final_response_payload(
    provider: Any,
    event: Any,
    *,
    model: str,
) -> Optional[NormalizedLLMResponse]:
    if normalize_openai_stream_event_type(event) not in {
        _COMPLETED_EVENT_TYPE,
        _INCOMPLETE_EVENT_TYPE,
    }:
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
    request_id: Optional[str] = None,
    previous_response_id: Optional[str] = None,
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
        previous_response_id=previous_response_id,
    )
    params["stream"] = True

    stream = await litellm.aresponses(**params)
    final_response_payload: Optional[NormalizedLLMResponse] = None
    emitted_web_search_progress_keys: set[str] = set()

    async for event in stream:
        reasoning_event = _maybe_build_reasoning_event(event)
        if reasoning_event is not None:
            yield reasoning_event
            continue

        chunk_event = _maybe_build_chunk_event(event)
        if chunk_event is not None:
            yield chunk_event
            continue

        for web_search_progress_event in _build_web_search_progress_events(
            event,
            request_id=request_id,
            emitted_keys=emitted_web_search_progress_keys,
        ):
            yield web_search_progress_event

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
