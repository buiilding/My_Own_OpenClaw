"""Dedicated durable storage for SDK conversation history.

Conversation events are not memories. They are an ordered event log used for
visible chat replay, backend rehydrate snapshots, and durable path traces.
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


SIDEBAR_METADATA_EVENT_TYPES = (
    "user_message",
    "assistant_message",
    "tool_output",
    "tool_bundle_output",
    "turn_error",
)

CONVERSATION_EVENTS_TABLE = "conversation_events"
CONVERSATION_DISPLAY_TIMELINE_TABLE = "conversation_display_timeline"
CONVERSATION_MODEL_HISTORY_TABLE = "conversation_model_history"
CONVERSATION_REVISIONS_TABLE = "conversation_revisions"
CONVERSATIONS_TABLE = "conversations"
CONVERSATION_TURNS_TABLE = "conversation_turns"
CONVERSATION_TITLES_TABLE = "conversation_titles"
CONVERSATION_DISPLAY_MESSAGES_VIEW = "conversation_display_messages"
REVISION_OPERATIONS = {
    "send",
    "edit",
    "retry",
    "fork",
    "compact",
    "manual_rewrite",
}


def _revision_operation_from_display_reason(reason: Optional[str]) -> str:
    if reason == "user_edit":
        return "edit"
    if reason in {"retry", "fork", "manual_rewrite"}:
        return reason
    return "send"


def _revision_operation_from_model_history_rows(rows: list[dict[str, Any]]) -> str:
    for row in rows:
        if row.get("message_type") == "context_compaction":
            return "compact"
    return "send"


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


def _display_content_to_sidebar_text(value: Any) -> str:
    if value is None:
        return ""
    parsed: Any = value
    if isinstance(value, str):
        if not value.strip():
            return ""
        try:
            parsed = json.loads(value)
        except Exception:
            return value.strip()
    if parsed is None:
        return ""
    if isinstance(parsed, str):
        return parsed.strip()
    return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)


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


def _normalize_producer(producer: Optional[str]) -> str:
    if isinstance(producer, str) and producer.strip():
        return producer.strip()
    return "sdk"


def _normalize_producer_sequence(sequence: Any) -> Optional[int]:
    if isinstance(sequence, bool):
        return None
    try:
        parsed = int(sequence)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _resolve_producer_fields(
    *,
    event_id: str,
    event: Dict[str, Any],
) -> Tuple[str, Optional[str], Optional[int]]:
    producer = _normalize_producer(event.get("producer"))
    producer_event_id = event.get("producer_event_id", event.get("producerEventId"))
    normalized_producer_event_id = (
        producer_event_id
        if isinstance(producer_event_id, str) and producer_event_id.strip()
        else (event_id if producer == "backend" else None)
    )
    producer_sequence = _normalize_producer_sequence(
        event.get("producer_sequence", event.get("producerSequence"))
    )
    return producer, normalized_producer_event_id, producer_sequence


async def _create_revision_graph_table(conn: Any) -> None:
    await conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {CONVERSATION_REVISIONS_TABLE} (
            user_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL,
            revision_id TEXT NOT NULL,
            parent_revision_id TEXT,
            operation TEXT NOT NULL DEFAULT 'send',
            display_timeline_id TEXT,
            model_history_checkpoint_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (user_id, conversation_id, revision_id)
        )
        """
    )


async def _ensure_revision_graph_schema(conn: Any) -> None:
    cursor = await conn.execute(f"PRAGMA table_info({CONVERSATION_REVISIONS_TABLE})")
    columns = {row[1] for row in await cursor.fetchall()}
    expected = {
        "parent_revision_id",
        "operation",
        "display_timeline_id",
        "model_history_checkpoint_id",
        "created_at",
        "active",
    }
    if columns and expected.issubset(columns):
        return
    if columns:
        legacy_table = f"{CONVERSATION_REVISIONS_TABLE}_legacy"
        await conn.execute(f"DROP TABLE IF EXISTS {legacy_table}")
        await conn.execute(
            f"ALTER TABLE {CONVERSATION_REVISIONS_TABLE} RENAME TO {legacy_table}"
        )
        await _create_revision_graph_table(conn)
        await conn.execute(
            f"""
            INSERT OR REPLACE INTO {CONVERSATION_REVISIONS_TABLE}
            (user_id, conversation_id, revision_id, parent_revision_id,
             operation, display_timeline_id, model_history_checkpoint_id,
             created_at, updated_at, active)
            SELECT user_id, conversation_id, revision_id, NULL,
                   'send', revision_id, NULL, updated_at, updated_at, 1
            FROM {legacy_table}
            WHERE revision_id IS NOT NULL AND revision_id != ''
            """
        )
        await conn.execute(f"DROP TABLE IF EXISTS {legacy_table}")
        return
    await _create_revision_graph_table(conn)


async def _upsert_revision_node(
    conn: Any,
    *,
    user_id: str,
    conversation_id: str,
    revision_id: str,
    updated_at: str,
    operation: str = "send",
    parent_revision_id: Optional[str] = None,
    display_timeline_id: Optional[str] = None,
    model_history_checkpoint_id: Optional[str] = None,
    active: bool = True,
) -> None:
    if not conversation_id or not revision_id:
        return
    normalized_operation = operation if operation in REVISION_OPERATIONS else "send"
    if active:
        await conn.execute(
            f"""
            UPDATE {CONVERSATION_REVISIONS_TABLE}
            SET active = 0
            WHERE user_id = ? AND conversation_id = ? AND revision_id != ?
            """,
            (user_id, conversation_id, revision_id),
        )
    await conn.execute(
        f"""
        INSERT INTO {CONVERSATION_REVISIONS_TABLE}
        (user_id, conversation_id, revision_id, parent_revision_id, operation,
         display_timeline_id, model_history_checkpoint_id, created_at,
         updated_at, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, conversation_id, revision_id)
        DO UPDATE SET
            parent_revision_id = COALESCE(excluded.parent_revision_id, parent_revision_id),
            operation = CASE
                WHEN excluded.operation = 'send' AND operation != 'send'
                THEN operation
                ELSE excluded.operation
            END,
            display_timeline_id = COALESCE(excluded.display_timeline_id, display_timeline_id),
            model_history_checkpoint_id = COALESCE(
                excluded.model_history_checkpoint_id,
                model_history_checkpoint_id
            ),
            updated_at = excluded.updated_at,
            active = excluded.active
        """,
        (
            user_id,
            conversation_id,
            revision_id,
            parent_revision_id,
            normalized_operation,
            display_timeline_id,
            model_history_checkpoint_id,
            updated_at,
            updated_at,
            1 if active else 0,
        ),
    )


