"""
Bulk local-memory maintenance operations.

These flows are intentionally separate from LocalMemoryStore CRUD/search methods so
destructive admin operations do not keep expanding the main store surface.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Dict

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

if TYPE_CHECKING:
    from memory.local_store import LocalMemoryStore

from memory.record_kinds import (
    INTERACTION_RECORD_KIND,
)
from memory.chat_event_store import init_chat_event_schema

logger = logging.getLogger(__name__)


async def _rebuild_and_sync_index(store: "LocalMemoryStore", memory_type: str) -> None:
    """
    Clear vector mappings after bulk deletes.

    The SDK owns embedding generation, so admin flows cannot rebuild vectors from
    text. Surviving rows remain local data and future SDK-provided embeddings can
    index new writes.
    """
    await store._clear_vector_mappings(memory_type)
    await store._cleanup_index_artifacts_if_empty(memory_type)


async def clear_local_memory(store: "LocalMemoryStore", user_id: str) -> Dict[str, int]:
    """
    Clear user-local episodic interaction memory and semantic memory while preserving chats.
    """
    episodic_deleted = 0
    semantic_deleted = 0

    async with aiosqlite.connect(store.episodic_db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            DELETE FROM memories
            WHERE user_id = ? AND COALESCE(record_kind, '') = ?
            """,
            (user_id, INTERACTION_RECORD_KIND),
        )
        episodic_deleted = (
            cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        )
        await conn.commit()

    async with aiosqlite.connect(store.semantic_db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "DELETE FROM memories WHERE user_id = ?",
            (user_id,),
        )
        semantic_deleted = (
            cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        )
        await conn.commit()

    await store._watermark_store.update(
        last_semanticized_id=None, pending_message_count=0
    )
    await _rebuild_and_sync_index(store, "episodic")
    await _rebuild_and_sync_index(store, "semantic")

    logger.info(
        "Cleared local memory for user_id=%s (episodic=%s semantic=%s)",
        user_id,
        episodic_deleted,
        semantic_deleted,
    )
    return {
        "episodic_deleted_count": int(episodic_deleted),
        "semantic_deleted_count": int(semantic_deleted),
    }


async def clear_chat_history(store: "LocalMemoryStore", user_id: str) -> Dict[str, int]:
    """Clear chat event history and conversation titles while preserving memory rows."""
    chat_events_deleted = 0
    conversation_titles_deleted = 0

    await init_chat_event_schema(store.episodic_db_path)
    async with aiosqlite.connect(store.episodic_db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "DELETE FROM chat_events WHERE user_id = ?",
            (user_id,),
        )
        chat_events_deleted = (
            cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        )
        await cursor.execute(
            "DELETE FROM conversation_titles WHERE user_id = ?",
            (user_id,),
        )
        conversation_titles_deleted = (
            cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        )
        await conn.commit()

    logger.info(
        "Cleared chat history for user_id=%s (chat_events=%s titles=%s)",
        user_id,
        chat_events_deleted,
        conversation_titles_deleted,
    )
    return {
        "deleted_count": int(chat_events_deleted),
        "deleted_title_count": int(conversation_titles_deleted),
    }
