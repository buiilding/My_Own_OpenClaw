"""Helpers for normalizing coordinate-method inputs."""

from __future__ import annotations

from typing import Any

from backend.src.core.types.enums import CoordinateFindingMethod


def normalize_coordinate_method(value: Any, *, default: str | None = None) -> str:
    """Normalize enum/string coordinate method values to lowercase strings."""
    if isinstance(value, CoordinateFindingMethod):
        return value.value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized:
            return normalized

    if default is not None:
        return default

    return str(value).strip().lower()
