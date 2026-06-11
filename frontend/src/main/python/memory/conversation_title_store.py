"""SQLite helpers for durable conversation titles."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

import aiosqlite


async def get_conversation_title_state(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
) -> Dict[str, Any]:
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
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
        return {}
    return {
        "title": row["title"] or "",
        "source": row["source"] or "",
        "is_locked": bool(row["is_locked"]),
    }


async def get_first_title_exchange(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
) -> Dict[str, str]:
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            SELECT content
            FROM conversation_events
            WHERE user_id = ?
              AND conversation_id = ?
              AND role = 'user'
              AND content IS NOT NULL
              AND content != ''
            ORDER BY message_index ASC, timestamp ASC
            LIMIT 1
            """,
            (user_id, conversation_id),
        )
        user_row = await cursor.fetchone()
        await cursor.execute(
            """
            SELECT content
            FROM conversation_events
            WHERE user_id = ?
              AND conversation_id = ?
              AND role = 'assistant'
              AND event_type = 'assistant_message'
              AND content IS NOT NULL
              AND content != ''
            ORDER BY message_index ASC, timestamp ASC
            LIMIT 1
            """,
            (user_id, conversation_id),
        )
        assistant_row = await cursor.fetchone()
    return {
        "user_message": (user_row[0] if user_row else "") or "",
        "assistant_message": (assistant_row[0] if assistant_row else "") or "",
    }


async def upsert_generated_conversation_title(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
    title: str,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT INTO conversation_titles (
                user_id, conversation_id, title, source, is_locked, created_at, updated_at
            )
            VALUES (?, ?, ?, 'model', 0, ?, ?)
            ON CONFLICT(user_id, conversation_id) DO UPDATE SET
                title = excluded.title,
                source = 'model',
                updated_at = excluded.updated_at
            WHERE conversation_titles.is_locked = 0
            """,
            (user_id, conversation_id, title.strip(), now, now),
        )
        await conn.commit()
