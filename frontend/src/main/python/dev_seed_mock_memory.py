#!/usr/bin/env python3
"""Seed deterministic mock chat events plus episodic and semantic memory for demos."""

from __future__ import annotations

import json
import os
import platform
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

APP_NAME = "desktop-assistant"
DEFAULT_USER_ID = "default_user"
MOCK_SOURCE = "mock_seed_dashboard"

MOCK_CONVERSATIONS: List[Dict[str, Any]] = [
    {
        "conversation_id": "conv_mock_cloud_budget",
        "model_provider": "openai",
        "model_id": "gpt-5",
        "messages": [
            {
                "role": "user",
                "message_type": "user",
                "text": "Can you help me cut our startup cloud bill by 30% this quarter?",
                "offset_days": 3,
                "offset_minutes": 6,
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "text": "Yes. Start with rightsizing, reserved instances, and removing idle workloads. I can draft a weekly action plan.",
                "offset_days": 3,
                "offset_minutes": 5,
            },
            {
                "role": "user",
                "message_type": "user",
                "text": "Great. Prioritize high-impact wins for week one.",
                "offset_days": 3,
                "offset_minutes": 4,
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "text": "Week one: identify top expensive services, remove orphaned volumes, and enforce auto-shutdown windows for non-prod.",
                "offset_days": 3,
                "offset_minutes": 3,
            },
        ],
    },
    {
        "conversation_id": "conv_mock_interview_prep",
        "model_provider": "anthropic",
        "model_id": "claude-opus-4-1",
        "messages": [
            {
                "role": "user",
                "message_type": "user",
                "text": "I have a senior frontend interview tomorrow. Build me a 90 minute prep sprint.",
                "offset_days": 2,
                "offset_minutes": 12,
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "text": "Split it into React debugging, state-management design, and one timed coding round with review.",
                "offset_days": 2,
                "offset_minutes": 11,
            },
            {
                "role": "user",
                "message_type": "user",
                "text": "Add common pitfalls I should avoid in answers.",
                "offset_days": 2,
                "offset_minutes": 10,
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "text": "Avoid vague claims, explain tradeoffs clearly, and always mention test strategy plus failure handling.",
                "offset_days": 2,
                "offset_minutes": 9,
            },
        ],
    },
    {
        "conversation_id": "conv_mock_trip_planning",
        "model_provider": "google",
        "model_id": "gemini-2.5-pro",
        "messages": [
            {
                "role": "user",
                "message_type": "user",
                "text": "Plan a 4 day Tokyo food trip with one fancy dinner and mostly budget spots.",
                "offset_days": 1,
                "offset_minutes": 22,
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "text": "I will map neighborhoods by day: Shibuya, Asakusa, Ueno, then Ginza for the premium dinner night.",
                "offset_days": 1,
                "offset_minutes": 21,
            },
            {
                "role": "user",
                "message_type": "user",
                "text": "Keep transit simple and include vegetarian options.",
                "offset_days": 1,
                "offset_minutes": 20,
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "text": "Noted. I will keep each day on one train line when possible and include vegetarian-friendly spots in every area.",
                "offset_days": 1,
                "offset_minutes": 19,
            },
        ],
    },
]

MOCK_EPISODIC_MEMORIES: List[Dict[str, Any]] = [
    {
        "content": "User prefers concise step-by-step checklists over long-form explanations.",
        "category": "preference",
        "offset_days": 4,
        "offset_minutes": 25,
    },
    {
        "content": "User is tracking monthly cloud spend and requested weekly optimization milestones.",
        "category": "project",
        "offset_days": 3,
        "offset_minutes": 2,
    },
    {
        "content": "User wants interview prep with explicit tradeoffs and testing rationale.",
        "category": "workflow",
        "offset_days": 2,
        "offset_minutes": 8,
    },
    {
        "content": "User likes travel plans grouped by neighborhood to reduce transit complexity.",
        "category": "preference",
        "offset_days": 1,
        "offset_minutes": 17,
    },
]

MOCK_SEMANTIC_MEMORIES: List[Dict[str, Any]] = [
    {
        "summary": "User values high-impact optimization plans that can be executed in weekly increments.",
        "facts": [
            "Actively reducing startup cloud bill.",
            "Prefers practical actions ranked by impact.",
            "Likes measurable milestones and progress check-ins.",
        ],
        "category": "planning",
        "offset_days": 2,
        "offset_minutes": 7,
    },
    {
        "summary": "User wants interview coaching focused on clarity, tradeoffs, and testing rigor.",
        "facts": [
            "Preparing for senior frontend interviews.",
            "Asks for concise, structured prep plans.",
            "Requests common pitfalls to avoid.",
        ],
        "category": "career",
        "offset_days": 1,
        "offset_minutes": 14,
    },
    {
        "summary": "User prefers travel itineraries that balance budget and premium experiences.",
        "facts": [
            "Planning a Tokyo food-focused trip.",
            "Wants one premium dinner with mostly budget meals.",
            "Needs vegetarian-friendly options in each area.",
        ],
        "category": "travel",
        "offset_days": 1,
        "offset_minutes": 15,
    },
]


