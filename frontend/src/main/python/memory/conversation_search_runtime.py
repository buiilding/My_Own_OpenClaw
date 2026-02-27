"""
Shared transcript conversation-search runtime helpers for LocalMemoryStore.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from memory.conversation_search_helpers import build_conversation_hit
from memory.conversation_search_helpers import build_fts_query
from memory.conversation_search_helpers import extract_query_terms
from memory.conversation_title_helpers import ensure_conversation_title


def _build_scored_transcript_hit(
    *,
    memory_id: Any,
    conversation_id: Any,
    role: Any,
    content: Any,
    timestamp: Any,
    source: str,
    score: float,
    query: str,
) -> Dict[str, Any]:
    return build_conversation_hit(
        memory_id=memory_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        timestamp=timestamp,
        source=source,
        score=score,
        query=query,
    )


def _position_rank_score(*, index: int, limit: int) -> float:
    return max(0.0, 1.0 - (index / max(1, limit)))


def _build_lexical_hit(
    *,
    row: Dict[str, Any],
    query: str,
    index: int,
    limit: int,
    lexical_rank: Any = None,
) -> Dict[str, Any]:
    score = _position_rank_score(index=index, limit=limit)
    if lexical_rank is not None:
        rank_factor = 1.0 / (1.0 + abs(float(lexical_rank or 0.0)))
        score = (score * 0.72) + (rank_factor * 0.28)

    return _build_scored_transcript_hit(
        memory_id=row["memory_id"],
        conversation_id=row["conversation_id"],
        role=row["role"],
        content=row["content"],
        timestamp=row["timestamp"],
        source="lexical",
        score=score,
        query=query,
    )


def _build_lexical_hits_from_rows(
    *,
    rows: List[Dict[str, Any]],
    query: str,
    limit: int,
    lexical_rank_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    hits: List[Dict[str, Any]] = []
    for index, row in enumerate(rows):
        lexical_rank = row[lexical_rank_key] if lexical_rank_key else None
        hits.append(_build_lexical_hit(
            row=row,
            query=query,
            index=index,
            limit=limit,
            lexical_rank=lexical_rank,
        ))
    return hits


async def search_transcript_hits_lexical(
    *,
    cursor,
    user_id: str,
    query: str,
    limit: int,
    logger,
) -> List[Dict[str, Any]]:
    fts_query = build_fts_query(query)
    if not fts_query:
        return []

    try:
        await cursor.execute(
            """
            SELECT
                m.id AS memory_id,
                m.conversation_id AS conversation_id,
                m.role AS role,
                m.content AS content,
                m.timestamp AS timestamp,
                bm25(transcript_fts) AS lexical_rank
            FROM transcript_fts
            JOIN memories m ON m.rowid = transcript_fts.rowid
            WHERE transcript_fts MATCH ?
              AND m.user_id = ?
              AND m.record_kind = 'transcript'
              AND m.conversation_id IS NOT NULL
            ORDER BY lexical_rank ASC, m.timestamp DESC
            LIMIT ?
        """,
            (fts_query, user_id, limit),
        )
        rows = await cursor.fetchall()
        return _build_lexical_hits_from_rows(
            rows=rows,
            query=query,
            limit=limit,
            lexical_rank_key="lexical_rank",
        )
    except Exception as exc:
        logger.warning(
            "Transcript FTS query failed; falling back to LIKE search: %s",
            exc,
        )
        return await search_transcript_hits_like(
            cursor=cursor,
            user_id=user_id,
            query=query,
            limit=limit,
        )


async def search_transcript_hits_like(
    *,
    cursor,
    user_id: str,
    query: str,
    limit: int,
) -> List[Dict[str, Any]]:
    like_terms = extract_query_terms(query)
    if not like_terms:
        return []
    where_clause = " OR ".join(["LOWER(content) LIKE ?"] * len(like_terms))
    params = tuple(f"%{term.lower()}%" for term in like_terms)
    await cursor.execute(
        f"""
        SELECT
            id AS memory_id,
            conversation_id,
            role,
            content,
            timestamp
        FROM memories
        WHERE user_id = ?
          AND record_kind = 'transcript'
          AND conversation_id IS NOT NULL
          AND ({where_clause})
        ORDER BY timestamp DESC
        LIMIT ?
    """,
        (user_id, *params, limit),
    )
    rows = await cursor.fetchall()
    return _build_lexical_hits_from_rows(rows=rows, query=query, limit=limit)


async def search_transcript_hits_semantic(
    *,
    store,
    user_id: str,
    query: str,
    limit: int,
    logger,
) -> List[Dict[str, Any]]:
    try:
        semantic_rows = await store.search(
            query=query,
            user_id=user_id,
            filters={"type": "episodic"},
            limit=limit,
        )
    except Exception as exc:
        logger.warning("Semantic transcript search failed: %s", exc)
        return []

    hits: List[Dict[str, Any]] = []
    for index, row in enumerate(semantic_rows):
        metadata = row.get("metadata") or {}
        record_kind = (metadata.get("record_kind") or "").strip().lower()
        if record_kind != "transcript":
            continue

        conversation_id = row.get("conversation_id") or metadata.get("conversation_id")
        if not conversation_id:
            continue

        raw_score = float(row.get("score") or 0.0)
        semantic_score = max(0.0, min(1.0, (raw_score + 1.0) / 2.0))
        rank_bonus = max(0.0, 1.0 - (index / max(1, limit)))
        score = (semantic_score * 0.74) + (rank_bonus * 0.26)

        hits.append(_build_scored_transcript_hit(
            memory_id=row.get("id"),
            conversation_id=conversation_id,
            role=metadata.get("role"),
            content=row.get("text"),
            timestamp=row.get("timestamp"),
            source="semantic",
            score=score,
            query=query,
        ))

    return hits


async def fetch_conversation_summaries(
    *,
    cursor,
    user_id: str,
    conversation_ids: List[str],
) -> Dict[str, Dict[str, Any]]:
    normalized_ids = [
        conversation_id
        for conversation_id in conversation_ids
        if isinstance(conversation_id, str) and conversation_id
    ]
    if not normalized_ids:
        return {}

    placeholders = ",".join(["?"] * len(normalized_ids))
    await cursor.execute(
        f"""
        SELECT conversation_id,
               MIN(timestamp) AS first_timestamp,
               MAX(timestamp) AS last_timestamp,
               COUNT(*) AS entry_count,
               (
                 SELECT title FROM conversation_titles ct
                 WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                 LIMIT 1
               ) AS title,
               (
                 SELECT source FROM conversation_titles ct
                 WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                 LIMIT 1
               ) AS title_source,
               (
                 SELECT is_locked FROM conversation_titles ct
                 WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                 LIMIT 1
               ) AS title_locked,
               (
                 SELECT model_id FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = 'transcript'
                   AND m2.model_id IS NOT NULL AND m2.model_id != ''
                 ORDER BY m2.timestamp DESC, m2.message_index DESC
                 LIMIT 1
               ) AS model_id,
               (
                 SELECT model_provider FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = 'transcript'
                   AND m2.model_provider IS NOT NULL AND m2.model_provider != ''
                 ORDER BY m2.timestamp DESC, m2.message_index DESC
                 LIMIT 1
               ) AS model_provider
        FROM memories
        WHERE user_id = ?
          AND record_kind = 'transcript'
          AND conversation_id IN ({placeholders})
        GROUP BY conversation_id
    """,
        (
            user_id,
            user_id,
            user_id,
            user_id,
            user_id,
            user_id,
            *normalized_ids,
        ),
    )
    rows = await cursor.fetchall()
    summaries: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        conversation_id = row["conversation_id"]
        title, title_source = await ensure_conversation_title(
            cursor=cursor,
            user_id=user_id,
            conversation_id=conversation_id,
            existing_title=row["title"],
            existing_title_source=row["title_source"],
            existing_title_locked=row["title_locked"],
        )
        normalized_title = title.strip() if isinstance(title, str) and title.strip() else "New chat"
        summaries[conversation_id] = {
            "conversation_id": conversation_id,
            "first_timestamp": row["first_timestamp"],
            "last_timestamp": row["last_timestamp"],
            "entry_count": row["entry_count"],
            "model_id": row["model_id"],
            "model_provider": row["model_provider"],
            "title": normalized_title,
            "title_source": title_source or ("model" if normalized_title != "New chat" else "pending"),
            "is_resumable": bool(
                isinstance(conversation_id, str)
                and conversation_id.startswith("conv_")
            ),
        }
    return summaries
