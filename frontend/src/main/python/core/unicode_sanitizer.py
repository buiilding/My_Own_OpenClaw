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


def has_lone_surrogates(value: str) -> bool:
    """Return True when a string contains surrogate code points."""
    if not value:
        return False
    return _SURROGATE_RE.search(value) is not None


def find_surrogate_paths(
    value: Any,
    *,
    root: str = "payload",
    max_paths: int = 8,
) -> list[str]:
    """
    Return up to `max_paths` field paths that contain surrogate code points.
    """
    paths: list[str] = []

    def _walk(current: Any, path: str) -> None:
        if len(paths) >= max_paths:
            return
        if isinstance(current, str):
            if has_lone_surrogates(current):
                paths.append(path)
            return
        if isinstance(current, dict):
            for key, item in current.items():
                next_key = key if isinstance(key, str) else repr(key)
                _walk(item, f"{path}.{next_key}")
                if len(paths) >= max_paths:
                    return
            return
        if isinstance(current, (list, tuple)):
            for index, item in enumerate(current):
                _walk(item, f"{path}[{index}]")
                if len(paths) >= max_paths:
                    return

    _walk(value, root)
    return paths


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
