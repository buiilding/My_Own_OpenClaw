"""
SQLite schema and mapping helpers for local memory storage.
"""

import logging
from typing import Dict, Tuple

logger = logging.getLogger(__name__)


async def init_episodic_schema(db_path: str) -> None:
    import aiosqlite

    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()

        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                metadata TEXT,
                embedding_id INTEGER,
                created_at REAL DEFAULT (strftime('%s', 'now')),
                is_semanticized INTEGER DEFAULT 0,
                conversation_id TEXT
            )
        """
        )

        # Add is_semanticized column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT is_semanticized FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN is_semanticized INTEGER DEFAULT 0"
                )
                await conn.commit()
                logger.info("Added is_semanticized column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add is_semanticized column: %s", exc
                )

        # Add conversation_id column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT conversation_id FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN conversation_id TEXT"
                )
                await conn.commit()
                logger.info("Added conversation_id column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add conversation_id column: %s", exc
                )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_id
            ON memories(user_id)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_timestamp
            ON memories(timestamp)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_embedding_id
            ON memories(embedding_id)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_is_semanticized
            ON memories(is_semanticized)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_id
            ON memories(conversation_id)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_semanticized
            ON memories(conversation_id, is_semanticized)
        """
        )

        await conn.commit()


async def init_semantic_schema(db_path: str) -> None:
    import aiosqlite

    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()

        await cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                metadata TEXT,
                embedding_id INTEGER,
                created_at REAL DEFAULT (strftime('%s', 'now'))
            )
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_id
            ON memories(user_id)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_timestamp
            ON memories(timestamp)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_embedding_id
            ON memories(embedding_id)
        """
        )

        await conn.commit()


async def load_vector_mappings(
    db_path: str,
) -> Tuple[Dict[int, str], Dict[str, int], int]:
    import aiosqlite

    vector_id_to_memory_id: Dict[int, str] = {}
    memory_id_to_vector_id: Dict[str, int] = {}
    next_vector_id = 0

    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            SELECT id, embedding_id FROM memories
            WHERE embedding_id IS NOT NULL
        """
        )

        rows = await cursor.fetchall()
        for memory_id, vector_id in rows:
            vector_id_to_memory_id[vector_id] = memory_id
            memory_id_to_vector_id[memory_id] = vector_id
            if vector_id >= next_vector_id:
                next_vector_id = vector_id + 1

    return vector_id_to_memory_id, memory_id_to_vector_id, next_vector_id
