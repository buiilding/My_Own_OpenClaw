"""
Helpers for removing lone surrogate code points from sidecar payloads.
"""

from __future__ import annotations

import re
from typing import Any

_SURROGATE_RE = re.compile(r"[\ud800-\udfff]")
_REPLACEMENT_CHAR = "\uFFFD"


def sanitize_surrogates_in_text(value: str) -> str:
    """Replace lone surrogate code points with U+FFFD."""
    if not value:
        return value
    return _SURROGATE_RE.sub(_REPLACEMENT_CHAR, value)


def sanitize_surrogates(value: Any) -> Any:
    """
    Recursively sanitize strings in JSON-like payloads.

    Preserves container types for dict/list/tuple.
    """
    if isinstance(value, str):
        return sanitize_surrogates_in_text(value)
    if isinstance(value, dict):
        return {
            sanitize_surrogates_in_text(key) if isinstance(key, str) else key: sanitize_surrogates(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize_surrogates(item) for item in value]
    if isinstance(value, tuple):
        return tuple(sanitize_surrogates(item) for item in value)
    return value