def _memory_dir() -> Path:
    if os.name == "nt":
        appdata = os.getenv("APPDATA")
        if not appdata:
            raise RuntimeError("APPDATA is not set on Windows")
        return Path(appdata) / APP_NAME / "memory"

    home_dir = Path.home()
    if platform.system() == "Darwin":
        return home_dir / "Library" / "Application Support" / APP_NAME / "memory"

    return home_dir / ".config" / APP_NAME / "memory"


def _target_user_ids() -> List[str]:
    candidates = [
        DEFAULT_USER_ID,
        os.getenv("WINDIE_MOCK_USER_ID"),
        os.getenv("WINDIE_USER_ID"),
        os.getenv("USER"),
        os.getenv("USERNAME"),
        os.getenv("LOGNAME"),
    ]
    unique: List[str] = []
    seen = set()
    for value in candidates:
        if not value:
            continue
        user_id = str(value).strip()
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        unique.append(user_id)
    return unique


def _iso_timestamp(offset_days: int = 0, offset_minutes: int = 0) -> str:
    return (
        datetime.now(timezone.utc) - timedelta(days=offset_days, minutes=offset_minutes)
    ).isoformat()


def _ensure_column(
    cursor: sqlite3.Cursor, table: str, column: str, definition: str
) -> None:
    rows = cursor.execute(f"PRAGMA table_info({table})").fetchall()
    existing = {row[1] for row in rows}
    if column not in existing:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _ensure_episodic_schema(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            metadata TEXT,
            embedding_id INTEGER,
            created_at REAL DEFAULT (strftime('%s', 'now')),
            is_semanticized INTEGER DEFAULT 0,
            conversation_id TEXT,
            record_kind TEXT DEFAULT 'memory',
            role TEXT,
            message_index INTEGER,
            message_type TEXT,
            tool_name TEXT,
            correlation_id TEXT,
            model_id TEXT,
            model_provider TEXT,
            screenshot TEXT
        )
        """)
    cursor.execute("""
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
        """)
    cursor.execute("""
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
        """)

    for column, definition in (
        ("is_semanticized", "INTEGER DEFAULT 0"),
        ("conversation_id", "TEXT"),
        ("record_kind", "TEXT DEFAULT 'memory'"),
        ("role", "TEXT"),
        ("message_index", "INTEGER"),
        ("message_type", "TEXT"),
        ("tool_name", "TEXT"),
        ("correlation_id", "TEXT"),
        ("model_id", "TEXT"),
        ("model_provider", "TEXT"),
        ("screenshot", "TEXT"),
    ):
        _ensure_column(cursor, "memories", column, definition)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_id ON memories(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_embedding_id ON memories(embedding_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_is_semanticized ON memories(is_semanticized)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_id ON memories(conversation_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_record_kind ON memories(record_kind)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_message_index ON memories(conversation_id, message_index)"
    )
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_chat_events_conversation_order
        ON chat_events(user_id, conversation_id, message_index, timestamp)
        """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_chat_events_timestamp
        ON chat_events(user_id, timestamp)
        """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_chat_events_type
        ON chat_events(user_id, conversation_id, event_type)
        """)
    conn.commit()


