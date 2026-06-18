"""Shared helpers for trimming and resolving optional string inputs."""

from __future__ import annotations

from typing import Any


def normalize_non_empty_string(value: Any) -> str | None:
    """Return a trimmed string when value is a non-empty string."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None
