"""
Shared conversation-list runtime helpers for LocalMemoryStore transcript windows.
"""

from __future__ import annotations

from typing import Any, Dict, List

from memory.conversation_title_helpers import ensure_conversation_title_from_row

try:
    import aiosqlite
except ImportError:
    aiosqlite = None


async def fetch_transcript_conversation_rows(
    *,
    cursor,
    user_id: str,
    limit: int,
) -> List[Dict[str, Any]]:
    await cursor.execute(
        """
        SELECT conversation_id,
               MIN(timestamp) as first_timestamp,
               MAX(timestamp) as last_timestamp,
               COUNT(*) as entry_count,
               record_kind,
               (
                 SELECT title FROM conversation_titles ct
                 WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                 LIMIT 1
               ) as title,
               (
                 SELECT source FROM conversation_titles ct
                 WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                 LIMIT 1
               ) as title_source,
               (
                 SELECT is_locked FROM conversation_titles ct
                 WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                 LIMIT 1
               ) as title_locked,
               (
                 SELECT model_id FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = 'transcript'
                   AND m2.model_id IS NOT NULL AND m2.model_id != ''
                 ORDER BY m2.timestamp DESC, m2.message_index DESC
                 LIMIT 1
               ) as model_id,
               (
                 SELECT model_provider FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = 'transcript'
                   AND m2.model_provider IS NOT NULL AND m2.model_provider != ''
                 ORDER BY m2.timestamp DESC, m2.message_index DESC
                 LIMIT 1
               ) as model_provider
        FROM memories
        WHERE user_id = ? AND record_kind = 'transcript'
        GROUP BY conversation_id
        ORDER BY last_timestamp DESC
        LIMIT ?
    """,
        (user_id, user_id, user_id, user_id, user_id, user_id, limit),
    )
    return await cursor.fetchall()


async def build_conversation_list_results(
    *,
    cursor,
    user_id: str,
    rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for row in rows:
        conversation_id = row["conversation_id"]
        title, title_source = await ensure_conversation_title_from_row(
            cursor=cursor, user_id=user_id, row=row
        )
        if not isinstance(title, str) or not title.strip():
            continue
        results.append({
            "conversation_id": conversation_id,
            "first_timestamp": row["first_timestamp"],
            "last_timestamp": row["last_timestamp"],
            "entry_count": row["entry_count"],
            "record_kind": row["record_kind"],
            "model_id": row["model_id"],
            "model_provider": row["model_provider"],
            "title": title.strip(),
            "title_source": title_source or "model",
            "is_resumable": bool(
                isinstance(conversation_id, str)
                and conversation_id.startswith("conv_")
            ),
        })
    return results


async def list_transcript_conversations(
    *,
    episodic_db_path: str,
    user_id: str,
    limit: int,
) -> List[Dict[str, Any]]:
    if aiosqlite is None:
        raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

    async with aiosqlite.connect(episodic_db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        rows = await fetch_transcript_conversation_rows(
            cursor=cursor,
            user_id=user_id,
            limit=limit,
        )
        results = await build_conversation_list_results(
            cursor=cursor,
            user_id=user_id,
            rows=rows,
        )
        await conn.commit()
        return results
