"""Dedicated durable storage for SDK chat events.

Chat events are not memories. They are an ordered event log used for visible
chat replay and backend rehydrate snapshots.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    import aiosqlite
except ImportError:  # pragma: no cover - dependency guard is exercised at runtime
    aiosqlite = None


def _normalize_timestamp(timestamp: Optional[str]) -> str:
    if not isinstance(timestamp, str) or not timestamp.strip():
        return datetime.now(timezone.utc).isoformat()
    text = timestamp.strip()
    try:
        if text.endswith("Z"):
            parsed = datetime.fromisoformat(text[:-1] + "+00:00")
        else:
            parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _json_dumps(value: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(value, dict):
        return None
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _json_dumps_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _json_loads(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _json_loads_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if not isinstance(value, str) or not value.strip():
        return []
    try:
        parsed = json.loads(value)
    except Exception:
        return []
    return parsed if isinstance(parsed, list) else []


def _conversation_clause(conversation_id: Optional[str]) -> Tuple[str, Tuple[Any, ...]]:
    if conversation_id is None:
        return "conversation_id IS NULL", ()
    return "conversation_id = ?", (conversation_id,)


def _normalize_sql_limit(limit: Optional[int]) -> int:
    try:
        parsed = int(limit) if limit is not None else -1
    except (TypeError, ValueError):
        return -1
    return parsed if parsed > 0 else -1


async def init_chat_event_schema(db_path: str) -> None:
    if aiosqlite is None:
        raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                conversation_id TEXT,
                event_type TEXT NOT NULL,
                role TEXT,
                content TEXT,
                timestamp TEXT NOT NULL,
                message_index INTEGER NOT NULL,
                revision_id TEXT,
                turn_ref TEXT,
                tool_name TEXT,
                correlation_id TEXT,
                workspace_path TEXT,
                workspace_name TEXT,
                metadata TEXT,
                attachments TEXT,
                event_payload TEXT NOT NULL,
                compaction_checkpoint TEXT
            )
            """
        )
        await _ensure_chat_event_column(cursor, "attachments", "TEXT")
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_events_conversation_order
            ON chat_events(user_id, conversation_id, message_index, timestamp)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_events_timestamp
            ON chat_events(user_id, timestamp)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_events_type
            ON chat_events(user_id, conversation_id, event_type)
            """
        )
        await conn.commit()


async def _ensure_chat_event_column(cursor: Any, column_name: str, column_type: str) -> None:
    await cursor.execute("PRAGMA table_info(chat_events)")
    columns = await cursor.fetchall()
    existing = {row[1] for row in columns}
    if column_name not in existing:
        await cursor.execute(f"ALTER TABLE chat_events ADD COLUMN {column_name} {column_type}")


async def migrate_legacy_conversation_event_rows(db_path: str) -> int:
    """Copy legacy memory-table conversation_event rows into chat_events once."""
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            """
            SELECT id, user_id, content, timestamp, metadata, conversation_id, role,
                   message_index, message_type, tool_name, correlation_id
            FROM memories
            WHERE record_kind = 'conversation_event'
            ORDER BY message_index ASC, timestamp ASC
            """
        )
        rows = await cursor.fetchall()

    migrated = 0
    for row in rows:
        metadata = _json_loads(row["metadata"])
        structured_payload = _json_loads(metadata.get("structured_payload"))
        event_payload = _json_loads(
            structured_payload.get("windieSdkConversationEvent")
            or structured_payload.get("windie_sdk_conversation_event")
        )
        if not event_payload:
            event_payload = {
                "eventId": row["id"],
                "type": row["message_type"] or "assistant_message",
                "conversationRef": row["conversation_id"],
                "revisionId": f"rev-stored-{row['conversation_id']}",
                "timestamp": row["timestamp"],
                "source": "sdk",
                "payload": {
                    "text": row["content"] or "",
                    "content": row["content"] or "",
                    "role": row["role"],
                    "messageType": row["message_type"],
                    "toolName": row["tool_name"],
                    "correlationId": row["correlation_id"],
                },
            }
        event_payload.setdefault("eventId", row["id"])
        event_payload.setdefault("conversationRef", row["conversation_id"])
        event_payload.setdefault("timestamp", row["timestamp"])
        event_payload.setdefault("source", "sdk")
        event_payload.setdefault("revisionId", f"rev-stored-{row['conversation_id']}")
        payload = _json_loads(event_payload.get("payload"))
        checkpoint = payload if event_payload.get("type") == "compaction_applied" else None
        await append_chat_event(
            db_path=db_path,
            user_id=row["user_id"],
            conversation_id=row["conversation_id"],
            event_type=str(event_payload.get("type") or row["message_type"] or "assistant_message"),
            role=row["role"],
            content=row["content"] or "",
            timestamp=row["timestamp"],
            message_index=row["message_index"],
            revision_id=str(event_payload.get("revisionId") or ""),
            turn_ref=event_payload.get("turnRef"),
            tool_name=row["tool_name"],
            correlation_id=row["correlation_id"],
            workspace_path=metadata.get("workspace_path"),
            workspace_name=metadata.get("workspace_name"),
            metadata={
                "legacy_memory_id": row["id"],
                "migrated_from": "memories.conversation_event",
            },
            attachments=[],
            event_payload=event_payload,
            compaction_checkpoint=checkpoint,
        )
        migrated += 1
    return migrated


async def get_next_chat_event_index(
    *,
    db_path: str,
    user_id: str,
    conversation_id: Optional[str],
) -> int:
    clause, params = _conversation_clause(conversation_id)
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            SELECT MAX(message_index)
            FROM chat_events
            WHERE user_id = ? AND {clause}
            """,
            (user_id, *params),
        )
        row = await cursor.fetchone()
    return int(row[0] if row and row[0] is not None else 0) + 1