def _ensure_semantic_schema(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            metadata TEXT,
            embedding_id INTEGER,
            created_at REAL DEFAULT (strftime('%s', 'now'))
        )
        """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_id ON memories(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_embedding_id ON memories(embedding_id)"
    )
    conn.commit()


def _clear_existing_mock_data(
    episodic_conn: sqlite3.Connection,
    semantic_conn: sqlite3.Connection,
    user_id: str,
) -> Dict[str, int]:
    episodic_cursor = episodic_conn.cursor()
    semantic_cursor = semantic_conn.cursor()

    chat_deleted = episodic_cursor.execute(
        """
        DELETE FROM chat_events
        WHERE user_id = ?
          AND conversation_id LIKE 'conv_mock_%'
        """,
        (user_id,),
    ).rowcount
    episodic_cursor.execute(
        """
        DELETE FROM conversation_titles
        WHERE user_id = ?
          AND conversation_id LIKE 'conv_mock_%'
        """,
        (user_id,),
    )
    episodic_deleted = episodic_cursor.execute(
        """
        DELETE FROM memories
        WHERE user_id = ?
          AND metadata LIKE ?
        """,
        (user_id, f'%"source": "{MOCK_SOURCE}"%'),
    ).rowcount
    semantic_deleted = semantic_cursor.execute(
        """
        DELETE FROM memories
        WHERE user_id = ?
          AND metadata LIKE ?
        """,
        (user_id, f'%"source": "{MOCK_SOURCE}"%'),
    ).rowcount

    episodic_conn.commit()
    semantic_conn.commit()
    return {
        "chat_event_rows": int(chat_deleted or 0),
        "episodic_rows": int(episodic_deleted or 0),
        "semantic_rows": int(semantic_deleted or 0),
    }


def _message_event_type(message: Dict[str, Any]) -> str:
    if message["role"] == "user":
        return "user_message"
    if message["role"] == "tool" or message["message_type"] == "tool-output":
        return "tool_output"
    if message["message_type"] == "tool-call":
        return "tool_call"
    return "assistant_message"


def _insert_chat_event_rows(conn: sqlite3.Connection, user_id: str) -> int:
    cursor = conn.cursor()
    inserted = 0

    for conversation in MOCK_CONVERSATIONS:
        conversation_id = conversation["conversation_id"]
        revision_id = f"rev-mock-{conversation_id}"
        for index, message in enumerate(conversation["messages"]):
            timestamp = _iso_timestamp(
                offset_days=message.get("offset_days", 0),
                offset_minutes=message.get("offset_minutes", 0),
            )
            event_id = str(uuid.uuid4())
            event_type = _message_event_type(message)
            metadata = {
                "source": MOCK_SOURCE,
                "record_kind": "chat_event",
                "conversation_id": conversation_id,
                "role": message["role"],
                "message_type": message["message_type"],
                "model_id": conversation["model_id"],
                "model_provider": conversation["model_provider"],
            }
            event_payload = {
                "eventId": event_id,
                "type": event_type,
                "conversationRef": conversation_id,
                "revisionId": revision_id,
                "timestamp": timestamp,
                "source": "sdk",
                "payload": {
                    "text": message["text"],
                    "content": message["text"],
                    "role": message["role"],
                    "messageType": message["message_type"],
                },
            }
            cursor.execute(
                """
                INSERT INTO chat_events (
                    id,
                    user_id,
                    conversation_id,
                    event_type,
                    role,
                    content,
                    timestamp,
                    message_index,
                    revision_id,
                    turn_ref,
                    tool_name,
                    correlation_id,
                    workspace_path,
                    workspace_name,
                    metadata,
                    attachments,
                    event_payload,
                    compaction_checkpoint
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    user_id,
                    conversation_id,
                    event_type,
                    message["role"],
                    message["text"],
                    timestamp,
                    index + 1,
                    revision_id,
                    None,
                    None,
                    None,
                    None,
                    None,
                    json.dumps(metadata),
                    json.dumps([]),
                    json.dumps(event_payload),
                    None,
                ),
            )
            inserted += 1

    conn.commit()
    return inserted


def _insert_episodic_rows(conn: sqlite3.Connection, user_id: str) -> int:
    cursor = conn.cursor()
    inserted = 0
    for item in MOCK_EPISODIC_MEMORIES:
        metadata = {
            "type": "episodic",
            "source": MOCK_SOURCE,
            "category": item["category"],
        }
        cursor.execute(
            """
            INSERT INTO memories (
                id,
                user_id,
                content,
                timestamp,
                metadata,
                embedding_id,
                is_semanticized,
                conversation_id,
                record_kind,
                role,
                message_index,
                message_type,
                tool_name,
                correlation_id,
                model_id,
                model_provider,
                screenshot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                user_id,
                item["content"],
                _iso_timestamp(
                    offset_days=item.get("offset_days", 0),
                    offset_minutes=item.get("offset_minutes", 0),
                ),
                json.dumps(metadata),
                None,
                1,
                None,
                "memory",
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
        )
        inserted += 1
    conn.commit()
    return inserted


def _insert_semantic_rows(conn: sqlite3.Connection, user_id: str) -> int:
    cursor = conn.cursor()
    inserted = 0
    for item in MOCK_SEMANTIC_MEMORIES:
        content = "\n".join(
            [
                f"Summary: {item['summary']}",
                "Facts:",
                *[f"- {fact}" for fact in item["facts"]],
            ]
        )
        metadata = {
            "type": "semantic",
            "source": MOCK_SOURCE,
            "category": item["category"],
            "created_by": "dev_seed_mock_memory",
        }
        cursor.execute(
            """
            INSERT INTO memories (
                id,
                user_id,
                content,
                timestamp,
                metadata,
                embedding_id
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                user_id,
                content,
                _iso_timestamp(
                    offset_days=item.get("offset_days", 0),
                    offset_minutes=item.get("offset_minutes", 0),
                ),
                json.dumps(metadata),
                None,
            ),
        )
        inserted += 1
    conn.commit()
    return inserted


