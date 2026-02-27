"""
Shared semanticization runtime helpers for LocalMemoryStore summarizer gates.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import List, Optional

try:
    import aiosqlite
except ImportError:
    aiosqlite = None


@asynccontextmanager
async def _open_cursor(*, db_path: str, use_row_factory: bool):
    if aiosqlite is None:
        raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

    async with aiosqlite.connect(db_path) as conn:
        if use_row_factory:
            conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        yield cursor


async def get_user_ids_with_unsemanticized_memories(
    *,
    episodic_db_path: str,
    limit: int,
) -> List[str]:
    async with _open_cursor(
        db_path=episodic_db_path,
        use_row_factory=False,
    ) as cursor:
        await cursor.execute(
            """
            SELECT user_id, MAX(timestamp) as latest_timestamp
            FROM memories
            WHERE is_semanticized = 0
              AND record_kind = 'interaction'
            GROUP BY user_id
            ORDER BY latest_timestamp DESC
            LIMIT ?
        """,
            (limit,),
        )
        rows = await cursor.fetchall()
        return [row[0] for row in rows if row and row[0]]


async def count_unsemanticized_interaction_memories(
    *,
    episodic_db_path: str,
    user_id: Optional[str] = None,
) -> int:
    async with _open_cursor(
        db_path=episodic_db_path,
        use_row_factory=False,
    ) as cursor:
        if user_id:
            await cursor.execute(
                """
                SELECT COUNT(*)
                FROM memories
                WHERE user_id = ?
                  AND is_semanticized = 0
                  AND record_kind = 'interaction'
            """,
                (user_id,),
            )
        else:
            await cursor.execute(
                """
                SELECT COUNT(*)
                FROM memories
                WHERE is_semanticized = 0
                  AND record_kind = 'interaction'
            """
            )
        row = await cursor.fetchone()
        return int(row[0]) if row else 0


async def semantic_summary_exists(
    *,
    semantic_db_path: str,
    summary_hash: str,
) -> bool:
    if not summary_hash:
        return False

    pattern = f'%\"summary_hash\": \"{summary_hash}\"%'
    async with _open_cursor(
        db_path=semantic_db_path,
        use_row_factory=False,
    ) as cursor:
        await cursor.execute(
            """
            SELECT 1 FROM memories
            WHERE metadata LIKE ?
            LIMIT 1
        """,
            (pattern,),
        )
        row = await cursor.fetchone()
        return row is not None
