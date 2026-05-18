"""Shared episodic embedding policy for sidecar memory writes and startup backfill."""

from __future__ import annotations

from typing import Optional


def should_embed_episodic_entry(
    *,
    record_kind: Optional[str],
    role: Optional[str],
    message_type: Optional[str],
) -> bool:
    """Return True when an episodic row should receive embeddings."""
    del record_kind, role, message_type
    return True


def build_missing_embedding_rows_query(memory_type: str) -> str:
    """SQL query used for startup backfill scans."""
    del memory_type
    return """
        SELECT id, content
        FROM memories
        WHERE embedding_id IS NULL
    """
