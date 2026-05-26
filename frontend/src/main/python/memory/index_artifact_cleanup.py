"""Helpers for clearing empty FAISS artifacts after memory-row deletion."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import aiosqlite
except ImportError:  # pragma: no cover
    aiosqlite = None

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IndexArtifactCleanupResult:
    empty_index: Optional[Any]


async def count_indexed_memory_rows(db_path: str) -> int:
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "SELECT COUNT(*) FROM memories WHERE embedding_id IS NOT NULL"
        )
        row = await cursor.fetchone()
        return int(row[0]) if row and row[0] is not None else 0


def unlink_index_file(index_path: Path) -> None:
    try:
        index_path.unlink(missing_ok=True)
    except TypeError:
        if index_path.exists():
            index_path.unlink()


async def cleanup_index_artifacts_if_empty(
    *,
    memory_type: str,
    db_path: str,
    index_path: Path,
    embedding_dimension: int,
    faiss_module: Optional[Any],
    vector_id_to_memory_id: Dict[int, str],
    memory_id_to_vector_id: Dict[str, int],
) -> Optional[IndexArtifactCleanupResult]:
    """
    Return a fresh empty index when a memory DB has no indexed rows left.

    The caller owns assigning the returned index and resetting its next vector id.
    Returning ``None`` means indexed rows remain or cleanup could not determine
    whether artifacts are safe to clear.
    """
    try:
        indexed_rows = await count_indexed_memory_rows(db_path)
    except Exception as exc:
        logger.warning(
            "Failed to check remaining indexed rows for %s cleanup: %s",
            memory_type,
            exc,
        )
        return None

    if indexed_rows > 0:
        return None

    empty_index = None
    if faiss_module is not None:
        try:
            empty_index = faiss_module.IndexFlatIP(embedding_dimension)
        except Exception as exc:
            logger.warning(
                "Failed to reinitialize %s FAISS index in cleanup path: %s",
                memory_type,
                exc,
            )

    vector_id_to_memory_id.clear()
    memory_id_to_vector_id.clear()

    try:
        unlink_index_file(index_path)
    except Exception as exc:
        logger.warning(
            "Failed to delete %s FAISS index file %s: %s",
            memory_type,
            index_path,
            exc,
        )

    logger.debug(
        "Cleared %s FAISS index artifacts after indexed rows reached zero",
        memory_type,
    )
    return IndexArtifactCleanupResult(empty_index=empty_index)
