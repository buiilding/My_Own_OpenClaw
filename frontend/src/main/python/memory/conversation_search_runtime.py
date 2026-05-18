"""
Shared transcript conversation-search runtime helpers for LocalMemoryStore.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

from memory.conversation_search_helpers import build_conversation_hit
from memory.conversation_search_helpers import build_fts_query
from memory.conversation_search_helpers import extract_query_terms
from memory.conversation_search_helpers import group_conversation_search_hits
from memory.conversation_search_helpers import pick_best_conversation_hit
from memory.conversation_search_helpers import safe_timestamp_to_epoch_seconds
from memory.conversation_title_helpers import ensure_conversation_title_from_row


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
    record_kind: str = "transcript",
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
                 SELECT content FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = ?
                   AND m2.role = 'user'
                   AND m2.content IS NOT NULL AND m2.content != ''
                 ORDER BY m2.message_index ASC, m2.timestamp ASC
                 LIMIT 1
               ) AS first_user_content,
               (
                 SELECT model_id FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = ?
                   AND m2.model_id IS NOT NULL AND m2.model_id != ''
                 ORDER BY m2.timestamp DESC, m2.message_index DESC
                 LIMIT 1
               ) AS model_id,
               (
                 SELECT model_provider FROM memories m2
                 WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                   AND m2.record_kind = ?
                   AND m2.model_provider IS NOT NULL AND m2.model_provider != ''
                 ORDER BY m2.timestamp DESC, m2.message_index DESC
                 LIMIT 1
               ) AS model_provider
        FROM memories
        WHERE user_id = ?
          AND record_kind = ?
          AND conversation_id IN ({placeholders})
        GROUP BY conversation_id
    """,
        (
            user_id,
            user_id,
            user_id,
            user_id,
            record_kind,
            user_id,
            record_kind,
            user_id,
            record_kind,
            user_id,
            record_kind,
            *normalized_ids,
        ),
    )
    rows = await cursor.fetchall()
    summaries: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        conversation_id = row["conversation_id"]
        title, title_source = await ensure_conversation_title_from_row(
            cursor=cursor,
            user_id=user_id,
            row=row,
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

async def search_transcript_conversations(
    *,
    store,
    episodic_db_path: str,
    user_id: str,
    query: str,
    limit: int,
    lexical_limit: int,
    semantic_limit: int,
    logger,
    now_epoch_seconds: Optional[float] = None,
) -> List[Dict[str, Any]]:
    normalized_query = (query or "").strip()
    if len(normalized_query) < 2:
        return []

    if aiosqlite is None:
        raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

    async with aiosqlite.connect(episodic_db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        lexical_hits = await search_transcript_hits_lexical(
            cursor=cursor,
            user_id=user_id,
            query=normalized_query,
            limit=max(1, lexical_limit),
            logger=logger,
        )

    semantic_hits = await search_transcript_hits_semantic(
        store=store,
        user_id=user_id,
        query=normalized_query,
        limit=max(1, semantic_limit),
        logger=logger,
    )

    grouped_hits = group_conversation_search_hits(lexical_hits, semantic_hits)
    if not grouped_hits:
        return []

    conversation_ids = list(grouped_hits.keys())
    async with aiosqlite.connect(episodic_db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        summaries = await fetch_conversation_summaries(
            cursor=cursor,
            user_id=user_id,
            conversation_ids=conversation_ids,
        )
        await conn.commit()

    return build_ranked_conversation_search_rows(
        grouped_hits=grouped_hits,
        summaries=summaries,
        limit=limit,
        now_epoch_seconds=now_epoch_seconds,
    )


def build_ranked_conversation_search_rows(
    *,
    grouped_hits: Dict[str, Dict[str, Any]],
    summaries: Dict[str, Dict[str, Any]],
    limit: int,
    now_epoch_seconds: Optional[float] = None,
) -> List[Dict[str, Any]]:
    scored_rows: List[Dict[str, Any]] = []
    now_ts = float(now_epoch_seconds or 0.0)

    for conversation_id, hit_info in grouped_hits.items():
        summary = summaries.get(conversation_id)
        if not summary:
            continue

        best_hit = pick_best_conversation_hit(hit_info)
        lexical_best = float(hit_info.get("lexical_best", 0.0))
        semantic_best = float(hit_info.get("semantic_best", 0.0))
        match_count = int(hit_info.get("match_count", 0))

        last_ts = safe_timestamp_to_epoch_seconds(summary.get("last_timestamp"))
        age_days = max(0.0, (now_ts - last_ts) / 86400.0) if last_ts > 0 else 3650.0
        recency_boost = 1.0 / (1.0 + (age_days / 14.0))
        final_score = (
            (lexical_best * 0.56)
            + (semantic_best * 0.32)
            + (min(match_count, 8) * 0.03)
            + (recency_boost * 0.12)
        )

        scored_rows.append({
            **summary,
            "score": float(final_score),
            "match_count": match_count,
            "lexical_match_count": int(hit_info.get("lexical_match_count", 0)),
            "semantic_match_count": int(hit_info.get("semantic_match_count", 0)),
            "match_source": best_hit.get("source"),
            "matched_role": best_hit.get("role"),
            "matched_at": best_hit.get("timestamp"),
            "snippet": best_hit.get("snippet"),
        })

    scored_rows.sort(
        key=lambda row: (
            float(row.get("score", 0.0)),
            safe_timestamp_to_epoch_seconds(row.get("last_timestamp")),
        ),
        reverse=True,
    )
    return scored_rows[: max(1, limit)]
