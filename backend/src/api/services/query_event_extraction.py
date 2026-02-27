"""Shared query-stream event extraction and completion-text helpers."""

from __future__ import annotations

from typing import Any, Optional

TEXT_CHUNK_EVENT_TYPES = frozenset({"chunk", "content", "streaming-response"})


def extract_event_type(event: Any) -> Optional[str]:
    """Extract event type from dict or typed event objects."""
    if isinstance(event, dict):
        value = event.get("type")
        return str(value) if isinstance(value, str) else None

    event_type = getattr(event, "type", None)
    if isinstance(event_type, str):
        return event_type
    value = getattr(event_type, "value", None)
    return str(value) if isinstance(value, str) else None


def extract_dict_payload(event: Any) -> Optional[dict[str, Any]]:
    """Extract dict payload from an untyped websocket event envelope."""
    if not isinstance(event, dict):
        return None
    payload = event.get("payload")
    return payload if isinstance(payload, dict) else None


def extract_dict_string_field(
    event: Any,
    *,
    top_level_key: str,
    payload_key: Optional[str] = None,
) -> Optional[str]:
    """Resolve a string field from top-level event object or nested payload."""
    if not isinstance(event, dict):
        return None

    top_level_value = event.get(top_level_key)
    if isinstance(top_level_value, str) and top_level_value.strip():
        return top_level_value

    payload = extract_dict_payload(event)
    resolved_payload_key = payload_key or top_level_key
    if not payload:
        return None

    payload_value = payload.get(resolved_payload_key)
    return payload_value if isinstance(payload_value, str) else None


def extract_chunk_text(event: Any) -> Optional[str]:
    """Extract raw chunk text from top-level or payload-backed event shapes."""
    if isinstance(event, dict):
        return extract_dict_string_field(
            event,
            top_level_key="content",
            payload_key="text",
        )

    content = getattr(event, "content", None)
    return content if isinstance(content, str) else None


def extract_non_empty_chunk_text(
    event: Any,
    *,
    event_type: Optional[str] = None,
) -> str:
    """Extract non-empty chunk text only for chunk/content/streaming-response events."""
    resolved_event_type = event_type or extract_event_type(event)
    if resolved_event_type not in TEXT_CHUNK_EVENT_TYPES:
        return ""

    content = extract_chunk_text(event)
    if not isinstance(content, str):
        return ""
    return content if content.strip() else ""


def extract_assistant_full_text(
    event: Any,
    *,
    event_type: Optional[str] = None,
) -> str:
    """Extract assistant full-text content from typed or dict events."""
    resolved_event_type = event_type or extract_event_type(event)
    if resolved_event_type != "assistant_message_full":
        return ""
    if isinstance(event, dict):
        content = extract_dict_string_field(event, top_level_key="content")
        return content.strip() if isinstance(content, str) else ""
    content = getattr(event, "content", None)
    return content.strip() if isinstance(content, str) else ""


def extract_streaming_complete_text(
    event: Any,
    *,
    event_type: Optional[str] = None,
) -> str:
    """Extract final response text from streaming-complete events."""
    if not event:
        return ""
    resolved_event_type = event_type or extract_event_type(event)
    if resolved_event_type != "streaming-complete":
        return ""
    if isinstance(event, dict):
        final_response = extract_dict_string_field(
            event,
            top_level_key="final_response",
            payload_key="final_response",
        )
        if isinstance(final_response, str):
            return final_response.strip()
        return ""
    final_response = getattr(event, "final_response", None)
    return final_response.strip() if isinstance(final_response, str) else ""


def resolve_completion_text(
    *,
    event: Any,
    event_type: Optional[str],
    text_chunks: list[str],
    assistant_full_text: str,
    saw_text_chunk: bool,
    empty_fallback: str,
) -> str:
    """Resolve completion text with precedence used by query service."""
    event_completion_text = extract_streaming_complete_text(
        event,
        event_type=event_type,
    )
    if event_completion_text:
        return event_completion_text
    if saw_text_chunk:
        combined = "".join(text_chunks).strip()
        if combined:
            return combined
    if assistant_full_text:
        return assistant_full_text
    return empty_fallback
