"""Shared helpers for LLM stream processing internals."""

from dataclasses import dataclass
import hashlib
import json
from typing import Any, List, Optional, Tuple

from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    ThinkingEvent,
)
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse


def build_llm_api_error_message(error: LLMAPIError) -> str:
    """Return a concise user-facing error for known API failure classes."""
    if error.status_code == 520:
        return "Kimi Coding is temporarily unavailable (HTTP 520). Please retry shortly."
    if error.status_code is not None:
        return f"LLM API error (HTTP {error.status_code}). Please retry."
    return f"LLM API error: {error.message}"


def apply_stream_event(
    event: AgentStreamingEvent,
    full_text: str,
) -> Tuple[str, Optional[AgentStreamingEvent]]:
    """
    Apply one stream event to aggregate state.

    Returns:
      - updated full text
      - event to emit (None when event is consumed for aggregation only)
    """
    if isinstance(event, ChunkEvent):
        return full_text + event.content, event
    if isinstance(event, (ThinkingEvent, ErrorEvent)):
        return full_text, event
    if isinstance(event, FullResponseEvent):
        # LLM client may emit full response directly (e.g., mock client).
        return event.content, None
    raise TypeError(
        "Unsupported stream event type from LLM client: "
        f"{type(event).__name__}"
    )


def normalize_stream_response_payload(
    stream_payload: Any,
    full_text: str,
) -> NormalizedLLMResponse:
    """Normalize latest stream payload shape with deterministic content fallback."""
    if isinstance(stream_payload, dict):
        normalized_stream_payload = dict(stream_payload)
        if not isinstance(normalized_stream_payload.get("content"), str):
            normalized_stream_payload["content"] = full_text
        return normalized_stream_payload
    return {"content": full_text}


def resolve_prompt_cache_key_for_provider(
    *,
    provider_name: Any,
    active_conversation_ref: Any,
    session_id: Any,
) -> Optional[str]:
    """
    Resolve stable cache key for providers that support prompt cache steering.

    Uses active conversation identity when available and falls back to session id.
    """
    normalized_provider_name = str(provider_name or "").strip().lower().replace("_", "-")
    if normalized_provider_name in ("kimi-code", "kimi-coding"):
        normalized_provider_name = "kimi-coding"
    if normalized_provider_name != "kimi-coding":
        return None

    if isinstance(active_conversation_ref, str):
        normalized_ref = active_conversation_ref.strip()
        if normalized_ref:
            return normalized_ref

    if isinstance(session_id, str):
        normalized_session_id = session_id.strip()
        if normalized_session_id:
            return normalized_session_id
    return None


def common_prefix_length(first: List[str], second: List[str]) -> int:
    """Return number of leading messages that are identical."""
    matched = 0
    for left, right in zip(first, second):
        if left != right:
            break
        matched += 1
    return matched


def fingerprint_prompt(prompt: List[LLMMessage]) -> List[str]:
    """Generate stable message fingerprints for continuity comparison."""
    return [fingerprint_message(message) for message in prompt]


def fingerprint_message(message: LLMMessage) -> str:
    """Generate a short hash for one prompt message."""
    role = str(message.get("role", ""))
    compact_content = compact_for_fingerprint(message.get("content", ""))
    encoded = json.dumps(
        {"role": role, "content": compact_content},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def compact_for_fingerprint(value: Any) -> Any:
    """Compact potentially huge content before hashing."""
    if isinstance(value, str):
        max_chars = 2048
        if len(value) <= max_chars:
            return value
        head = value[:1024]
        tail = value[-1024:]
        return f"{head}<len={len(value)}>{tail}"

    if isinstance(value, list):
        return [compact_for_fingerprint(item) for item in value]

    if isinstance(value, dict):
        return {
            str(key): compact_for_fingerprint(value[key])
            for key in sorted(value.keys(), key=str)
        }

    return value


@dataclass(frozen=True)
class PromptContinuity:
    """Derived continuity metadata between previous and current prompt fingerprints."""

    status: str
    previous_count: int
    current_count: int
    common_prefix_messages: int
    first_changed_message: Optional[int]


def derive_prompt_continuity(
    previous_fingerprints: Optional[List[str]],
    current_fingerprints: List[str],
) -> PromptContinuity:
    """Classify prompt continuity status and first-changed index for diagnostics."""
    if previous_fingerprints is None:
        return PromptContinuity(
            status="cold_start",
            previous_count=0,
            current_count=len(current_fingerprints),
            common_prefix_messages=0,
            first_changed_message=None,
        )

    previous_count = len(previous_fingerprints)
    common_prefix_messages = common_prefix_length(
        previous_fingerprints,
        current_fingerprints,
    )
    if (
        common_prefix_messages == len(previous_fingerprints)
        and len(current_fingerprints) >= len(previous_fingerprints)
    ):
        status = "append_only"
    elif (
        common_prefix_messages == len(current_fingerprints)
        and len(current_fingerprints) < len(previous_fingerprints)
    ):
        status = "history_shortened"
    else:
        status = "prefix_mutated"

    first_changed_message = (
        common_prefix_messages + 1
        if common_prefix_messages < max(previous_count, len(current_fingerprints))
        else None
    )
    return PromptContinuity(
        status=status,
        previous_count=previous_count,
        current_count=len(current_fingerprints),
        common_prefix_messages=common_prefix_messages,
        first_changed_message=first_changed_message,
    )
