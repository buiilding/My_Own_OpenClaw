from typing import Any, Dict, List, Optional

import pytest

from backend.src.core.events.streaming_events import ChunkEvent, ThinkingEvent
from backend.src.llm.providers import stream_event_pipeline
from backend.src.llm.providers.stream_event_pipeline import (
    enable_stream_with_usage,
    stream_text_content_events,
    stream_thinking_and_text_events,
)


async def _yield_chunks(chunks: List[Any]):
    for chunk in chunks:
        yield chunk


async def _collect_events_for_pipeline(
    *,
    monkeypatch: pytest.MonkeyPatch,
    chunks: List[Any],
    stream_callable: Any,
    stream_kwargs: Dict[str, Any],
):
    seen_usage: List[Optional[Dict[str, Any]]] = []

    async def fake_acompletion(**_params):
        return _yield_chunks(chunks)

    monkeypatch.setattr(stream_event_pipeline.litellm, "acompletion", fake_acompletion)

    events = []
    async for event in stream_callable(
        params={"model": "x", "messages": []},
        record_stream_usage_from_chunk=_record_usage_from_chunk_factory(seen_usage),
        extract_stream_delta=_extract_dict_delta,
        **stream_kwargs,
    ):
        events.append(event)
    return events, seen_usage


def _record_usage_from_chunk_factory(
    seen_usage: List[Optional[Dict[str, Any]]],
):
    def _record_usage(chunk: Any) -> Optional[Dict[str, Any]]:
        usage = chunk.get("usage")
        seen_usage.append(usage)
        return usage

    return _record_usage


def _extract_dict_delta(chunk: Any) -> Any:
    return chunk.get("delta")


def _extract_non_empty_dict_string(delta: Any, key: str) -> Optional[str]:
    if not isinstance(delta, dict):
        return None
    value = delta.get(key)
    if isinstance(value, str) and value:
        return value
    return None


def test_enable_stream_with_usage_sets_stream_fields():
    params: Dict[str, Any] = {"model": "test-model"}

    result = enable_stream_with_usage(params)

    assert result is params
    assert params["stream"] is True
    assert params["stream_options"] == {"include_usage": True}


@pytest.mark.asyncio
async def test_stream_text_content_events_emits_only_non_empty_chunks(monkeypatch):
    chunks = [
        {"usage": {"prompt_tokens": 3}, "delta": {"content": "hello"}},
        {"usage": {"prompt_tokens": 4}, "delta": {"content": ""}},
        {"usage": {"prompt_tokens": 5}, "delta": {"content": " world"}},
    ]
    emitted, seen_usage = await _collect_events_for_pipeline(
        monkeypatch=monkeypatch,
        chunks=chunks,
        stream_callable=stream_text_content_events,
        stream_kwargs={
            "extract_delta_content": lambda delta: _extract_non_empty_dict_string(
                delta,
                "content",
            ),
        },
    )

    assert [event.content for event in emitted if isinstance(event, ChunkEvent)] == [
        "hello",
        " world",
    ]
    assert seen_usage == [
        {"prompt_tokens": 3},
        {"prompt_tokens": 4},
        {"prompt_tokens": 5},
    ]


@pytest.mark.asyncio
async def test_stream_thinking_and_text_events_emits_reasoning_and_text(monkeypatch):
    chunks = [
        {"usage": {"prompt_tokens": 7}, "delta": None},
        {"usage": {"prompt_tokens": 8}, "delta": {"thinking": "plan", "content": "step "}},
        {"usage": {"prompt_tokens": 9}, "delta": {"content": "done"}},
    ]
    emitted, seen_usage = await _collect_events_for_pipeline(
        monkeypatch=monkeypatch,
        chunks=chunks,
        stream_callable=stream_thinking_and_text_events,
        stream_kwargs={
            "extract_thinking_content": lambda delta: _extract_non_empty_dict_string(
                delta,
                "thinking",
            ),
            "extract_delta_content": lambda delta: _extract_non_empty_dict_string(
                delta,
                "content",
            ),
        },
    )

    assert [type(event) for event in emitted] == [ThinkingEvent, ChunkEvent, ChunkEvent]
    assert [event.content for event in emitted] == ["plan", "step ", "done"]
    assert seen_usage == [
        {"prompt_tokens": 7},
        {"prompt_tokens": 8},
        {"prompt_tokens": 9},
    ]