async def init_chat_event_schema(db_path: str) -> None:
    if aiosqlite is None:
        raise ImportError(
            "aiosqlite is not installed. Install with: pip install aiosqlite"
        )

    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_events (
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
                producer TEXT NOT NULL DEFAULT 'sdk',
                producer_event_id TEXT,
                producer_sequence INTEGER,
                metadata TEXT,
                attachments TEXT,
                event_payload TEXT NOT NULL,
                compaction_checkpoint TEXT
            )
            """
        )
        await _ensure_event_column(
            cursor, CONVERSATION_EVENTS_TABLE, "attachments", "TEXT"
        )
        await _ensure_event_column(
            cursor,
            CONVERSATION_EVENTS_TABLE,
            "producer",
            "TEXT NOT NULL DEFAULT 'sdk'",
        )
        await _ensure_event_column(
            cursor, CONVERSATION_EVENTS_TABLE, "producer_event_id", "TEXT"
        )
        await _ensure_event_column(
            cursor, CONVERSATION_EVENTS_TABLE, "producer_sequence", "INTEGER"
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_events_order
            ON conversation_events(user_id, conversation_id, message_index, timestamp)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_events_timestamp
            ON conversation_events(user_id, timestamp)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_events_type
            ON conversation_events(user_id, conversation_id, event_type, timestamp)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_events_turn
            ON conversation_events(user_id, conversation_id, turn_ref, message_index)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_events_producer_order
            ON conversation_events(user_id, conversation_id, turn_ref, producer, producer_sequence)
            """
        )
        await cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CONVERSATION_DISPLAY_TIMELINE_TABLE} (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                revision_id TEXT NOT NULL,
                row_index INTEGER NOT NULL,
                row_id TEXT NOT NULL,
                role TEXT NOT NULL,
                row_type TEXT NOT NULL,
                content TEXT,
                turn_ref TEXT,
                metadata TEXT,
                reason TEXT,
                base_revision_id TEXT,
                created_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (user_id, conversation_id, revision_id, row_index)
            )
            """
        )
        await cursor.execute(
            f"""
            CREATE INDEX IF NOT EXISTS idx_conversation_display_timeline_active
            ON {CONVERSATION_DISPLAY_TIMELINE_TABLE}
            (user_id, conversation_id, revision_id, active, created_at)
            """
        )
        await cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CONVERSATION_MODEL_HISTORY_TABLE} (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                revision_id TEXT NOT NULL,
                checkpoint_id TEXT NOT NULL,
                row_index INTEGER NOT NULL,
                row_id TEXT NOT NULL,
                role TEXT NOT NULL,
                message_type TEXT NOT NULL,
                content TEXT,
                tool_call_id TEXT,
                tool_calls TEXT,
                tool_name TEXT,
                image_refs TEXT,
                compaction_facts TEXT,
                source_display_row_ids TEXT,
                created_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (user_id, conversation_id, checkpoint_id, row_index)
            )
            """
        )
        await cursor.execute(
            f"""
            CREATE INDEX IF NOT EXISTS idx_conversation_model_history_active
            ON {CONVERSATION_MODEL_HISTORY_TABLE}
            (user_id, conversation_id, revision_id, active, created_at)
            """
        )
        await _ensure_revision_graph_schema(conn)
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_revisions_updated
            ON conversation_revisions(user_id, updated_at)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_revisions_active
            ON conversation_revisions(user_id, conversation_id, active, updated_at)
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_revisions_parent
            ON conversation_revisions(user_id, conversation_id, parent_revision_id)
            """
        )
        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                title TEXT,
                created_at TEXT,
                updated_at TEXT,
                last_message TEXT,
                event_count INTEGER NOT NULL DEFAULT 0,
                turn_count INTEGER NOT NULL DEFAULT 0,
                workspace_path TEXT,
                workspace_name TEXT,
                latest_revision_id TEXT,
                archived_at TEXT,
                deleted_at TEXT,
                PRIMARY KEY (user_id, conversation_id)
            )
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversations_updated
            ON conversations(user_id, updated_at)
            """
        )
        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_turns (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                turn_ref TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                started_at TEXT,
                completed_at TEXT,
                model_provider TEXT,
                model_id TEXT,
                user_event_id TEXT,
                assistant_event_id TEXT,
                trace_count INTEGER NOT NULL DEFAULT 0,
                tool_call_count INTEGER NOT NULL DEFAULT 0,
                memory_retrieval_status TEXT,
                PRIMARY KEY (user_id, conversation_id, turn_ref)
            )
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_turns_order
            ON conversation_turns(user_id, conversation_id, started_at)
            """
        )
        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_titles (
                user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                title TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'heuristic',
                is_locked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, conversation_id)
            )
            """
        )
        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_titles_updated_at
            ON conversation_titles(updated_at)
            """
        )
        await _create_read_model_views(cursor)
        await conn.commit()


async def _ensure_event_column(
    cursor: Any, table_name: str, column_name: str, column_type: str
) -> None:
    await cursor.execute(f"PRAGMA table_info({table_name})")
    columns = await cursor.fetchall()
    existing = {row[1] for row in columns}
    if column_name not in existing:
        await cursor.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
        )


async def _create_read_model_views(cursor: Any) -> None:
    await cursor.execute(
        f"""
        CREATE VIEW IF NOT EXISTS {CONVERSATION_DISPLAY_MESSAGES_VIEW} AS
        SELECT
            id AS event_id,
            user_id,
            conversation_id,
            message_index,
            timestamp,
            turn_ref,
            revision_id,
            CASE
                WHEN event_type = 'turn_error' THEN 'error'
                WHEN role IS NOT NULL AND role != '' THEN role
                WHEN event_type = 'user_message' THEN 'user'
                WHEN event_type = 'assistant_message' THEN 'assistant'
                ELSE event_type
            END AS display_role,
            role AS source_role,
            event_type,
            content,
            metadata,
            attachments,
            producer,
            producer_event_id,
            producer_sequence
        FROM {CONVERSATION_EVENTS_TABLE}
        WHERE event_type IN ('user_message', 'assistant_message', 'turn_error')
          AND conversation_id IS NOT NULL
          AND content IS NOT NULL
          AND content != ''
        """
    )


async def _rebuild_materialized_conversation_indexes(cursor: Any) -> None:
    await cursor.execute(f"DELETE FROM {CONVERSATIONS_TABLE}")
    await cursor.execute(f"DELETE FROM {CONVERSATION_TURNS_TABLE}")
    await cursor.execute(
        f"""
        INSERT INTO {CONVERSATIONS_TABLE}
        (user_id, conversation_id, status, title, created_at, updated_at,
         last_message, event_count, turn_count, workspace_path, workspace_name,
         latest_revision_id, archived_at, deleted_at)
        SELECT e.user_id,
               e.conversation_id,
               'active',
               (
                 SELECT title
                 FROM {CONVERSATION_TITLES_TABLE} t
                 WHERE t.user_id = e.user_id
                   AND t.conversation_id = e.conversation_id
                   AND t.title IS NOT NULL
                   AND t.title != ''
                 ORDER BY t.is_locked DESC, t.updated_at DESC
                 LIMIT 1
               ),
               MIN(e.timestamp),
               MAX(e.timestamp),
               (
                 SELECT e2.content
                 FROM {CONVERSATION_EVENTS_TABLE} e2
                 WHERE e2.user_id = e.user_id
                   AND e2.conversation_id = e.conversation_id
                   AND e2.content IS NOT NULL
                   AND e2.content != ''
                   AND e2.content NOT LIKE '[sdk event:%'
                 ORDER BY e2.message_index DESC, e2.timestamp DESC
                 LIMIT 1
               ),
               COUNT(*),
               COUNT(DISTINCT e.turn_ref),
               (
                 SELECT e2.workspace_path
                 FROM {CONVERSATION_EVENTS_TABLE} e2
                 WHERE e2.user_id = e.user_id
                   AND e2.conversation_id = e.conversation_id
                   AND e2.workspace_path IS NOT NULL
                   AND e2.workspace_path != ''
                 ORDER BY e2.message_index DESC, e2.timestamp DESC
                 LIMIT 1
               ),
               (
                 SELECT e2.workspace_name
                 FROM {CONVERSATION_EVENTS_TABLE} e2
                 WHERE e2.user_id = e.user_id
                   AND e2.conversation_id = e.conversation_id
                   AND e2.workspace_name IS NOT NULL
                   AND e2.workspace_name != ''
                 ORDER BY e2.message_index DESC, e2.timestamp DESC
                 LIMIT 1
               ),
               COALESCE(
                 (
                   SELECT r.revision_id
                   FROM {CONVERSATION_REVISIONS_TABLE} r
                   WHERE r.user_id = e.user_id
                     AND r.conversation_id = e.conversation_id
                   ORDER BY r.active DESC, r.updated_at DESC, r.revision_id DESC
                   LIMIT 1
                 ),
                 (
                   SELECT e2.revision_id
                   FROM {CONVERSATION_EVENTS_TABLE} e2
                   WHERE e2.user_id = e.user_id
                     AND e2.conversation_id = e.conversation_id
                   ORDER BY e2.message_index DESC, e2.timestamp DESC
                   LIMIT 1
                 )
               ),
               NULL,
               NULL
        FROM {CONVERSATION_EVENTS_TABLE} e
        WHERE e.conversation_id IS NOT NULL
        GROUP BY e.user_id, e.conversation_id
        """
    )
    await cursor.execute(
        f"""
        INSERT INTO {CONVERSATION_TURNS_TABLE}
        (user_id, conversation_id, turn_ref, status, started_at, completed_at,
         model_provider, model_id, user_event_id, assistant_event_id,
         trace_count, tool_call_count, memory_retrieval_status)
        SELECT e.user_id,
               e.conversation_id,
               e.turn_ref,
               CASE
                 WHEN SUM(CASE WHEN e.event_type = 'turn_error' THEN 1 ELSE 0 END) > 0
                   THEN 'failed'
                 WHEN SUM(CASE WHEN e.event_type = 'turn_completed' THEN 1 ELSE 0 END) > 0
                   THEN 'completed'
                 ELSE 'open'
               END,
               MIN(e.timestamp),
               MAX(CASE WHEN e.event_type IN ('turn_completed', 'turn_error', 'turn_stopped') THEN e.timestamp ELSE NULL END),
               NULL,
               NULL,
               MIN(CASE WHEN e.event_type = 'user_message' THEN e.id ELSE NULL END),
               MAX(CASE WHEN e.event_type = 'assistant_message' THEN e.id ELSE NULL END),
               SUM(CASE WHEN e.event_type = 'trace_event' THEN 1 ELSE 0 END),
               SUM(CASE WHEN e.event_type = 'tool_call' THEN 1 ELSE 0 END),
               MAX(CASE
                 WHEN e.event_type = 'trace_event'
                   AND json_valid(e.event_payload)
                   AND json_extract(e.event_payload, '$.payload.path') = 'memory.retrieval'
                 THEN json_extract(e.event_payload, '$.payload.status')
                 ELSE NULL
               END)
        FROM {CONVERSATION_EVENTS_TABLE} e
        WHERE e.conversation_id IS NOT NULL
          AND e.turn_ref IS NOT NULL
        GROUP BY e.user_id, e.conversation_id, e.turn_ref
        """
    )


async def _refresh_conversation_indexes(
    conn: Any,
    *,
    user_id: str,
    conversation_id: Optional[str],
) -> None:
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        return
    cursor = await conn.cursor()
    await cursor.execute(
        f"DELETE FROM {CONVERSATIONS_TABLE} WHERE user_id = ? AND conversation_id = ?",
        (user_id, conversation_id),
    )
    await cursor.execute(
        f"DELETE FROM {CONVERSATION_TURNS_TABLE} WHERE user_id = ? AND conversation_id = ?",
        (user_id, conversation_id),
    )
    await cursor.execute(
        f"""
        INSERT INTO {CONVERSATIONS_TABLE}
        (user_id, conversation_id, status, title, created_at, updated_at,
         last_message, event_count, turn_count, workspace_path, workspace_name,
         latest_revision_id, archived_at, deleted_at)
        SELECT e.user_id,
               e.conversation_id,
               'active',
               (
                 SELECT title
                 FROM {CONVERSATION_TITLES_TABLE} t
                 WHERE t.user_id = e.user_id
                   AND t.conversation_id = e.conversation_id
                   AND t.title IS NOT NULL
                   AND t.title != ''
                 ORDER BY t.is_locked DESC, t.updated_at DESC
                 LIMIT 1
               ),
               MIN(e.timestamp),
               MAX(e.timestamp),
               (
                 SELECT e2.content
                 FROM {CONVERSATION_EVENTS_TABLE} e2
                 WHERE e2.user_id = e.user_id
                   AND e2.conversation_id = e.conversation_id
                   AND e2.content IS NOT NULL
                   AND e2.content != ''
                   AND e2.content NOT LIKE '[sdk event:%'
                 ORDER BY e2.message_index DESC, e2.timestamp DESC
                 LIMIT 1
               ),
               COUNT(*),
               COUNT(DISTINCT e.turn_ref),
               (
                 SELECT e2.workspace_path
                 FROM {CONVERSATION_EVENTS_TABLE} e2
                 WHERE e2.user_id = e.user_id
                   AND e2.conversation_id = e.conversation_id
                   AND e2.workspace_path IS NOT NULL
                   AND e2.workspace_path != ''
                 ORDER BY e2.message_index DESC, e2.timestamp DESC
                 LIMIT 1
               ),
               (
                 SELECT e2.workspace_name
                 FROM {CONVERSATION_EVENTS_TABLE} e2
                 WHERE e2.user_id = e.user_id
                   AND e2.conversation_id = e.conversation_id
                   AND e2.workspace_name IS NOT NULL
                   AND e2.workspace_name != ''
                 ORDER BY e2.message_index DESC, e2.timestamp DESC
                 LIMIT 1
               ),
               COALESCE(
                 (
                   SELECT r.revision_id
                   FROM {CONVERSATION_REVISIONS_TABLE} r
                   WHERE r.user_id = e.user_id
                     AND r.conversation_id = e.conversation_id
                   LIMIT 1
                 ),
                 (
                   SELECT e2.revision_id
                   FROM {CONVERSATION_EVENTS_TABLE} e2
                   WHERE e2.user_id = e.user_id
                     AND e2.conversation_id = e.conversation_id
                   ORDER BY e2.message_index DESC, e2.timestamp DESC
                   LIMIT 1
                 )
               ),
               NULL,
               NULL
        FROM {CONVERSATION_EVENTS_TABLE} e
        WHERE e.user_id = ?
          AND e.conversation_id = ?
        GROUP BY e.user_id, e.conversation_id
        """,
        (user_id, conversation_id),
    )
    await cursor.execute(
        f"""
        INSERT INTO {CONVERSATION_TURNS_TABLE}
        (user_id, conversation_id, turn_ref, status, started_at, completed_at,
         model_provider, model_id, user_event_id, assistant_event_id,
         trace_count, tool_call_count, memory_retrieval_status)
        SELECT e.user_id,
               e.conversation_id,
               e.turn_ref,
               CASE
                 WHEN SUM(CASE WHEN e.event_type = 'turn_error' THEN 1 ELSE 0 END) > 0
                   THEN 'failed'
                 WHEN SUM(CASE WHEN e.event_type = 'turn_completed' THEN 1 ELSE 0 END) > 0
                   THEN 'completed'
                 ELSE 'open'
               END,
               MIN(e.timestamp),
               MAX(CASE WHEN e.event_type IN ('turn_completed', 'turn_error', 'turn_stopped') THEN e.timestamp ELSE NULL END),
               NULL,
               NULL,
               MIN(CASE WHEN e.event_type = 'user_message' THEN e.id ELSE NULL END),
               MAX(CASE WHEN e.event_type = 'assistant_message' THEN e.id ELSE NULL END),
               SUM(CASE WHEN e.event_type = 'trace_event' THEN 1 ELSE 0 END),
               SUM(CASE WHEN e.event_type = 'tool_call' THEN 1 ELSE 0 END),
               MAX(CASE
                 WHEN e.event_type = 'trace_event'
                   AND json_valid(e.event_payload)
                   AND json_extract(e.event_payload, '$.payload.path') = 'memory.retrieval'
                 THEN json_extract(e.event_payload, '$.payload.status')
                 ELSE NULL
               END)
        FROM {CONVERSATION_EVENTS_TABLE} e
        WHERE e.user_id = ?
          AND e.conversation_id = ?
          AND e.turn_ref IS NOT NULL
        GROUP BY e.user_id, e.conversation_id, e.turn_ref
        """,
        (user_id, conversation_id),
    )


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
            FROM {CONVERSATION_EVENTS_TABLE}
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
    producer: Optional[str] = None,
    producer_event_id: Optional[str] = None,
    producer_sequence: Optional[int] = None,
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
    event_id = str(
        event_payload.get("eventId") or event_payload.get("event_id") or uuid.uuid4()
    )
    normalized_producer = _normalize_producer(producer)
    normalized_producer_event_id = (
        producer_event_id
        if isinstance(producer_event_id, str) and producer_event_id.strip()
        else (event_id if normalized_producer == "backend" else None)
    )
    normalized_producer_sequence = _normalize_producer_sequence(producer_sequence)

    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            f"""
            INSERT OR REPLACE INTO {CONVERSATION_EVENTS_TABLE}
            (id, user_id, conversation_id, event_type, role, content, timestamp,
             message_index, revision_id, turn_ref, tool_name, correlation_id,
             workspace_path, workspace_name, producer, producer_event_id,
             producer_sequence, metadata, attachments, event_payload,
             compaction_checkpoint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                normalized_producer,
                normalized_producer_event_id,
                normalized_producer_sequence,
                _json_dumps(metadata),
                _json_dumps_value(attachments if isinstance(attachments, list) else []),
                _json_dumps(event_payload) or "{}",
                _json_dumps(compaction_checkpoint),
            ),
        )
        if isinstance(conversation_id, str) and conversation_id.strip() and revision_id:
            await _upsert_revision_node(
                conn,
                user_id=user_id,
                conversation_id=conversation_id,
                revision_id=revision_id,
                updated_at=normalized_timestamp,
                operation="send",
                active=True,
            )
        await _refresh_conversation_indexes(
            conn, user_id=user_id, conversation_id=conversation_id
        )
        await conn.commit()

    return {
        "event_id": event_id,
        "message_index": normalized_index,
        "producer": normalized_producer,
        "producer_event_id": normalized_producer_event_id,
        "producer_sequence": normalized_producer_sequence,
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
        "producer": row["producer"],
        "producer_event_id": row["producer_event_id"],
        "producer_sequence": row["producer_sequence"],
        "metadata": metadata,
        "attachments": attachments,
        "event_payload": event_payload,
    }
    if checkpoint:
        result["compaction_checkpoint"] = checkpoint
    return result


