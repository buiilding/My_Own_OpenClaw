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


def test_enable_stream_with_usage_overrides_existing_stream_options():
    params: Dict[str, Any] = {
        "model": "test-model",
        "stream": False,
        "stream_options": {"include_usage": False, "other": "value"},
    }

    enable_stream_with_usage(params)

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
async def test_stream_text_content_events_ignores_none_delta_without_emitting(monkeypatch):
    chunks = [
        {"usage": {"prompt_tokens": 1}, "delta": None},
        {"usage": {"prompt_tokens": 2}, "delta": {"content": "ok"}},
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

    assert [event.content for event in emitted if isinstance(event, ChunkEvent)] == ["ok"]
    assert seen_usage == [{"prompt_tokens": 1}, {"prompt_tokens": 2}]


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


@pytest.mark.asyncio
async def test_stream_thinking_and_text_events_skips_thinking_extractor_when_delta_missing(monkeypatch):
    chunks = [
        {"usage": {"prompt_tokens": 3}, "delta": None},
        {"usage": {"prompt_tokens": 4}, "delta": {"content": "final"}},
    ]
    thinking_calls = {"count": 0}

    def _extract_thinking(delta: Any) -> Optional[str]:
        thinking_calls["count"] += 1
        return _extract_non_empty_dict_string(delta, "thinking")

    emitted, _seen_usage = await _collect_events_for_pipeline(
        monkeypatch=monkeypatch,
        chunks=chunks,
        stream_callable=stream_thinking_and_text_events,
        stream_kwargs={
            "extract_thinking_content": _extract_thinking,
            "extract_delta_content": lambda delta: _extract_non_empty_dict_string(
                delta,
                "content",
            ),
        },
    )

    assert thinking_calls["count"] == 1
    assert [event.content for event in emitted if isinstance(event, ChunkEvent)] == ["final"]


@pytest.mark.asyncio
async def test_stream_pipeline_passes_params_to_litellm_acompletion(monkeypatch):
    captured_params: Dict[str, Any] = {}

    async def fake_acompletion(**params):
        captured_params.update(params)
        return _yield_chunks([{"usage": None, "delta": {"content": "x"}}])

    monkeypatch.setattr(stream_event_pipeline.litellm, "acompletion", fake_acompletion)

    emitted = []
    async for event in stream_text_content_events(
        params={"model": "test-model", "messages": [{"role": "user", "content": "hi"}], "stream": True},
        record_stream_usage_from_chunk=lambda _chunk: None,
        extract_stream_delta=_extract_dict_delta,
        extract_delta_content=lambda delta: _extract_non_empty_dict_string(delta, "content"),
    ):
        emitted.append(event)

    assert [event.content for event in emitted if isinstance(event, ChunkEvent)] == ["x"]
    assert captured_params["model"] == "test-model"
    assert captured_params["messages"] == [{"role": "user", "content": "hi"}]
    assert captured_params["stream"] is True


@pytest.mark.asyncio
async def test_stream_text_content_events_propagates_extractor_errors(monkeypatch):
    async def fake_acompletion(**_params):
        return _yield_chunks([{"usage": None, "delta": {"content": "x"}}])

    monkeypatch.setattr(stream_event_pipeline.litellm, "acompletion", fake_acompletion)

    async def _collect():
        async for _event in stream_text_content_events(
            params={"model": "x", "messages": []},
            record_stream_usage_from_chunk=lambda _chunk: None,
            extract_stream_delta=_extract_dict_delta,
            extract_delta_content=lambda _delta: (_ for _ in ()).throw(RuntimeError("boom")),
        ):
            pass

    with pytest.raises(RuntimeError, match="boom"):
        await _collect()


@pytest.mark.asyncio
async def test_stream_thinking_and_text_events_propagates_extractor_errors(monkeypatch):
    async def fake_acompletion(**_params):
        return _yield_chunks([{"usage": None, "delta": {"thinking": "plan"}}])

    monkeypatch.setattr(stream_event_pipeline.litellm, "acompletion", fake_acompletion)

    async def _collect():
        async for _event in stream_thinking_and_text_events(
            params={"model": "x", "messages": []},
            record_stream_usage_from_chunk=lambda _chunk: None,
            extract_stream_delta=_extract_dict_delta,
            extract_thinking_content=lambda _delta: (_ for _ in ()).throw(RuntimeError("boom")),
            extract_delta_content=lambda _delta: None,
        ):
            pass

    with pytest.raises(RuntimeError, match="boom"):
        await _collect()
