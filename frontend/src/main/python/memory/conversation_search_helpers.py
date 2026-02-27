"""
Shared conversation-search helper functions for LocalMemoryStore.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def extract_query_terms(query: str) -> List[str]:
    terms = re.findall(r"[A-Za-z0-9_]+", (query or "").lower())
    deduped: List[str] = []
    seen = set()
    for term in terms:
        normalized = term.strip()
        if len(normalized) < 2 or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
        if len(deduped) >= 8:
            break
    return deduped


def build_fts_query(query: str) -> str:
    terms = extract_query_terms(query)
    if not terms:
        return ""
    return " ".join(f"{term}*" for term in terms)


def build_content_snippet(content: Optional[str], query: str) -> str:
    text = " ".join((content or "").split())
    if not text:
        return ""
    max_chars = 160
    if len(text) <= max_chars:
        return text

    lower_text = text.lower()
    terms = extract_query_terms(query)
    hit_index = 0
    for term in terms:
        pos = lower_text.find(term)
        if pos >= 0:
            hit_index = pos
            break

    window = 130
    start = max(0, hit_index - 45)
    end = min(len(text), start + window)
    start = max(0, end - window)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = f"…{snippet}"
    if end < len(text):
        snippet = f"{snippet}…"
    return snippet


def build_conversation_hit(
    memory_id: Optional[str],
    conversation_id: Optional[str],
    role: Optional[str],
    content: Optional[str],
    timestamp: Optional[str],
    source: str,
    score: float,
    query: str,
) -> Dict[str, Any]:
    normalized_role = (role or "").strip().lower() or "assistant"
    snippet = build_content_snippet(content, query)
    return {
        "memory_id": memory_id,
        "conversation_id": conversation_id,
        "role": normalized_role,
        "content": content or "",
        "timestamp": timestamp,
        "source": source,
        "score": float(score),
        "snippet": snippet,
    }


def group_conversation_search_hits(
    lexical_hits: List[Dict[str, Any]],
    semantic_hits: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}

    def append_hit(hit: Dict[str, Any]) -> None:
        conversation_id = hit.get("conversation_id")
        if not conversation_id:
            return
        bucket = grouped.setdefault(conversation_id, {
            "hits": [],
            "match_ids": set(),
            "lexical_match_count": 0,
            "semantic_match_count": 0,
            "lexical_best": 0.0,
            "semantic_best": 0.0,
        })
        memory_id = hit.get("memory_id")
        if memory_id and memory_id in bucket["match_ids"]:
            return

        bucket["hits"].append(hit)
        if memory_id:
            bucket["match_ids"].add(memory_id)

        source = hit.get("source")
        score = float(hit.get("score", 0.0))
        if source == "lexical":
            bucket["lexical_match_count"] += 1
            bucket["lexical_best"] = max(bucket["lexical_best"], score)
        elif source == "semantic":
            bucket["semantic_match_count"] += 1
            bucket["semantic_best"] = max(bucket["semantic_best"], score)

    for hit in lexical_hits:
        append_hit(hit)
    for hit in semantic_hits:
        append_hit(hit)

    for payload in grouped.values():
        payload["match_count"] = len(payload["match_ids"])
        payload.pop("match_ids", None)
    return grouped


def pick_best_conversation_hit(hit_info: Dict[str, Any]) -> Dict[str, Any]:
    hits = hit_info.get("hits") or []
    if not hits:
        return {
            "source": "lexical",
            "role": "assistant",
            "timestamp": None,
            "snippet": "",
            "score": 0.0,
        }
    lexical_hits = [hit for hit in hits if hit.get("source") == "lexical"]
    if lexical_hits:
        return max(lexical_hits, key=lambda hit: float(hit.get("score", 0.0)))
    return max(hits, key=lambda hit: float(hit.get("score", 0.0)))


def safe_timestamp_to_epoch_seconds(timestamp: Optional[str]) -> float:
    if not isinstance(timestamp, str) or not timestamp.strip():
        return 0.0
    text = timestamp.strip()
    try:
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except Exception:
        return 0.0
