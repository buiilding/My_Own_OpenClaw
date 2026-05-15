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
    CONVERSATION_EVENT_RECORD_KIND,
    INTERACTION_RECORD_KIND,
    TRANSCRIPT_RECORD_KIND,
    TRANSCRIPT_REPLAY_RECORD_KIND,
)

logger = logging.getLogger(__name__)


async def _rebuild_and_sync_index(store: "LocalMemoryStore", memory_type: str) -> None:
    """
    Rebuild an index from current DB rows, then backfill any embeddable NULL rows.

    Bulk delete flows use this to drop stale vectors while preserving surviving rows.
    """
    await store._rebuild_index(memory_type)
    (
        db_path,
        index,
        vector_id_to_memory_id,
        memory_id_to_vector_id,
        next_vector_id,
    ) = store._get_memory_state(memory_type)
    updated_next_vector_id, embedded_count = await store._sync_vector_mappings_for_db(
        memory_type=memory_type,
        db_path=db_path,
        index=index,
        vector_id_to_memory_id=vector_id_to_memory_id,
        memory_id_to_vector_id=memory_id_to_vector_id,
        next_vector_id=next_vector_id,
    )
    store._set_next_vector_id(memory_type, updated_next_vector_id)
    if embedded_count > 0:
        await store._save_faiss_indices()
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
        episodic_deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        await conn.commit()

    async with aiosqlite.connect(store.semantic_db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "DELETE FROM memories WHERE user_id = ?",
            (user_id,),
        )
        semantic_deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        await conn.commit()

    await store._watermark_store.update(last_semanticized_id=None, pending_message_count=0)
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
    """Clear transcript chat history and conversation titles while preserving memory rows."""
    await store._cancel_title_generation_tasks()

    transcript_deleted = 0
    conversation_titles_deleted = 0

    async with aiosqlite.connect(store.episodic_db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            DELETE FROM memories
            WHERE user_id = ? AND record_kind IN (?, ?, ?)
            """,
            (
                user_id,
                TRANSCRIPT_RECORD_KIND,
                TRANSCRIPT_REPLAY_RECORD_KIND,
                CONVERSATION_EVENT_RECORD_KIND,
            ),
        )
        transcript_deleted = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        await cursor.execute(
            "DELETE FROM conversation_titles WHERE user_id = ?",
            (user_id,),
        )
        conversation_titles_deleted = (
            cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        )
        await conn.commit()

    await _rebuild_and_sync_index(store, "episodic")

    logger.info(
        "Cleared chat history for user_id=%s (transcripts=%s titles=%s)",
        user_id,
        transcript_deleted,
        conversation_titles_deleted,
    )
    return {
        "deleted_count": int(transcript_deleted),
        "deleted_title_count": int(conversation_titles_deleted),
    }