async def append_chat_event(
    *,
    db_path: str,
    user_id: str,
    conversation_id: Optional[str],
    event_type: str,
    role: Optional[str],
    content: str,
    timestamp: Optional[str],
    message_index: Optional[int],
    revision_id: Optional[str],
    turn_ref: Optional[str],
    tool_name: Optional[str],
    correlation_id: Optional[str],
    workspace_path: Optional[str],
    workspace_name: Optional[str],
    metadata: Optional[Dict[str, Any]],
    attachments: Optional[List[Any]],
    event_payload: Dict[str, Any],
    compaction_checkpoint: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_timestamp = _normalize_timestamp(timestamp)
    normalized_index = (
        int(message_index)
        if isinstance(message_index, int) and message_index > 0
        else await get_next_chat_event_index(
            db_path=db_path,
            user_id=user_id,
            conversation_id=conversation_id,
        )
    )
    event_id = str(event_payload.get("eventId") or event_payload.get("event_id") or uuid.uuid4())

    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT OR REPLACE INTO chat_events
            (id, user_id, conversation_id, event_type, role, content, timestamp,
             message_index, revision_id, turn_ref, tool_name, correlation_id,
             workspace_path, workspace_name, metadata, attachments, event_payload,
             compaction_checkpoint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                user_id,
                conversation_id,
                event_type,
                role,
                content or "",
                normalized_timestamp,
                normalized_index,
                revision_id,
                turn_ref,
                tool_name,
                correlation_id,
                workspace_path,
                workspace_name,
                _json_dumps(metadata),
                _json_dumps_value(attachments if isinstance(attachments, list) else []),
                _json_dumps(event_payload) or "{}",
                _json_dumps(compaction_checkpoint),
            ),
        )
        await conn.commit()

    return {
        "event_id": event_id,
        "message_index": normalized_index,
    }


def _row_to_dict(row: Any) -> Dict[str, Any]:
    metadata = _json_loads(row["metadata"])
    attachments = _json_loads_list(row["attachments"])
    event_payload = _json_loads(row["event_payload"])
    checkpoint = _json_loads(row["compaction_checkpoint"])
    result = {
        "id": row["id"],
        "user_id": row["user_id"],
        "conversation_id": row["conversation_id"],
        "event_type": row["event_type"],
        "role": row["role"],
        "content": row["content"] or "",
        "timestamp": row["timestamp"],
        "message_index": row["message_index"],
        "revision_id": row["revision_id"],
        "turn_ref": row["turn_ref"],
        "tool_name": row["tool_name"],
        "correlation_id": row["correlation_id"],
        "workspace_path": row["workspace_path"],
        "workspace_name": row["workspace_name"],
        "metadata": metadata,
        "attachments": attachments,
        "event_payload": event_payload,
    }
    if checkpoint:
        result["compaction_checkpoint"] = checkpoint
    return result


