from typing import Any, AsyncGenerator, Callable, Dict, Optional

import litellm

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent, ThinkingEvent


def enable_stream_with_usage(params: Dict[str, Any]) -> Dict[str, Any]:
    """Enable provider stream mode and include usage payloads when available."""
    params["stream"] = True
    params["stream_options"] = {"include_usage": True}
    return params


async def stream_text_content_events(
    *,
    params: Dict[str, Any],
    record_stream_usage_from_chunk: Callable[[Any], Optional[Dict[str, Any]]],
    extract_stream_delta: Callable[[Any], Any],
    extract_delta_content: Callable[[Any], Optional[str]],
) -> AsyncGenerator[StreamingEvent, None]:
    """Yield chunk events for providers that emit text-only deltas."""
    stream = await litellm.acompletion(**params)
    async for chunk in stream:
        record_stream_usage_from_chunk(chunk)
        delta = extract_stream_delta(chunk)
        content = extract_delta_content(delta)
        if content:
            yield ChunkEvent(content=content)


async def stream_thinking_and_text_events(
    *,
    params: Dict[str, Any],
    record_stream_usage_from_chunk: Callable[[Any], Optional[Dict[str, Any]]],
    extract_stream_delta: Callable[[Any], Any],
    extract_thinking_content: Callable[[Any], Optional[str]],
    extract_delta_content: Callable[[Any], Optional[str]],
) -> AsyncGenerator[StreamingEvent, None]:
    """Yield thinking and text chunk events for providers with reasoning deltas."""
    stream = await litellm.acompletion(**params)
    async for chunk in stream:
        record_stream_usage_from_chunk(chunk)
        delta = extract_stream_delta(chunk)
        if not delta:
            continue
        thinking_content = extract_thinking_content(delta)
        if thinking_content:
            yield ThinkingEvent(content=thinking_content)
        content = extract_delta_content(delta)
        if content:
            yield ChunkEvent(content=content)
