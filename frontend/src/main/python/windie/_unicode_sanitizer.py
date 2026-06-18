"""
Helpers for removing lone surrogate code points from local-runtime payloads.
"""

from __future__ import annotations

import re
from typing import Any

_SURROGATE_RE = re.compile(r"[\ud800-\udfff]")
_REPLACEMENT_CHAR = "\uFFFD"
_MOJIBAKE_MARKERS = ("Ã", "â€", "â€™", "â€œ", "â€”", "â€“", "Â")
_MOJIBAKE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("â€œ", "“"),
    ("â€\x9d", "”"),
    ("â€˜", "‘"),
    ("â€™", "’"),
    ("â€”", "—"),
    ("â€“", "–"),
    ("â€¦", "…"),
    ("â€¢", "•"),
    ("Â ", " "),
    ("Â", ""),
)


def sanitize_surrogates_in_text(value: str) -> str:
    """Replace lone surrogate code points with U+FFFD."""
    if not value:
        return value
    return _SURROGATE_RE.sub(_REPLACEMENT_CHAR, value)


def repair_common_mojibake(value: str) -> str:
    """
    Repair common UTF-8-as-CP1252 mojibake (for example: 'â€œ' -> '“').
    """
    if not value or not any(marker in value for marker in _MOJIBAKE_MARKERS):
        return value

    def _attempt_decode(encoding: str) -> str:
        try:
            return value.encode(encoding).decode("utf-8")
        except Exception:
            return value

    repaired_cp1252 = _attempt_decode("cp1252")
    repaired_latin1 = _attempt_decode("latin1")

    def _apply_replacements(text: str) -> str:
        repaired = text
        for needle, replacement in _MOJIBAKE_REPLACEMENTS:
            repaired = repaired.replace(needle, replacement)
        return repaired

    replaced_original = _apply_replacements(value)
    replaced_cp1252 = _apply_replacements(repaired_cp1252)
    replaced_latin1 = _apply_replacements(repaired_latin1)

    def _score(text: str) -> int:
        penalty = sum(text.count(marker) for marker in _MOJIBAKE_MARKERS)
        return penalty

    candidates = [value, repaired_cp1252, repaired_latin1, replaced_original, replaced_cp1252, replaced_latin1]
    best = min(candidates, key=_score)
    return best


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
