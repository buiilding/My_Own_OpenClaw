"""Shared client-safe error messages for backend-to-UI surfaces."""

from __future__ import annotations

from typing import Any

INTERNAL_SERVER_ERROR_MESSAGE = (
    "Internal server error. Start a new chat and try again."
)
OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE = (
    "OpenAI Responses stream ended without final response payload"
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
    return INTERNAL_SERVER_ERROR_MESSAGE
