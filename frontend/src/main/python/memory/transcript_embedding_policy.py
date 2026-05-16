"""Shared transcript embedding policy for sidecar memory writes and startup backfill."""

from __future__ import annotations

from typing import Optional

from memory.record_kinds import TRANSCRIPT_RECORD_KIND

EMBEDDABLE_ASSISTANT_TRANSCRIPT_MESSAGE_TYPES = ("", "llm-text", "error")


def is_semantic_transcript_candidate(
    role: Optional[str],
    message_type: Optional[str],
) -> bool:
    """Return True when a transcript row should receive embeddings."""
    normalized_role = (role or "").strip().lower()
    normalized_type = (message_type or "").strip().lower()

    if normalized_role == "user":
        return True

    if normalized_role == "assistant":
        return normalized_type in EMBEDDABLE_ASSISTANT_TRANSCRIPT_MESSAGE_TYPES

    return False


def should_embed_episodic_entry(
    *,
    record_kind: Optional[str],
    role: Optional[str],
    message_type: Optional[str],
) -> bool:
    """Return True when an episodic row should receive embeddings."""
    normalized_kind = (record_kind or "memory").strip().lower()
    if normalized_kind != TRANSCRIPT_RECORD_KIND:
        return True
    return is_semantic_transcript_candidate(role, message_type)


def build_missing_embedding_rows_query(memory_type: str) -> str:
    """
    SQL query used for startup backfill scans.

    Episodic policy intentionally excludes low-signal transcript tool chatter and
    non-semantic transcript rows so startup does not rescan rows that are never embeddable.
    """
    if memory_type == "episodic":
        allowed_types_sql = ", ".join(
            f"'{message_type}'" for message_type in EMBEDDABLE_ASSISTANT_TRANSCRIPT_MESSAGE_TYPES
        )
        return f"""
            SELECT id, content
            FROM memories
            WHERE embedding_id IS NULL
              AND (
                COALESCE(LOWER(TRIM(record_kind)), '') != '{TRANSCRIPT_RECORD_KIND}'
                OR COALESCE(LOWER(TRIM(role)), '') = 'user'
                OR (
                  COALESCE(LOWER(TRIM(role)), '') = 'assistant'
                  AND COALESCE(LOWER(TRIM(message_type)), '') IN ({allowed_types_sql})
                )
              )
        """
    return """
        SELECT id, content
        FROM memories
        WHERE embedding_id IS NULL
    """
