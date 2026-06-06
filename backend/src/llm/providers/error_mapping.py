"""Shared provider error/status mapping helpers."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterator, Optional

HTTP_STATUS_CODE_PATTERN = re.compile(
    r"\b(?:status|error)\s+code\s+(\d{3})\b",
    re.IGNORECASE,
)
HTTP_SERVER_ERROR_PATTERN = re.compile(r"server error '?(\d{3})", re.IGNORECASE)
TRANSIENT_NETWORK_MARKERS = (
    "connection timeout",
    "timeout",
    "timed out",
    "connection reset",
    "disconnect/reset before headers",
    "reset before headers",
    "upstream connect error",
    "temporary failure",
)
RETRYABLE_TRANSIENT_STATUS_CODES = {502, 503, 504}


def iter_exception_chain(exc: Exception) -> Iterator[BaseException]:
    """Yield an exception and its linked causes/contexts once each."""
    current: Optional[BaseException] = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def extract_status_code(exc: Exception) -> Optional[int]:
    """Best-effort status-code extraction across wrapped provider exceptions."""
    for candidate in iter_exception_chain(exc):
        direct_code = getattr(candidate, "status_code", None)
        if isinstance(direct_code, int):
            return direct_code

        response = getattr(candidate, "response", None)
        response_code = getattr(response, "status_code", None)
        if isinstance(response_code, int):
            return response_code

        text = str(candidate)
        for pattern in (HTTP_STATUS_CODE_PATTERN, HTTP_SERVER_ERROR_PATTERN):
            match = pattern.search(text)
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue
    return None


def build_api_error_message(provider_label: str, status_code: Optional[int]) -> str:
    """Return concise, user-facing provider API error text."""
    if status_code == 520:
        return (
            f"{provider_label} upstream service is temporarily unavailable (HTTP 520). "
            "Please retry."
        )
    if status_code is not None:
        return f"{provider_label} API error (HTTP {status_code})"
    return f"{provider_label} API error"


def normalize_provider_label(provider_label: str) -> str:
    """Return a stable provider identifier for metadata and logs."""
    normalized = str(provider_label or "unknown").strip()
    if normalized.endswith("Provider"):
        normalized = normalized[: -len("Provider")]
    return normalized.replace("_", "-").lower() or "unknown"


def classify_provider_error_kind(
    status_code: Optional[int],
    exc: Optional[BaseException] = None,
    *,
    rate_limited: bool = False,
) -> str:
    """Classify raw provider failures into provider-agnostic error kinds."""
    if rate_limited or status_code == 429:
        return "rate_limit"
    if status_code in (401, 403):
        return "auth"
    if status_code in (400, 404, 422):
        return "invalid_request"
    if status_code in RETRYABLE_TRANSIENT_STATUS_CODES:
        return "server_error"
    if status_code is not None and 500 <= status_code <= 599:
        return "server_error"
    if exc is not None:
        text = str(exc).lower()
        if any(marker in text for marker in TRANSIENT_NETWORK_MARKERS):
            return "transient_network"
    return "unknown"


def build_provider_error_metadata(
    provider_label: str,
    status_code: Optional[int],
    exc: Optional[BaseException] = None,
    *,
    rate_limited: bool = False,
    retry_after_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """Build normalized provider error metadata for retry/sanitization policy."""
    error_kind = classify_provider_error_kind(
        status_code,
        exc,
        rate_limited=rate_limited,
    )
    retryable = (
        error_kind == "transient_network"
        or status_code in RETRYABLE_TRANSIENT_STATUS_CODES
    )
    transient = retryable or error_kind == "server_error"
    return {
        "provider": normalize_provider_label(provider_label),
        "status_code": status_code,
        "error_kind": error_kind,
        "retryable": retryable,
        "transient": transient,
        "retry_after_seconds": retry_after_seconds,
    }
