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
                conversation_id TEXT,
                record_kind TEXT DEFAULT 'memory',
                role TEXT,
                message_index INTEGER,
                message_type TEXT,
                tool_name TEXT,
                correlation_id TEXT,
                model_id TEXT,
                model_provider TEXT
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

        # Add record_kind column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT record_kind FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN record_kind TEXT DEFAULT 'memory'"
                )
                await conn.commit()
                logger.info("Added record_kind column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add record_kind column: %s", exc
                )

        # Add role column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT role FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN role TEXT"
                )
                await conn.commit()
                logger.info("Added role column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add role column: %s", exc
                )

        # Add message_index column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT message_index FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN message_index INTEGER"
                )
                await conn.commit()
                logger.info("Added message_index column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add message_index column: %s", exc
                )

        # Add message_type column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT message_type FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN message_type TEXT"
                )
                await conn.commit()
                logger.info("Added message_type column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add message_type column: %s", exc
                )

        # Add tool_name column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT tool_name FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN tool_name TEXT"
                )
                await conn.commit()
                logger.info("Added tool_name column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add tool_name column: %s", exc
                )

        # Add correlation_id column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT correlation_id FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN correlation_id TEXT"
                )
                await conn.commit()
                logger.info("Added correlation_id column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add correlation_id column: %s", exc
                )

        # Add model_id column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT model_id FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN model_id TEXT"
                )
                await conn.commit()
                logger.info("Added model_id column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add model_id column: %s", exc
                )

        # Add model_provider column if it doesn't exist (migration)
        try:
            await cursor.execute("SELECT model_provider FROM memories LIMIT 1")
        except Exception:
            try:
                await cursor.execute(
                    "ALTER TABLE memories ADD COLUMN model_provider TEXT"
                )
                await conn.commit()
                logger.info("Added model_provider column to episodic memory table")
            except Exception as exc:
                logger.warning(
                    "Failed to add model_provider column: %s", exc
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

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_record_kind
            ON memories(record_kind)
        """
        )

        await cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_message_index
            ON memories(conversation_id, message_index)
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
