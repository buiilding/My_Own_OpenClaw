"""Shared provider error/status mapping helpers."""

from __future__ import annotations

import re
from typing import Iterator, Optional

HTTP_STATUS_CODE_PATTERN = re.compile(
    r"\b(?:status|error)\s+code\s+(\d{3})\b",
    re.IGNORECASE,
)
HTTP_SERVER_ERROR_PATTERN = re.compile(r"server error '?(\d{3})", re.IGNORECASE)


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