async def load_conversation_events(
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
            FROM {CONVERSATION_EVENTS_TABLE}
            WHERE user_id = ? AND {clause}
            {pagination_clause}
            ORDER BY message_index ASC, timestamp ASC
            LIMIT ?
            """,
            (user_id, *params, *pagination_params, max(1, int(limit or 1000))),
        )
        rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def list_conversations(
    *,
    db_path: str,
    user_id: str,
    limit: Optional[int],
) -> List[Dict[str, Any]]:
    metadata_event_placeholders = ", ".join("?" for _ in SIDEBAR_METADATA_EVENT_TYPES)
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            WITH visible_events AS (
                SELECT *
                FROM {CONVERSATION_EVENTS_TABLE}
                WHERE user_id = ?
                  AND conversation_id IS NOT NULL
                  AND event_type IN ({metadata_event_placeholders})
            ),
            active_display_rows AS (
                SELECT *
                FROM {CONVERSATION_DISPLAY_TIMELINE_TABLE}
                WHERE user_id = ?
                  AND conversation_id IS NOT NULL
                  AND active = 1
            ),
            conversation_ids AS (
                SELECT DISTINCT conversation_id
                FROM visible_events
                UNION
                SELECT DISTINCT conversation_id
                FROM active_display_rows
            )
            SELECT c.conversation_id,
                   (
                     SELECT MIN(timestamp) FROM visible_events e
                     WHERE e.conversation_id = c.conversation_id
                   ) as first_timestamp,
                   (
                     SELECT MAX(timestamp) FROM visible_events e
                     WHERE e.conversation_id = c.conversation_id
                   ) as last_timestamp,
                   (
                     SELECT MIN(created_at) FROM active_display_rows d
                     WHERE d.conversation_id = c.conversation_id
                   ) as display_first_timestamp,
                   (
                     SELECT MAX(created_at) FROM active_display_rows d
                     WHERE d.conversation_id = c.conversation_id
                   ) as display_last_timestamp,
                   (
                     SELECT COUNT(*) FROM {CONVERSATION_EVENTS_TABLE} e
                     WHERE e.user_id = ? AND e.conversation_id = c.conversation_id
                   ) as entry_count,
                   (
                     SELECT title FROM {CONVERSATION_TITLES_TABLE} t
                     WHERE t.user_id = ?
                       AND t.conversation_id = c.conversation_id
                       AND t.title IS NOT NULL
                       AND t.title != ''
                     ORDER BY t.is_locked DESC, t.updated_at DESC
                     LIMIT 1
                   ) as stored_title,
                   (
                     SELECT content FROM visible_events e2
                     WHERE e2.conversation_id = c.conversation_id
                       AND e2.role = 'user'
                       AND e2.content IS NOT NULL
                       AND e2.content != ''
                     ORDER BY e2.message_index ASC, e2.timestamp ASC
                     LIMIT 1
                   ) as first_user_content,
                   (
                     SELECT content FROM active_display_rows d
                     WHERE d.conversation_id = c.conversation_id
                       AND d.role = 'user'
                       AND d.content IS NOT NULL
                       AND d.content != ''
                     ORDER BY d.row_index ASC
                     LIMIT 1
                   ) as display_first_user_content,
                   (
                     SELECT content FROM visible_events e2
                     WHERE e2.conversation_id = c.conversation_id
                       AND e2.content IS NOT NULL
                       AND e2.content != ''
                       AND e2.content NOT LIKE '[sdk event:%'
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as last_content,
                   (
                     SELECT content FROM active_display_rows d
                     WHERE d.conversation_id = c.conversation_id
                       AND d.content IS NOT NULL
                       AND d.content != ''
                     ORDER BY d.row_index DESC
                     LIMIT 1
                   ) as display_last_content,
                   (
                     SELECT revision_id FROM {CONVERSATION_REVISIONS_TABLE} r
                     WHERE r.user_id = ?
                       AND r.conversation_id = c.conversation_id
                     ORDER BY r.active DESC, r.updated_at DESC, r.revision_id DESC
                     LIMIT 1
                   ) as stored_revision_id,
                   (
                     SELECT updated_at FROM {CONVERSATION_REVISIONS_TABLE} r
                     WHERE r.user_id = ?
                       AND r.conversation_id = c.conversation_id
                     ORDER BY r.active DESC, r.updated_at DESC, r.revision_id DESC
                     LIMIT 1
                   ) as revision_updated_at,
                   (
                     SELECT revision_id FROM {CONVERSATION_EVENTS_TABLE} e2
                     WHERE e2.user_id = ?
                       AND e2.conversation_id = c.conversation_id
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as event_revision_id,
                   (
                     SELECT workspace_path FROM visible_events e2
                     WHERE e2.conversation_id = c.conversation_id
                       AND e2.workspace_path IS NOT NULL
                       AND e2.workspace_path != ''
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as workspace_path,
                   (
                     SELECT workspace_name FROM visible_events e2
                     WHERE e2.conversation_id = c.conversation_id
                       AND e2.workspace_name IS NOT NULL
                       AND e2.workspace_name != ''
                     ORDER BY e2.message_index DESC, e2.timestamp DESC
                     LIMIT 1
                   ) as workspace_name
            FROM conversation_ids c
            ORDER BY CASE
              WHEN display_last_timestamp IS NOT NULL
                AND (last_timestamp IS NULL OR display_last_timestamp >= last_timestamp)
              THEN display_last_timestamp
              ELSE COALESCE(last_timestamp, revision_updated_at)
            END DESC
            LIMIT ?
            """,
            (
                user_id,
                *SIDEBAR_METADATA_EVENT_TYPES,
                user_id,
                user_id,
                user_id,
                user_id,
                user_id,
                user_id,
                _normalize_sql_limit(limit),
            ),
        )
        rows = await cursor.fetchall()

    results: List[Dict[str, Any]] = []
    for row in rows:
        conversation_id = row["conversation_id"]
        if not isinstance(conversation_id, str) or not conversation_id.strip():
            continue
        display_first_user_content = _display_content_to_sidebar_text(
            row["display_first_user_content"]
        )
        display_last_content = _display_content_to_sidebar_text(
            row["display_last_content"]
        )
        display_last_timestamp = row["display_last_timestamp"]
        event_last_timestamp = row["last_timestamp"]
        display_last_is_current = bool(display_last_timestamp) and (
            not event_last_timestamp
            or str(display_last_timestamp) >= str(event_last_timestamp)
        )
        title = str(
            row["stored_title"]
            or display_first_user_content
            or row["first_user_content"]
            or conversation_id
        ).strip()
        results.append(
            {
                "conversation_id": conversation_id,
                "first_timestamp": row["display_first_timestamp"]
                or row["first_timestamp"]
                or row["revision_updated_at"],
                "last_timestamp": (
                    display_last_timestamp
                    if display_last_is_current
                    else event_last_timestamp
                )
                or row["revision_updated_at"],
                "entry_count": row["entry_count"],
                "record_kind": "chat_event",
                "revision_id": row["stored_revision_id"]
                or row["event_revision_id"]
                or f"rev-stored-{conversation_id}",
                "title": title or conversation_id,
                "last_message": (
                    display_last_content
                    if display_last_is_current and display_last_content
                    else row["last_content"] or display_last_content or ""
                ),
                "workspace_path": row["workspace_path"] or "",
                "workspace_name": row["workspace_name"] or "",
                "is_resumable": True,
            }
        )
    return results


