"""Shared helpers for trimming and resolving optional string inputs."""

from __future__ import annotations

from typing import Any, Mapping


def normalize_non_empty_string(value: Any) -> str | None:
    """Return a trimmed string when value is a non-empty string."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def resolve_top_level_or_nested_string(
    top_level_value: Any,
    nested_values: Mapping[str, Any],
    *,
    nested_key: str,
) -> str | None:
    """Prefer a top-level string value and fall back to a nested field."""
    top_level = normalize_non_empty_string(top_level_value)
    if top_level is not None:
        return top_level
    return normalize_non_empty_string(nested_values.get(nested_key))
