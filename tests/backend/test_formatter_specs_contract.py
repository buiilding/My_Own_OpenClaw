from backend.src.api.contracts.formatter_specs import get_formatter_specs
from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.core.types import StreamingEventType


def test_get_formatter_specs_returns_cached_tuple():
    get_formatter_specs.cache_clear()
    first = get_formatter_specs()
    second = get_formatter_specs()

    assert isinstance(first, tuple)
    assert first is second
    assert len(first) > 0
    assert all(len(spec) == 4 for spec in first)


def test_get_formatter_specs_contains_expected_stream_and_outgoing_types():
    specs = get_formatter_specs()
    stream_types = {stream_type for _, stream_type, _, _ in specs}
    outgoing_types = {outgoing_type for _, _, _, outgoing_type in specs}

    assert StreamingEventType.CHUNK.value in stream_types
    assert StreamingEventType.ERROR.value in stream_types
    assert StreamingEventType.STREAMING_COMPLETE.value in stream_types
    assert StreamingEventType.TOOL_CALL.value in stream_types
    assert StreamingEventType.TOOL_OUTPUT.value in stream_types

    assert OutgoingMessageType.STREAMING_RESPONSE in outgoing_types
    assert OutgoingMessageType.ERROR in outgoing_types
    assert OutgoingMessageType.STREAMING_COMPLETE in outgoing_types
    assert OutgoingMessageType.TOOL_CALL in outgoing_types
    assert OutgoingMessageType.TOOL_OUTPUT in outgoing_types
