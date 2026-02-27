"""
Shared transcript-window runtime helpers for LocalMemoryStore.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Tuple

try:
    import aiosqlite
except ImportError:
    aiosqlite = None


def conversation_where_clause(conversation_id: Optional[str]) -> Tuple[str, Tuple[Any, ...]]:
    if conversation_id is None:
        return "conversation_id IS NULL", ()
    return "conversation_id = ?", (conversation_id,)


@asynccontextmanager
async def _open_episodic_connection(*, episodic_db_path: str, use_row_factory: bool):
    if aiosqlite is None:
        raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

    async with aiosqlite.connect(episodic_db_path) as conn:
        if use_row_factory:
            conn.row_factory = aiosqlite.Row
        yield conn


@asynccontextmanager
async def _open_episodic_cursor(*, episodic_db_path: str, use_row_factory: bool):
    async with _open_episodic_connection(
        episodic_db_path=episodic_db_path,
        use_row_factory=use_row_factory,
    ) as conn:
        cursor = await conn.cursor()
        yield cursor


async def get_next_message_index_for_conversation(
    *,
    episodic_db_path: str,
    user_id: str,
    conversation_id: Optional[str],
) -> int:
    async with _open_episodic_cursor(
        episodic_db_path=episodic_db_path,
        use_row_factory=False,
    ) as cursor:
        clause, params = conversation_where_clause(conversation_id)
        await cursor.execute(
            f"""
            SELECT MAX(message_index)
            FROM memories
            WHERE user_id = ? AND record_kind = 'transcript' AND {clause}
        """,
            (user_id, *params),
        )
        row = await cursor.fetchone()
        max_index = row[0] if row and row[0] is not None else 0
        return int(max_index) + 1


async def get_episodic_memories_for_conversation(
    *,
    episodic_db_path: str,
    user_id: str,
    conversation_id: Optional[str],
    limit: int,
    record_kind: Optional[str],
    after_message_index: Optional[int],
    parse_raw_metadata,
) -> List[Dict[str, Any]]:
    async with _open_episodic_cursor(
        episodic_db_path=episodic_db_path,
        use_row_factory=True,
    ) as cursor:

        _ = record_kind  # API compatibility; transcript is the only supported kind.
        record_kind_clause = "AND record_kind = 'transcript'"
        conversation_clause, conversation_params = conversation_where_clause(conversation_id)
        pagination_clause = ""
        pagination_params: Tuple[Any, ...] = ()
        if isinstance(after_message_index, int):
            pagination_clause = "AND message_index > ?"
            pagination_params = (after_message_index,)

        await cursor.execute(
            f"""
            SELECT id, content, timestamp, metadata, conversation_id, role, message_index, message_type, tool_name, correlation_id, record_kind, model_id, model_provider, screenshot
            FROM memories
            WHERE user_id = ? AND {conversation_clause}
            {record_kind_clause}
            {pagination_clause}
            ORDER BY message_index ASC, timestamp ASC
            LIMIT ?
        """,
            (user_id, *conversation_params, *pagination_params, limit),
        )

        rows = await cursor.fetchall()
        results: List[Dict[str, Any]] = []
        for row in rows:
            metadata = parse_raw_metadata(row["metadata"])
            results.append({
                "id": row["id"],
                "content": row["content"],
                "timestamp": row["timestamp"],
                "metadata": metadata,
                "conversation_id": row["conversation_id"],
                "record_kind": row["record_kind"] or metadata.get("record_kind"),
                "role": row["role"],
                "message_index": row["message_index"],
                "message_type": row["message_type"],
                "tool_name": row["tool_name"],
                "correlation_id": row["correlation_id"],
                "model_id": row["model_id"],
                "model_provider": row["model_provider"],
                "screenshot": row["screenshot"],
            })
        return results


async def get_unsemanticized_conversation_windows(
    *,
    episodic_db_path: str,
    user_id: str,
) -> List[str]:
    async with _open_episodic_cursor(
        episodic_db_path=episodic_db_path,
        use_row_factory=False,
    ) as cursor:
        await cursor.execute(
            """
            SELECT conversation_id, MIN(timestamp) as earliest_timestamp
            FROM memories
            WHERE user_id = ? AND is_semanticized = 0
              AND record_kind = 'interaction'
            GROUP BY conversation_id
            ORDER BY earliest_timestamp ASC
        """,
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [row[0] for row in rows]


async def get_unsemanticized_episodic_memories_by_conversation(
    *,
    episodic_db_path: str,
    user_id: str,
    conversation_id: Optional[str],
    limit: int,
    format_transcript_rows,
) -> List[Dict[str, Any]]:
    async with _open_episodic_cursor(
        episodic_db_path=episodic_db_path,
        use_row_factory=True,
    ) as cursor:
        conversation_clause, conversation_params = conversation_where_clause(conversation_id)
        await cursor.execute(
            f"""
            SELECT
                id,
                content,
                timestamp,
                metadata,
                conversation_id,
                record_kind,
                role,
                message_type,
                tool_name
            FROM memories
            WHERE user_id = ? AND is_semanticized = 0
              AND record_kind = 'interaction'
              AND {conversation_clause}
            ORDER BY timestamp ASC
            LIMIT ?
        """,
            (user_id, *conversation_params, limit),
        )

        rows = await cursor.fetchall()
        return format_transcript_rows(rows, include_conversation_id=True)


def format_transcript_rows(
    *,
    rows: List[Dict[str, Any]],
    include_conversation_id: bool,
    parse_raw_metadata,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for row in rows:
        metadata = parse_raw_metadata(row["metadata"])
        entry = {
            "id": row["id"],
            "content": row["content"],
            "timestamp": row["timestamp"],
            "metadata": metadata,
            "record_kind": row["record_kind"] or metadata.get("record_kind"),
            "role": row["role"] or metadata.get("role"),
            "message_type": row["message_type"] or metadata.get("message_type"),
            "tool_name": row["tool_name"] or metadata.get("tool_name"),
        }
        if include_conversation_id:
            entry["conversation_id"] = row["conversation_id"]
        results.append(entry)
    return results


async def get_unsemanticized_episodic_memories(
    *,
    episodic_db_path: str,
    user_id: str,
    limit: int,
    format_transcript_rows,
) -> List[Dict[str, Any]]:
    async with _open_episodic_cursor(
        episodic_db_path=episodic_db_path,
        use_row_factory=True,
    ) as cursor:
        await cursor.execute(
            """
            SELECT id, content, timestamp, metadata, record_kind, role, message_type, tool_name
            FROM memories
            WHERE user_id = ? AND is_semanticized = 0
              AND record_kind = 'interaction'
            ORDER BY timestamp ASC
            LIMIT ?
        """,
            (user_id, limit),
        )
        rows = await cursor.fetchall()
        return format_transcript_rows(rows, include_conversation_id=False)


async def mark_episodic_memories_semanticized(
    *,
    episodic_db_path: str,
    memory_ids: List[str],
    log_debug=None,
) -> None:
    if not memory_ids:
        return

    async with _open_episodic_connection(
        episodic_db_path=episodic_db_path,
        use_row_factory=False,
    ) as conn:
        cursor = await conn.cursor()
        placeholders = ",".join(["?"] * len(memory_ids))
        await cursor.execute(
            f"""
            UPDATE memories
            SET is_semanticized = 1
            WHERE id IN ({placeholders})
        """,
            memory_ids,
        )
        await conn.commit()

    if callable(log_debug):
        log_debug("Marked %s episodic memories as semanticized", len(memory_ids))


async def get_unprocessed_memories_after_id(
    *,
    episodic_db_path: str,
    last_id: Optional[str],
    user_id: str,
    limit: int,
    format_transcript_rows,
) -> List[Dict[str, Any]]:
    async with _open_episodic_cursor(
        episodic_db_path=episodic_db_path,
        use_row_factory=True,
    ) as cursor:
        await cursor.execute(
            """
            WITH watermark AS (
                SELECT timestamp
                FROM memories
                WHERE id = ?
            )
            SELECT
                id,
                content,
                timestamp,
                metadata,
                conversation_id,
                record_kind,
                role,
                message_type,
                tool_name
            FROM memories
            WHERE user_id = ?
              AND is_semanticized = 0
              AND record_kind = 'interaction'
              AND (
                  ? IS NULL
                  OR NOT EXISTS (SELECT 1 FROM watermark)
                  OR timestamp > (SELECT timestamp FROM watermark)
                  OR (
                      timestamp = (SELECT timestamp FROM watermark)
                      AND id > ?
                  )
              )
            ORDER BY timestamp ASC, id ASC
            LIMIT ?
        """,
            (last_id, user_id, last_id, last_id, limit),
        )
        rows = await cursor.fetchall()
        return format_transcript_rows(rows, include_conversation_id=True)
