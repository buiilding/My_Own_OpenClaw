"""Tests for query event extraction helper functions."""

from backend.src.api.services.query_event_extraction import (
    extract_assistant_full_text,
    extract_dict_payload,
    extract_dict_string_field,
    extract_event_type,
    extract_non_empty_chunk_text,
    extract_chunk_text,
    extract_streaming_complete_text,
    resolve_completion_text,
)


def test_extract_event_type_supports_dict_and_typed_value_enum():
    class _TypeObj:
        value = "streaming-complete"

    class _Event:
        type = _TypeObj()

    assert extract_event_type({"type": "chunk"}) == "chunk"
    assert extract_event_type(_Event()) == "streaming-complete"
    assert extract_event_type({"type": 123}) is None


def test_extract_event_type_supports_typed_string_and_missing_value():
    class _DirectTypeEvent:
        type = "assistant_message_full"

    class _NoValueType:
        pass

    class _MissingValueEvent:
        type = _NoValueType()

    assert extract_event_type(_DirectTypeEvent()) == "assistant_message_full"
    assert extract_event_type(_MissingValueEvent()) is None


def test_extract_non_empty_chunk_text_accepts_payload_text_fallback():
    assert (
        extract_non_empty_chunk_text(
            {"type": "content", "payload": {"text": "payload chunk"}},
            event_type="content",
        )
        == "payload chunk"
    )
    assert (
        extract_non_empty_chunk_text(
            {"type": "chunk", "content": "   "},
            event_type="chunk",
        )
        == ""
    )
    assert (
        extract_non_empty_chunk_text(
            {
                "type": "streaming-response",
                "content": "   ",
                "payload": {"text": "payload chunk"},
            },
        )
        == "payload chunk"
    )


def test_extract_dict_payload_and_string_field_helpers():
    event = {"payload": {"text": "payload text", "content": "payload content"}}
    assert extract_dict_payload(event) == event["payload"]
    assert extract_dict_payload({"payload": "not-a-dict"}) is None
    assert extract_dict_payload("not-a-dict") is None

    assert (
        extract_dict_string_field(
            {"content": "top-level", "payload": {"content": "payload"}},
            top_level_key="content",
        )
        == "top-level"
    )
    assert (
        extract_dict_string_field(
            {"payload": {"text": "payload-only"}},
            top_level_key="content",
            payload_key="text",
        )
        == "payload-only"
    )
    assert (
        extract_dict_string_field(
            {"payload": {"text": 123}},
            top_level_key="content",
            payload_key="text",
        )
        is None
    )
    assert (
        extract_dict_string_field(
            {"content": "   ", "payload": {"content": "payload-non-empty"}},
            top_level_key="content",
        )
        == "payload-non-empty"
    )


def test_extract_chunk_text_supports_typed_event_content():
    class _Event:
        content = "typed-chunk"

    assert extract_chunk_text(_Event()) == "typed-chunk"
    assert extract_non_empty_chunk_text(_Event(), event_type="assistant_message_full") == ""


def test_extract_assistant_full_text_prefers_top_level_then_payload():
    assert (
        extract_assistant_full_text(
            {"type": "assistant_message_full", "content": "  top level  "},
            event_type="assistant_message_full",
        )
        == "top level"
    )
    assert (
        extract_assistant_full_text(
            {"type": "assistant_message_full", "payload": {"content": "  payload full  "}},
            event_type="assistant_message_full",
        )
        == "payload full"
    )
    assert (
        extract_assistant_full_text(
            {
                "type": "assistant_message_full",
                "content": "   ",
                "payload": {"content": " payload fallback "},
            },
            event_type="assistant_message_full",
        )
        == "payload fallback"
    )


def test_extract_streaming_complete_text_supports_payload_and_top_level():
    assert (
        extract_streaming_complete_text(
            {"type": "streaming-complete", "payload": {"final_response": "  payload done  "}},
            event_type="streaming-complete",
        )
        == "payload done"
    )
    assert (
        extract_streaming_complete_text(
            {"type": "streaming-complete", "final_response": "  top level done  "},
            event_type="streaming-complete",
        )
        == "top level done"
    )
    assert (
        extract_streaming_complete_text(
            {
                "type": "streaming-complete",
                "final_response": "   ",
                "payload": {"final_response": "payload fallback"},
            },
            event_type="streaming-complete",
        )
        == "payload fallback"
    )


def test_extract_streaming_complete_text_supports_typed_events():
    class _StreamingCompleteEvent:
        type = "streaming-complete"
        final_response = "  typed done  "

    class _NonStreamingEvent:
        type = "chunk"
        final_response = "ignored"

    assert extract_streaming_complete_text(_StreamingCompleteEvent()) == "typed done"
    assert extract_streaming_complete_text(_NonStreamingEvent()) == ""


def test_resolve_completion_text_precedence_chain():
    from_event = resolve_completion_text(
        event={"type": "streaming-complete", "final_response": "done"},
        event_type="streaming-complete",
        text_chunks=["chunk-a", "chunk-b"],
        assistant_full_text="assistant full",
        saw_text_chunk=True,
        empty_fallback="fallback",
    )
    assert from_event == "done"

    from_chunks = resolve_completion_text(
        event=None,
        event_type=None,
        text_chunks=["chunk-a", "chunk-b"],
        assistant_full_text="assistant full",
        saw_text_chunk=True,
        empty_fallback="fallback",
    )
    assert from_chunks == "chunk-achunk-b"

    from_assistant = resolve_completion_text(
        event=None,
        event_type=None,
        text_chunks=[],
        assistant_full_text="assistant full",
        saw_text_chunk=False,
        empty_fallback="fallback",
    )
    assert from_assistant == "assistant full"

    fallback = resolve_completion_text(
        event=None,
        event_type=None,
        text_chunks=[],
        assistant_full_text="",
        saw_text_chunk=False,
        empty_fallback="fallback",
    )
    assert fallback == "fallback"


def test_resolve_completion_text_uses_assistant_when_seen_chunks_are_empty() -> None:
    resolved = resolve_completion_text(
        event=None,
        event_type=None,
        text_chunks=["   ", "\n"],
        assistant_full_text="assistant full",
        saw_text_chunk=True,
        empty_fallback="fallback",
    )

    assert resolved == "assistant full"
