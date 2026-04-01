"""Shared helpers for session conversation reference normalization."""

from __future__ import annotations

from typing import Optional


def normalize_optional_conversation_ref(
    conversation_ref: Optional[str],
) -> Optional[str]:
    """Normalize optional conversation refs to trimmed non-empty strings."""
    if not isinstance(conversation_ref, str):
        return None
    normalized = conversation_ref.strip()
    return normalized or None
