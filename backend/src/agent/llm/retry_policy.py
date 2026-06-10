"""Provider-agnostic retry policy for transient LLM sampling failures."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ChunkEvent,
    ErrorEvent,
    ThinkingEvent,
    WebSearchProgressEvent,
)

MAX_PROVIDER_SAMPLING_ATTEMPTS = 2
PROVIDER_RETRY_BACKOFF_SECONDS = 0.75
RETRYABLE_TRANSIENT_STATUS_CODES = {502, 503, 504}
RETRYABLE_ERROR_KINDS = {"server_error", "transient_network", "rate_limit"}
HTTP_STATUS_PATTERN = re.compile(r"\bHTTP\s+(\d{3})\b", re.IGNORECASE)
TRANSIENT_TEXT_MARKERS = (
    "connection timeout",
    "timed out",
    "connection reset",
    "disconnect/reset before headers",
    "reset before headers",
    "upstream connect error",
)


@dataclass(frozen=True)
class RetryDecision:
    """Decision result for one failed provider sampling attempt."""

    should_retry: bool
    delay_seconds: float = 0.0
    reason: str = ""


def is_downstream_visible_event(event: AgentStreamingEvent) -> bool:
    """Return whether an event makes the provider attempt visible downstream."""
    return isinstance(event, (ChunkEvent, ThinkingEvent, WebSearchProgressEvent))


def should_retry_provider_error(
    event: ErrorEvent,
    *,
    attempt: int,
    max_attempts: int = MAX_PROVIDER_SAMPLING_ATTEMPTS,
    output_emitted: bool,
) -> RetryDecision:
    """Classify whether a terminal provider error can be retried safely."""
    if attempt >= max_attempts:
        return RetryDecision(False, reason="attempt-budget-exhausted")
    if output_emitted:
        return RetryDecision(False, reason="output-already-emitted")

    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    if bool(metadata.get("partial_response_emitted")):
        return RetryDecision(False, reason="partial-response-emitted")
    if metadata.get("retryable") is False:
        return RetryDecision(False, reason="metadata-not-retryable")

    status_code = _coerce_status_code(metadata.get("status_code"))
    if status_code is None:
        status_code = _extract_status_code_from_content(event.content)

    error_kind = str(metadata.get("error_kind") or "").strip().lower()
    retryable = bool(metadata.get("retryable"))
    transient = bool(metadata.get("transient"))
    content = str(event.content or "").lower()

    if status_code in RETRYABLE_TRANSIENT_STATUS_CODES:
        return RetryDecision(
            True,
            delay_seconds=_metadata_retry_delay(metadata),
            reason=f"http-{status_code}",
        )
    if error_kind == "transient_network" and retryable:
        return RetryDecision(
            True,
            delay_seconds=_metadata_retry_delay(metadata),
            reason=error_kind,
        )
    if retryable and transient and error_kind in RETRYABLE_ERROR_KINDS:
        return RetryDecision(
            True,
            delay_seconds=_metadata_retry_delay(metadata),
            reason=error_kind or "metadata-retryable",
        )
    if any(marker in content for marker in TRANSIENT_TEXT_MARKERS):
        return RetryDecision(
            True,
            delay_seconds=PROVIDER_RETRY_BACKOFF_SECONDS,
            reason="transient-text-marker",
        )
    return RetryDecision(False, reason="not-transient")


def _coerce_status_code(value: Any) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _metadata_retry_delay(metadata: dict[str, Any]) -> float:
    for key in ("retry_after_seconds", "retry_after"):
        value = metadata.get(key)
        if isinstance(value, (int, float)) and value >= 0:
            return float(value)
        if isinstance(value, str):
            try:
                parsed = float(value)
            except ValueError:
                continue
            if parsed >= 0:
                return parsed
    return PROVIDER_RETRY_BACKOFF_SECONDS


def _extract_status_code_from_content(content: str) -> Optional[int]:
    match = HTTP_STATUS_PATTERN.search(str(content or ""))
    if match is None:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None
