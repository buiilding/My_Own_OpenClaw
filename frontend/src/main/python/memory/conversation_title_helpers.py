"""
Shared conversation-title generation/query helpers for LocalMemoryStore.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional, Tuple

TITLE_NORMALIZED_MAX_WORDS = 6
TITLE_NORMALIZED_MAX_CHARS = 48


def normalize_generated_title(raw_title: Optional[str]) -> str:
    if not isinstance(raw_title, str):
        return ""
    title = raw_title.strip()
    if not title:
        return ""
    first_line = next((line.strip() for line in title.splitlines() if line.strip()), "")
    if not first_line:
        return ""
    first_line = re.sub(r"^(title\s*:\s*)", "", first_line, flags=re.IGNORECASE)
    first_line = first_line.strip().strip("`").strip().strip("\"'")
    first_line = re.sub(r"\s+", " ", first_line).strip()
    words = first_line.split()
    if words:
        first_line = " ".join(words[:TITLE_NORMALIZED_MAX_WORDS]).strip()
    if len(first_line) > TITLE_NORMALIZED_MAX_CHARS:
        first_line = first_line[:TITLE_NORMALIZED_MAX_CHARS].rstrip()
    return first_line


async def lookup_conversation_title_state(
    *,
    cursor,
    user_id: str,
    conversation_id: str,
) -> Tuple[Optional[str], Optional[str], bool]:
    await cursor.execute(
        """
        SELECT title, source, is_locked
        FROM conversation_titles
        WHERE user_id = ? AND conversation_id = ?
    """,
        (user_id, conversation_id),
    )
    row = await cursor.fetchone()
    if not row:
        return None, None, False

    title = (row["title"] or "").strip() or None
    source = (row["source"] or "").strip() or None
    is_locked = bool(row["is_locked"])
    return title, source, is_locked


async def fetch_title_generation_inputs(
    *,
    cursor,
    user_id: str,
    conversation_id: str,
    preferred_model_id: Optional[str],
    preferred_model_provider: Optional[str],
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    await cursor.execute(
        """
        SELECT content
        FROM memories
        WHERE user_id = ? AND conversation_id = ?
          AND record_kind = 'transcript'
          AND role = 'user'
          AND content IS NOT NULL
          AND content != ''
        ORDER BY message_index ASC, timestamp ASC
        LIMIT 1
    """,
        (user_id, conversation_id),
    )
    first_user_row = await cursor.fetchone()

    normalized_model_id = (
        preferred_model_id.strip()
        if isinstance(preferred_model_id, str) and preferred_model_id.strip()
        else None
    )
    normalized_model_provider = (
        preferred_model_provider.strip()
        if isinstance(preferred_model_provider, str) and preferred_model_provider.strip()
        else None
    )

    first_assistant_row = None
    if normalized_model_id and normalized_model_provider:
        await cursor.execute(
            """
            SELECT content, model_id, model_provider
            FROM memories
            WHERE user_id = ? AND conversation_id = ?
              AND record_kind = 'transcript'
              AND role = 'assistant'
              AND LOWER(REPLACE(COALESCE(message_type, ''), '_', '-')) = 'llm-text'
              AND model_id = ?
              AND model_provider = ?
              AND content IS NOT NULL
              AND content != ''
            ORDER BY message_index ASC, timestamp ASC
            LIMIT 1
        """,
            (
                user_id,
                conversation_id,
                normalized_model_id,
                normalized_model_provider,
            ),
        )
        first_assistant_row = await cursor.fetchone()

    if not first_assistant_row:
        await cursor.execute(
            """
            SELECT content, model_id, model_provider
            FROM memories
            WHERE user_id = ? AND conversation_id = ?
              AND record_kind = 'transcript'
              AND role = 'assistant'
              AND LOWER(REPLACE(COALESCE(message_type, ''), '_', '-')) = 'llm-text'
              AND content IS NOT NULL
              AND content != ''
            ORDER BY message_index ASC, timestamp ASC
            LIMIT 1
        """,
            (user_id, conversation_id),
        )
        first_assistant_row = await cursor.fetchone()

    return (
        first_user_row["content"] if first_user_row else None,
        first_assistant_row["content"] if first_assistant_row else None,
        (first_assistant_row["model_id"] or "").strip() if first_assistant_row else None,
        (first_assistant_row["model_provider"] or "").strip() if first_assistant_row else None,
    )


async def ensure_conversation_title(
    *,
    cursor,
    user_id: str,
    conversation_id: Optional[str],
    existing_title: Optional[str],
    existing_title_source: Optional[str],
    existing_title_locked: Optional[int],
) -> Tuple[Optional[str], Optional[str]]:
    if not conversation_id:
        return None, None

    current_title = (existing_title or "").strip()
    if current_title:
        return current_title, existing_title_source or "model"

    title, source, is_locked = await lookup_conversation_title_state(
        cursor=cursor,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    if title:
        return title, source or "model"
    if is_locked or existing_title_locked:
        return None, source
    return None, None


async def ensure_conversation_title_from_row(
    *,
    cursor,
    user_id: str,
    row: Mapping[str, Any],
) -> Tuple[Optional[str], Optional[str]]:
    def _row_value(key: str) -> Any:
        getter = getattr(row, "get", None)
        if callable(getter):
            return getter(key)
        try:
            return row[key]
        except Exception:
            return None

    return await ensure_conversation_title(
        cursor=cursor,
        user_id=user_id,
        conversation_id=_row_value("conversation_id"),
        existing_title=_row_value("title"),
        existing_title_source=_row_value("title_source"),
        existing_title_locked=_row_value("title_locked"),
    )