async def get_conversation_revision(
    *,
    db_path: str,
    user_id: str,
    conversation_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        return None
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            SELECT revision_id, parent_revision_id, operation,
                   display_timeline_id, model_history_checkpoint_id,
                   created_at, updated_at, active
            FROM {CONVERSATION_REVISIONS_TABLE}
            WHERE user_id = ? AND conversation_id = ?
            ORDER BY active DESC, updated_at DESC, revision_id DESC
            LIMIT 1
            """,
            (user_id, conversation_id),
        )
        row = await cursor.fetchone()
        if row:
            return {
                "conversation_id": conversation_id,
                "revision_id": row["revision_id"],
                "parent_revision_id": row["parent_revision_id"],
                "operation": row["operation"],
                "display_timeline_id": row["display_timeline_id"],
                "model_history_checkpoint_id": row["model_history_checkpoint_id"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "active": bool(row["active"]),
                "record_kind": "chat_event",
            }
        await cursor.execute(
            f"""
            SELECT revision_id, timestamp
            FROM {CONVERSATION_EVENTS_TABLE}
            WHERE user_id = ? AND conversation_id = ?
            ORDER BY message_index DESC, timestamp DESC
            LIMIT 1
            """,
            (user_id, conversation_id),
        )
        row = await cursor.fetchone()
    if not row:
        return None
    return {
        "conversation_id": conversation_id,
        "revision_id": row["revision_id"] or f"rev-stored-{conversation_id}",
        "updated_at": row["timestamp"]
        or datetime.fromtimestamp(0, timezone.utc).isoformat(),
        "record_kind": "chat_event",
    }


async def search_conversations(
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
            f"""
            SELECT conversation_id, MAX(timestamp) as last_timestamp, COUNT(*) as hit_count
            FROM {CONVERSATION_EVENTS_TABLE}
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
    summaries = await list_conversations(
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


async def delete_conversation(
    *,
    db_path: str,
    user_id: str,
    conversation_id: Optional[str],
) -> int:
    clause, params = _conversation_clause(conversation_id)
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await conn.execute("BEGIN")
        try:
            await cursor.execute(
                f"DELETE FROM {CONVERSATION_EVENTS_TABLE} WHERE user_id = ? AND {clause}",
                (user_id, *params),
            )
            deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
            if isinstance(conversation_id, str) and conversation_id.strip():
                await cursor.execute(
                    f"""
                    DELETE FROM {CONVERSATION_REVISIONS_TABLE}
                    WHERE user_id = ? AND conversation_id = ?
                    """,
                    (user_id, conversation_id),
                )
                await cursor.execute(
                    f"""
                    DELETE FROM {CONVERSATIONS_TABLE}
                    WHERE user_id = ? AND conversation_id = ?
                    """,
                    (user_id, conversation_id),
                )
                await cursor.execute(
                    f"""
                    DELETE FROM {CONVERSATION_TURNS_TABLE}
                    WHERE user_id = ? AND conversation_id = ?
                    """,
                    (user_id, conversation_id),
                )
                await cursor.execute(
                    f"""
                    DELETE FROM {CONVERSATION_DISPLAY_TIMELINE_TABLE}
                    WHERE user_id = ? AND conversation_id = ?
                    """,
                    (user_id, conversation_id),
                )
                await cursor.execute(
                    f"""
                    DELETE FROM {CONVERSATION_MODEL_HISTORY_TABLE}
                    WHERE user_id = ? AND conversation_id = ?
                    """,
                    (user_id, conversation_id),
                )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise
    return int(deleted)


def _normalize_display_timeline_row(
    row: Dict[str, Any],
    *,
    fallback_conversation_id: str,
    fallback_revision_id: str,
    fallback_index: int,
) -> Dict[str, Any]:
    row_id = row.get("id") or row.get("row_id") or row.get("rowId")
    role = row.get("role")
    row_type = row.get("type") or row.get("row_type") or row.get("rowType")
    if not isinstance(row_id, str) or not row_id.strip():
        raise ValueError("display timeline rows require id")
    if role not in {"system", "user", "assistant", "tool"}:
        raise ValueError("display timeline rows require role")
    if row_type not in {
        "user_message",
        "assistant_message",
        "tool_progress",
        "tool_call",
        "tool_bundle_call",
        "tool_output",
        "tool_bundle_output",
        "reasoning",
        "error",
    }:
        raise ValueError("display timeline rows require canonical type")
    return {
        "row_id": row_id.strip(),
        "row_index": int(row.get("row_index") or row.get("rowIndex") or fallback_index),
        "conversation_id": (
            row.get("conversation_id")
            or row.get("conversationRef")
            or row.get("conversationId")
            or fallback_conversation_id
        ),
        "revision_id": (
            row.get("revision_id") or row.get("revisionId") or fallback_revision_id
        ),
        "role": role,
        "row_type": row_type,
        "content": row.get("content"),
        "turn_ref": row.get("turn_ref") or row.get("turnRef"),
        "metadata": (
            row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        ),
    }


async def replace_display_timeline(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
    revision_id: str,
    rows: List[Dict[str, Any]],
    created_at: Optional[str] = None,
    reason: Optional[str] = None,
    base_revision_id: Optional[str] = None,
) -> Dict[str, Any]:
    if not conversation_id:
        raise ValueError("conversation_id is required")
    if not revision_id:
        raise ValueError("revision_id is required")
    if not isinstance(rows, list):
        raise ValueError("rows must be a list")
    normalized_created_at = _normalize_timestamp(created_at)
    normalized_rows = [
        _normalize_display_timeline_row(
            row,
            fallback_conversation_id=conversation_id,
            fallback_revision_id=revision_id,
            fallback_index=index,
        )
        for index, row in enumerate(rows)
    ]
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await conn.execute("BEGIN")
        try:
            await cursor.execute(
                f"""
                UPDATE {CONVERSATION_DISPLAY_TIMELINE_TABLE}
                SET active = 0
                WHERE user_id = ? AND conversation_id = ?
                """,
                (user_id, conversation_id),
            )
            await cursor.execute(
                f"""
                DELETE FROM {CONVERSATION_DISPLAY_TIMELINE_TABLE}
                WHERE user_id = ? AND conversation_id = ? AND revision_id = ?
                """,
                (user_id, conversation_id, revision_id),
            )
            for row in normalized_rows:
                await conn.execute(
                    f"""
                    INSERT INTO {CONVERSATION_DISPLAY_TIMELINE_TABLE}
                    (user_id, conversation_id, revision_id, row_index, row_id,
                     role, row_type, content, turn_ref, metadata, reason,
                     base_revision_id, created_at, active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        user_id,
                        conversation_id,
                        revision_id,
                        row["row_index"],
                        row["row_id"],
                        row["role"],
                        row["row_type"],
                        _json_dumps_value(row["content"]),
                        row["turn_ref"],
                        _json_dumps(row["metadata"]),
                        reason,
                        base_revision_id,
                        normalized_created_at,
                    ),
                )
            await _upsert_revision_node(
                conn,
                user_id=user_id,
                conversation_id=conversation_id,
                revision_id=revision_id,
                updated_at=normalized_created_at,
                operation=_revision_operation_from_display_reason(reason),
                parent_revision_id=base_revision_id,
                display_timeline_id=revision_id,
                active=True,
            )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise
    return {
        "revision_id": revision_id,
        "row_count": len(normalized_rows),
        "created_at": normalized_created_at,
    }


async def load_display_timeline(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
    revision_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not conversation_id:
        raise ValueError("conversation_id is required")
    if revision_id:
        revision_clause = "AND revision_id = ?"
        revision_params: Tuple[Any, ...] = (revision_id,)
        active_clause = ""
    else:
        revision_clause = ""
        revision_params = ()
        active_clause = "AND active = 1"
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            SELECT revision_id, created_at, reason, base_revision_id
            FROM {CONVERSATION_DISPLAY_TIMELINE_TABLE}
            WHERE user_id = ? AND conversation_id = ?
            {active_clause}
            {revision_clause}
            ORDER BY created_at DESC, revision_id DESC
            LIMIT 1
            """,
            (user_id, conversation_id, *revision_params),
        )
        checkpoint = await cursor.fetchone()
        if checkpoint is None:
            return None
        await cursor.execute(
            f"""
            SELECT row_id, row_index, role, row_type, content, turn_ref, metadata
            FROM {CONVERSATION_DISPLAY_TIMELINE_TABLE}
            WHERE user_id = ? AND conversation_id = ? AND revision_id = ?
            ORDER BY row_index ASC
            """,
            (user_id, conversation_id, checkpoint["revision_id"]),
        )
        rows = await cursor.fetchall()
    return {
        "conversation_id": conversation_id,
        "revision_id": checkpoint["revision_id"],
        "created_at": checkpoint["created_at"],
        "reason": checkpoint["reason"],
        "base_revision_id": checkpoint["base_revision_id"],
        "rows": [
            {
                "id": row["row_id"],
                "conversation_id": conversation_id,
                "revision_id": checkpoint["revision_id"],
                "index": row["row_index"],
                "role": row["role"],
                "type": row["row_type"],
                "content": json.loads(row["content"]) if row["content"] else None,
                "turn_ref": row["turn_ref"],
                "metadata": _json_loads(row["metadata"]),
            }
            for row in rows
        ],
    }


def _normalize_model_history_row(
    row: Dict[str, Any],
    *,
    fallback_conversation_id: str,
    fallback_revision_id: str,
    fallback_index: int,
) -> Dict[str, Any]:
    row_id = row.get("id") or row.get("row_id") or row.get("rowId")
    role = row.get("role")
    message_type = row.get("message_type") or row.get("messageType")
    if not isinstance(row_id, str) or not row_id.strip():
        raise ValueError("model history rows require id")
    if role not in {"system", "user", "assistant", "tool"}:
        raise ValueError("model history rows require provider-neutral role")
    if message_type not in {
        "user_query",
        "assistant_response",
        "tool_output",
        "context_compaction",
    }:
        raise ValueError("model history rows require canonical message_type")
    return {
        "row_id": row_id.strip(),
        "row_index": int(row.get("row_index") or row.get("rowIndex") or fallback_index),
        "conversation_id": (
            row.get("conversation_id")
            or row.get("conversationRef")
            or row.get("conversationId")
            or fallback_conversation_id
        ),
        "revision_id": (
            row.get("revision_id") or row.get("revisionId") or fallback_revision_id
        ),
        "role": role,
        "message_type": message_type,
        "content": row.get("content"),
        "tool_call_id": row.get("tool_call_id") or row.get("toolCallId"),
        "tool_calls": row.get("tool_calls") or row.get("toolCalls"),
        "tool_name": row.get("tool_name") or row.get("toolName"),
        "image_refs": row.get("image_refs") or row.get("imageRefs"),
        "compaction_facts": row.get("compaction_facts") or row.get("compactionFacts"),
        "source_display_row_ids": (
            row.get("source_display_row_ids") or row.get("sourceDisplayRowIds") or []
        ),
    }


async def replace_model_history_checkpoint(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
    revision_id: str,
    checkpoint_id: str,
    rows: List[Dict[str, Any]],
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    if not conversation_id:
        raise ValueError("conversation_id is required")
    if not revision_id:
        raise ValueError("revision_id is required")
    if not checkpoint_id:
        raise ValueError("checkpoint_id is required")
    normalized_created_at = _normalize_timestamp(created_at)
    normalized_rows = [
        _normalize_model_history_row(
            row,
            fallback_conversation_id=conversation_id,
            fallback_revision_id=revision_id,
            fallback_index=index,
        )
        for index, row in enumerate(rows, start=1)
    ]
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await conn.execute("BEGIN")
        try:
            await cursor.execute(
                f"""
                UPDATE {CONVERSATION_MODEL_HISTORY_TABLE}
                SET active = 0
                WHERE user_id = ? AND conversation_id = ? AND revision_id = ?
                """,
                (user_id, conversation_id, revision_id),
            )
            await cursor.execute(
                f"""
                DELETE FROM {CONVERSATION_MODEL_HISTORY_TABLE}
                WHERE user_id = ? AND conversation_id = ? AND checkpoint_id = ?
                """,
                (user_id, conversation_id, checkpoint_id),
            )
            for row in normalized_rows:
                await conn.execute(
                    f"""
                    INSERT INTO {CONVERSATION_MODEL_HISTORY_TABLE}
                    (user_id, conversation_id, revision_id, checkpoint_id,
                     row_index, row_id, role, message_type, content, tool_call_id,
                     tool_calls, tool_name, image_refs, compaction_facts,
                     source_display_row_ids, created_at, active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        user_id,
                        conversation_id,
                        revision_id,
                        checkpoint_id,
                        row["row_index"],
                        row["row_id"],
                        row["role"],
                        row["message_type"],
                        _json_dumps_value(row["content"]),
                        row["tool_call_id"],
                        _json_dumps_value(row["tool_calls"]),
                        row["tool_name"],
                        _json_dumps_value(row["image_refs"]),
                        _json_dumps(row["compaction_facts"]),
                        _json_dumps_value(row["source_display_row_ids"]),
                        normalized_created_at,
                    ),
                )
            await _upsert_revision_node(
                conn,
                user_id=user_id,
                conversation_id=conversation_id,
                revision_id=revision_id,
                updated_at=normalized_created_at,
                operation=_revision_operation_from_model_history_rows(normalized_rows),
                model_history_checkpoint_id=checkpoint_id,
                active=True,
            )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise
    return {
        "checkpoint_id": checkpoint_id,
        "revision_id": revision_id,
        "row_count": len(normalized_rows),
        "created_at": normalized_created_at,
    }


async def load_model_history_checkpoint(
    *,
    db_path: str,
    user_id: str,
    conversation_id: str,
    revision_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not conversation_id:
        raise ValueError("conversation_id is required")
    revision_clause = "AND revision_id = ?" if revision_id else ""
    revision_params: Tuple[Any, ...] = (revision_id,) if revision_id else ()
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            SELECT checkpoint_id, revision_id, created_at
            FROM {CONVERSATION_MODEL_HISTORY_TABLE}
            WHERE user_id = ? AND conversation_id = ? AND active = 1
            {revision_clause}
            ORDER BY created_at DESC, checkpoint_id DESC
            LIMIT 1
            """,
            (user_id, conversation_id, *revision_params),
        )
        checkpoint = await cursor.fetchone()
        if checkpoint is None:
            return None
        await cursor.execute(
            f"""
            SELECT row_id, role, message_type, content, tool_call_id, tool_calls,
                   tool_name, image_refs, compaction_facts, source_display_row_ids
            FROM {CONVERSATION_MODEL_HISTORY_TABLE}
            WHERE user_id = ? AND conversation_id = ? AND checkpoint_id = ?
            ORDER BY row_index ASC
            """,
            (user_id, conversation_id, checkpoint["checkpoint_id"]),
        )
        rows = await cursor.fetchall()
    return {
        "checkpoint_id": checkpoint["checkpoint_id"],
        "conversation_id": conversation_id,
        "revision_id": checkpoint["revision_id"],
        "created_at": checkpoint["created_at"],
        "rows": [
            {
                "id": row["row_id"],
                "conversation_id": conversation_id,
                "revision_id": checkpoint["revision_id"],
                "role": row["role"],
                "message_type": row["message_type"],
                "content": json.loads(row["content"]) if row["content"] else None,
                "tool_call_id": row["tool_call_id"],
                "tool_calls": _json_loads_list(row["tool_calls"]),
                "tool_name": row["tool_name"],
                "image_refs": _json_loads_list(row["image_refs"]),
                "compaction_facts": _json_loads(row["compaction_facts"]),
                "source_display_row_ids": _json_loads_list(
                    row["source_display_row_ids"]
                ),
            }
            for row in rows
        ],
    }


async def clear_chat_events(*, db_path: str, user_id: str) -> int:
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await conn.execute("BEGIN")
        try:
            await cursor.execute(
                f"DELETE FROM {CONVERSATION_EVENTS_TABLE} WHERE user_id = ?", (user_id,)
            )
            deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
            await cursor.execute(
                f"DELETE FROM {CONVERSATION_REVISIONS_TABLE} WHERE user_id = ?",
                (user_id,),
            )
            await cursor.execute(
                f"DELETE FROM {CONVERSATION_MODEL_HISTORY_TABLE} WHERE user_id = ?",
                (user_id,),
            )
            await cursor.execute(
                f"DELETE FROM {CONVERSATION_TURNS_TABLE} WHERE user_id = ?",
                (user_id,),
            )
            await cursor.execute(
                f"DELETE FROM {CONVERSATIONS_TABLE} WHERE user_id = ?",
                (user_id,),
            )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise
    return int(deleted)