def _count_summary(
    episodic_conn: sqlite3.Connection,
    semantic_conn: sqlite3.Connection,
    user_id: str,
) -> Dict[str, int]:
    episodic_cursor = episodic_conn.cursor()
    semantic_cursor = semantic_conn.cursor()

    chat_total = episodic_cursor.execute(
        """
        SELECT COUNT(DISTINCT conversation_id)
        FROM chat_events
        WHERE user_id = ?
          AND conversation_id IS NOT NULL
        """,
        (user_id,),
    ).fetchone()[0]

    chat_mock = episodic_cursor.execute(
        """
        SELECT COUNT(DISTINCT conversation_id)
        FROM chat_events
        WHERE user_id = ?
          AND conversation_id LIKE 'conv_mock_%'
        """,
        (user_id,),
    ).fetchone()[0]

    episodic_total = episodic_cursor.execute(
        """
        SELECT COUNT(*)
        FROM memories
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()[0]

    episodic_mock = episodic_cursor.execute(
        """
        SELECT COUNT(*)
        FROM memories
        WHERE user_id = ?
          AND metadata LIKE ?
        """,
        (user_id, f'%"source": "{MOCK_SOURCE}"%'),
    ).fetchone()[0]

    semantic_total = semantic_cursor.execute(
        "SELECT COUNT(*) FROM memories WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]

    semantic_mock = semantic_cursor.execute(
        "SELECT COUNT(*) FROM memories WHERE user_id = ? AND metadata LIKE ?",
        (user_id, f'%"source": "{MOCK_SOURCE}"%'),
    ).fetchone()[0]

    return {
        "chat_conversations_total": int(chat_total or 0),
        "chat_conversations_mock": int(chat_mock or 0),
        "episodic_memories_total": int(episodic_total or 0),
        "episodic_memories_mock": int(episodic_mock or 0),
        "semantic_memories_total": int(semantic_total or 0),
        "semantic_memories_mock": int(semantic_mock or 0),
    }


def main() -> int:
    memory_dir = _memory_dir()
    memory_dir.mkdir(parents=True, exist_ok=True)

    episodic_db = memory_dir / "episodic.db"
    semantic_db = memory_dir / "semantic.db"

    episodic_conn = sqlite3.connect(str(episodic_db))
    semantic_conn = sqlite3.connect(str(semantic_db))

    try:
        _ensure_episodic_schema(episodic_conn)
        _ensure_semantic_schema(semantic_conn)

        target_user_ids = _target_user_ids()
        aggregate_deleted = {
            "chat_event_rows": 0,
            "episodic_rows": 0,
            "semantic_rows": 0,
        }
        aggregate_inserted = {"chat_events": 0, "episodic": 0, "semantic": 0}
        per_user_summary: Dict[str, Dict[str, int]] = {}

        for user_id in target_user_ids:
            deleted_counts = _clear_existing_mock_data(
                episodic_conn, semantic_conn, user_id
            )
            chat_events_inserted = _insert_chat_event_rows(episodic_conn, user_id)
            episodic_inserted = _insert_episodic_rows(episodic_conn, user_id)
            semantic_inserted = _insert_semantic_rows(semantic_conn, user_id)
            summary = _count_summary(episodic_conn, semantic_conn, user_id)
            per_user_summary[user_id] = summary

            aggregate_deleted["chat_event_rows"] += deleted_counts["chat_event_rows"]
            aggregate_deleted["episodic_rows"] += deleted_counts["episodic_rows"]
            aggregate_deleted["semantic_rows"] += deleted_counts["semantic_rows"]
            aggregate_inserted["chat_events"] += chat_events_inserted
            aggregate_inserted["episodic"] += episodic_inserted
            aggregate_inserted["semantic"] += semantic_inserted

        print("Mock memory seed complete for target users.")
        print(f"Memory dir: {memory_dir}")
        print(f"Target users: {target_user_ids}")
        print(f"Removed rows: {aggregate_deleted}")
        print(
            "Inserted rows: "
            f"chat_events={aggregate_inserted['chat_events']}, "
            f"episodic={aggregate_inserted['episodic']}, "
            f"semantic={aggregate_inserted['semantic']}"
        )
        print(f"Current totals by user: {per_user_summary}")
        return 0
    finally:
        episodic_conn.close()
        semantic_conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
