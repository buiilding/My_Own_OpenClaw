"""Shared client-safe error messages for backend-to-UI surfaces."""

from __future__ import annotations

import re
from typing import Any

INTERNAL_SERVER_ERROR_MESSAGE = (
    "Internal server error. Start a new chat and try again."
)
OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE = (
    "OpenAI Responses stream ended without final response payload"
)
PROVIDER_API_ERROR_MESSAGE_RE = re.compile(
    r"^[A-Za-z][A-Za-z0-9 _.-]{0,80} API error(?: \(HTTP [0-9]{3}\))?$"
)
LLM_API_ERROR_MESSAGE_RE = re.compile(
    r"^LLM API error(?: \(HTTP [0-9]{3}\))?\. Please retry\.$"
)
TEMPORARY_PROVIDER_UNAVAILABLE_RE = re.compile(
    r"^[A-Za-z][A-Za-z0-9 _.-]{0,80} is temporarily unavailable \(HTTP [0-9]{3}\)\. "
    r"Please retry(?: shortly)?\.$"
)


def format_internal_server_error_message(context: str | None = None) -> str:
    """Return the canonical client-safe internal-error message."""
    if context:
        return f"{context}: {INTERNAL_SERVER_ERROR_MESSAGE}"
    return INTERNAL_SERVER_ERROR_MESSAGE


def sanitize_stream_error_message(message: Any) -> str:
    """Collapse backend stream failures to the canonical UI-safe message."""
    if isinstance(message, str):
        normalized = message.strip()
        if normalized.startswith("Rate limit exceeded"):
            return normalized
        if normalized == OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE:
            return normalized
        if PROVIDER_API_ERROR_MESSAGE_RE.fullmatch(normalized):
            return normalized
        if LLM_API_ERROR_MESSAGE_RE.fullmatch(normalized):
            return normalized
        if TEMPORARY_PROVIDER_UNAVAILABLE_RE.fullmatch(normalized):
            return normalized
    return INTERNAL_SERVER_ERROR_MESSAGE