async def get_chat_events(
    *,
    db_path: str,
    user_id: str,
    conversation_id: Optional[str],
    limit: int,
    after_message_index: Optional[int] = None,
) -> List[Dict[str, Any]]:
    clause, params = _conversation_clause(conversation_id)
    pagination_clause = ""
    pagination_params: Tuple[Any, ...] = ()
    if isinstance(after_message_index, int):
        pagination_clause = "AND message_index > ?"
        pagination_params = (after_message_index,)

    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            SELECT *
            FROM chat_events
            WHERE user_id = ? AND {clause}
            {pagination_clause}
            ORDER BY message_index ASC, timestamp ASC
            LIMIT ?
            """,
            (user_id, *params, *pagination_params, max(1, int(limit or 1000))),
        )
        rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def list_chat_conversations(
    *,
    db_path: str,
    user_id: str,
    limit: Optional[int],
) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            """
            SELECT conversation_id,
                   MIN(timestamp) as first_timestamp,
                   MAX(timestamp) as last_timestamp,
                   COUNT(*) as entry_count,
                   (
                     SELECT content FROM chat_events e2
                     WHERE e2.user_id = chat_events.user_id
                       AND e2.conversation_id = chat_events.conversation_id
                       AND e2.role = 'user'
                       AND e2.content IS NOT NULL
                       AND e2.content != ''
                     ORDER BY e2.message_index ASC, e2.timestamp ASC
                     LIMIT 1
                   ) as first_user_content,
                   (
                     SELECT content FROM chat_events e2
                     WHERE e2.user_id = chat_events.user_id
                       AND e2.conversation_id = chat_events.conversation_id
                       AND e2.content IS NOT NULL
                       AND e2.content != ''
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as last_content,
                   (
                     SELECT revision_id FROM chat_events e2
                     WHERE e2.user_id = chat_events.user_id
                       AND e2.conversation_id = chat_events.conversation_id
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as revision_id,
                   (
                     SELECT workspace_path FROM chat_events e2
                     WHERE e2.user_id = chat_events.user_id
                       AND e2.conversation_id = chat_events.conversation_id
                       AND e2.workspace_path IS NOT NULL
                       AND e2.workspace_path != ''
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as workspace_path,
                   (
                     SELECT workspace_name FROM chat_events e2
                     WHERE e2.user_id = chat_events.user_id
                       AND e2.conversation_id = chat_events.conversation_id
                       AND e2.workspace_name IS NOT NULL
                       AND e2.workspace_name != ''
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as workspace_name
            FROM chat_events
            WHERE user_id = ? AND conversation_id IS NOT NULL
            GROUP BY conversation_id
            ORDER BY last_timestamp DESC
            LIMIT ?
            """,
            (user_id, _normalize_sql_limit(limit)),
        )
        rows = await cursor.fetchall()

    results: List[Dict[str, Any]] = []
    for row in rows:
        conversation_id = row["conversation_id"]
        if not isinstance(conversation_id, str) or not conversation_id.strip():
            continue
        title = str(row["first_user_content"] or row["last_content"] or conversation_id).strip()
        results.append(
            {
                "conversation_id": conversation_id,
                "first_timestamp": row["first_timestamp"],
                "last_timestamp": row["last_timestamp"],
                "entry_count": row["entry_count"],
                "record_kind": "chat_event",
                "revision_id": row["revision_id"] or f"rev-stored-{conversation_id}",
                "title": title or conversation_id,
                "last_message": row["last_content"] or "",
                "workspace_path": row["workspace_path"] or "",
                "workspace_name": row["workspace_name"] or "",
                "is_resumable": True,
            }
        )
    return results


async def search_chat_conversations(
    *,
    db_path: str,
    user_id: str,
    query: str,
    limit: int,
) -> List[Dict[str, Any]]:
    normalized_query = (query or "").strip().lower()
    if len(normalized_query) < 2:
        return []
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            """
            SELECT conversation_id, MAX(timestamp) as last_timestamp, COUNT(*) as hit_count
            FROM chat_events
            WHERE user_id = ?
              AND conversation_id IS NOT NULL
              AND LOWER(content) LIKE ?
            GROUP BY conversation_id
            ORDER BY last_timestamp DESC
            LIMIT ?
            """,
            (user_id, f"%{normalized_query}%", max(1, int(limit or 40))),
        )
        hit_rows = await cursor.fetchall()
    if not hit_rows:
        return []
    summaries = await list_chat_conversations(
        db_path=db_path,
        user_id=user_id,
        limit=None,
    )
    by_conversation = {row["conversation_id"]: row for row in summaries}
    results: List[Dict[str, Any]] = []
    for row in hit_rows:
        summary = by_conversation.get(row["conversation_id"])
        if summary:
            results.append({**summary, "hit_count": row["hit_count"]})
    return results[: max(1, int(limit or 40))]


async def delete_chat_conversation(
    *,
    db_path: str,
    user_id: str,
    conversation_id: Optional[str],
) -> int:
    clause, params = _conversation_clause(conversation_id)
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"DELETE FROM chat_events WHERE user_id = ? AND {clause}",
            (user_id, *params),
        )
        deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        await conn.commit()
    return int(deleted)


async def clear_chat_events(*, db_path: str, user_id: str) -> int:
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute("DELETE FROM chat_events WHERE user_id = ?", (user_id,))
        deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        await conn.commit()
    return int(deleted)
