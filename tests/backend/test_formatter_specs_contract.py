"""Covers formatter specs contract behavior in the backend test suite."""

from backend.src.api.contracts.formatter_specs import get_formatter_specs
from backend.src.core.types.enums import StreamingEventType


def test_get_formatter_specs_returns_cached_tuple():
    get_formatter_specs.cache_clear()
    first = get_formatter_specs()
    second = get_formatter_specs()

    assert isinstance(first, tuple)
    assert first is second
    assert len(first) > 0
    assert all(len(spec) == 3 for spec in first)
    assert all(
        event_cls.__module__ == "backend.src.core.events.streaming_events"
        for event_cls, _, _ in first
    )


def test_get_formatter_specs_contains_expected_stream_types():
    specs = get_formatter_specs()
    stream_types = {stream_type for _, stream_type, _ in specs}

    assert StreamingEventType.STREAMING_RESPONSE.value in stream_types
    assert StreamingEventType.ERROR.value in stream_types
    assert StreamingEventType.STREAMING_COMPLETE.value in stream_types
    assert StreamingEventType.TOOL_CALL.value in stream_types
    assert StreamingEventType.TOOL_OUTPUT.value in stream_types
    assert StreamingEventType.TRACE_EVENT.value in stream_types
