"""Tests for LLM stream processor helper utilities."""

import pytest

from backend.src.agent.llm.stream_processor_helpers import (
    apply_stream_event,
    build_llm_api_error_message,
    compact_for_fingerprint,
    derive_prompt_continuity,
    normalize_stream_response_payload,
    resolve_prompt_cache_key_for_provider,
)
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    ThinkingEvent,
)
from backend.src.core.infrastructure.exceptions import LLMAPIError


def test_apply_stream_event_updates_text_and_emission_contract():
    text, emitted = apply_stream_event(ChunkEvent(content="hello"), "")
    assert text == "hello"
    assert isinstance(emitted, ChunkEvent)

    text, emitted = apply_stream_event(ThinkingEvent(content="..."), text)
    assert text == "hello"
    assert isinstance(emitted, ThinkingEvent)

    text, emitted = apply_stream_event(ErrorEvent(content="err"), text)
    assert text == "hello"
    assert isinstance(emitted, ErrorEvent)

    text, emitted = apply_stream_event(FullResponseEvent(content="final"), text)
    assert text == "final"
    assert emitted is None


def test_apply_stream_event_rejects_unknown_event_types():
    with pytest.raises(TypeError, match="Unsupported stream event type"):
        apply_stream_event({"event": "bad"}, "text")


def test_normalize_stream_response_payload_uses_content_fallback():
    payload = normalize_stream_response_payload({"tool_calls": []}, "fallback")
    assert payload["content"] == "fallback"
    assert payload["tool_calls"] == []

    fallback_only = normalize_stream_response_payload(None, "text")
    assert fallback_only == {"content": "text"}


def test_build_llm_api_error_message_maps_http_520():
    error_520 = LLMAPIError("upstream 520", model="k2", status_code=520)
    assert build_llm_api_error_message(error_520) == (
        "Kimi Coding is temporarily unavailable (HTTP 520). Please retry shortly."
    )

    error_other = LLMAPIError("upstream 429", model="k2", status_code=429)
    assert build_llm_api_error_message(error_other) == (
        "LLM API error (HTTP 429). Please retry."
    )


def test_resolve_prompt_cache_key_for_provider_prefers_conversation_ref():
    key = resolve_prompt_cache_key_for_provider(
        provider_name="kimi-coding",
        active_conversation_ref="conv-123",
        session_id="sess-123",
    )
    assert key == "conv-123"

    fallback_key = resolve_prompt_cache_key_for_provider(
        provider_name="kimi_code",
        active_conversation_ref="",
        session_id="sess-123",
    )
    assert fallback_key == "sess-123"

    assert (
        resolve_prompt_cache_key_for_provider(
            provider_name="openai",
            active_conversation_ref="conv",
            session_id="sess",
        )
        is None
    )


def test_compact_for_fingerprint_preserves_shape_and_limits_long_strings():
    long_text = "x" * 4096
    compacted = compact_for_fingerprint(long_text)
    assert "<len=4096>" in compacted
    assert len(compacted) < len(long_text)

    nested = compact_for_fingerprint(
        {"b": long_text, "a": ["short", {"z": long_text}]}
    )
    assert list(nested.keys()) == ["a", "b"]
    assert "<len=4096>" in nested["b"]
    assert "<len=4096>" in nested["a"][1]["z"]


def test_derive_prompt_continuity_statuses():
    cold = derive_prompt_continuity(None, ["a"])
    assert cold.status == "cold_start"
    assert cold.first_changed_message is None

    append_only = derive_prompt_continuity(["a"], ["a", "b"])
    assert append_only.status == "append_only"
    assert append_only.first_changed_message == 2

    shortened = derive_prompt_continuity(["a", "b"], ["a"])
    assert shortened.status == "history_shortened"
    assert shortened.first_changed_message == 2

    mutated = derive_prompt_continuity(["a", "b"], ["x", "b"])
    assert mutated.status == "prefix_mutated"
    assert mutated.first_changed_message == 1
