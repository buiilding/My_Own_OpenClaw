"""
Shared memory request/response helpers for sidecar services.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.unicode_sanitizer import sanitize_surrogates_in_text
from memory.record_kinds import (
    COMPLETED_TURN_MEMORY_SOURCE,
    INTERACTION_RECORD_KIND,
)

_NO_DURABLE_MEMORY_MARKERS = {
    "none",
    "no durable memory",
    "no durable memories",
    "no durable fact",
    "no durable facts",
    "nothing durable",
}
SEMANTIC_STATUS_STORED = "stored"
SEMANTIC_STATUS_SKIPPED_LOW_SIGNAL = "skipped_low_signal"
SEMANTIC_STATUS_SKIPPED_NO_DURABLE_MEMORY = "skipped_no_durable_memory"
_LOW_SIGNAL_SEMANTIC_FACT_PATTERNS = (
    re.compile(r"\bno (?:user )?preferences?\b", re.IGNORECASE),
    re.compile(r"\bno key facts?\b", re.IGNORECASE),
    re.compile(r"\bno durable (?:memory|memories|fact|facts)\b", re.IGNORECASE),
    re.compile(
        r"\buser (?:greeted|said hi|said hello|initiated contact)\b", re.IGNORECASE
    ),
    re.compile(r"\bcasual greeting\b", re.IGNORECASE),
    re.compile(r"\bcommunication style is casual\b", re.IGNORECASE),
    re.compile(r"\bfinder\b", re.IGNORECASE),
    re.compile(r"\bapplications folder\b", re.IGNORECASE),
    re.compile(r"\bactive window\b", re.IGNORECASE),
    re.compile(r"\bephemeral context\b", re.IGNORECASE),
    re.compile(r"\bconnected to a browser\b", re.IGNORECASE),
    re.compile(r"\bbrowser is now connected\b", re.IGNORECASE),
    re.compile(r"\bunexpected system error\b", re.IGNORECASE),
    re.compile(r"\boperation timed out\b", re.IGNORECASE),
    re.compile(r"\bcannot connect\b", re.IGNORECASE),
)


def normalize_semantic_summary(summary: Any) -> str:
    """Normalize backend summary text and collapse explicit no-memory markers."""
    normalized = sanitize_surrogates_in_text(str(summary or "")).strip()
    if not normalized:
        return ""
    lowered = normalized.lower().rstrip(".!")
    if lowered in _NO_DURABLE_MEMORY_MARKERS:
        return ""
    return normalized


def normalize_semantic_fact_list(facts: Any) -> List[str]:
    """Normalize, dedupe, and preserve order for semantic fact lists."""
    if not isinstance(facts, Iterable) or isinstance(facts, (str, bytes, dict)):
        return []

    normalized: List[str] = []
    seen: set[str] = set()
    for fact in facts:
        cleaned = sanitize_surrogates_in_text(str(fact or "")).strip()
        if not cleaned:
            continue
        dedupe_key = cleaned.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(cleaned)
    return normalized


def is_explicit_no_durable_memory_result(summary: Any, facts: Any) -> bool:
    """Return True when the summarizer explicitly reported no durable memory."""
    normalized_summary = sanitize_surrogates_in_text(str(summary or "")).strip()
    lowered = normalized_summary.lower().rstrip(".!")
    return lowered in _NO_DURABLE_MEMORY_MARKERS and not normalize_semantic_fact_list(
        facts
    )


def filter_durable_semantic_facts(facts: Iterable[str]) -> List[str]:
    """Drop low-signal facts and keep only durable semantic facts."""
    return [fact for fact in facts if not _is_low_signal_semantic_fact(fact)]


def classify_semantic_summarization_result(
    summary: Any,
    facts: Any,
) -> Dict[str, Any]:
    """
    Normalize and classify semantic summarization output.

    Returns normalized summary/facts plus a status that the summarizer can persist.
    """
    explicit_no_durable = is_explicit_no_durable_memory_result(summary, facts)
    normalized_summary = normalize_semantic_summary(summary)
    normalized_facts = normalize_semantic_fact_list(facts)
    durable_facts = filter_durable_semantic_facts(normalized_facts)

    if durable_facts:
        status = SEMANTIC_STATUS_STORED
    elif explicit_no_durable:
        status = SEMANTIC_STATUS_SKIPPED_NO_DURABLE_MEMORY
    else:
        status = SEMANTIC_STATUS_SKIPPED_LOW_SIGNAL

    return {
        "summary": normalized_summary,
        "facts": normalized_facts,
        "durable_facts": durable_facts,
        "status": status,
    }


def build_semanticization_metadata(
    *,
    status: str,
    summary_hash: str,
    durable_fact_count: int = 0,
    skipped_fact_count: int = 0,
) -> Dict[str, Any]:
    """Build the metadata patch persisted when episodic rows are semanticized."""
    return {
        "semantic_status": status,
        "semantic_summary_hash": summary_hash,
        "semantic_processed_at": datetime.now(timezone.utc).isoformat(),
        "semantic_durable_fact_count": durable_fact_count,
        "semantic_skipped_fact_count": skipped_fact_count,
    }


def build_memory_filters(memory_type: Optional[str]) -> Dict[str, str]:
    """Build optional memory type filter payload."""
    if not memory_type:
        return {}
    return {"type": memory_type}


def normalize_search_memory_payload(
    query: Any,
    memory_type: Any,
) -> Tuple[Optional[Dict[str, Optional[str]]], Optional[str]]:
    """Validate and normalize search-memory payload fields."""
    if not isinstance(query, str) or not query.strip():
        return None, "Query is required for memory search"

    normalized_memory_type: Optional[str] = None
    if memory_type is not None:
        if not isinstance(memory_type, str):
            return None, "memory_type must be a string"
        normalized_memory_type = memory_type.strip().lower()
        if normalized_memory_type == "":
            normalized_memory_type = None
        elif normalized_memory_type not in {"episodic", "semantic"}:
            return None, f"Invalid memory_type: {normalized_memory_type}"

    return {
        "query": query.strip(),
        "memory_type": normalized_memory_type,
    }, None


def normalize_search_memory_embedding_payload(
    embedding: Any,
    memory_type: Any,
    embedding_space_version: Any = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Validate and normalize embedding-owned memory search fields."""
    if not isinstance(embedding, list) or not embedding:
        return None, "embedding must be a non-empty list"

    normalized_embedding: List[float] = []
    for value in embedding:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None, "embedding entries must be numbers"
        normalized_embedding.append(float(value))

    normalized_memory_type: Optional[str] = None
    if memory_type is not None:
        if not isinstance(memory_type, str):
            return None, "memory_type must be a string"
        normalized_memory_type = memory_type.strip().lower()
        if normalized_memory_type == "":
            normalized_memory_type = None
        elif normalized_memory_type not in {"episodic", "semantic"}:
            return None, f"Invalid memory_type: {normalized_memory_type}"

    normalized_space_version: Optional[str] = None
    if embedding_space_version is not None:
        if not isinstance(embedding_space_version, str):
            return None, "embedding_space_version must be a string"
        normalized_space_version = embedding_space_version.strip() or None

    return {
        "embedding": normalized_embedding,
        "memory_type": normalized_memory_type,
        "embedding_space_version": normalized_space_version,
    }, None


def _normalize_optional_positive_int(
    value: Any,
    *,
    field_name: str,
    default: Optional[int] = None,
) -> Tuple[Optional[int], Optional[str]]:
    if value is None:
        return default, None
    if isinstance(value, bool) or not isinstance(value, int):
        return None, f"{field_name} must be an integer"
    if value <= 0:
        return None, f"{field_name} must be greater than 0"
    return value, None


def normalize_search_memory_selection(
    *,
    limit: Any,
    episodic_limit: Any = None,
    semantic_limit: Any = None,
    semantic_min_score: Any = None,
) -> Tuple[Optional[Dict[str, Optional[float]]], Optional[str]]:
    """Validate optional prompt-injection retrieval budgets and score thresholds."""
    normalized_limit, error = _normalize_optional_positive_int(
        limit,
        field_name="limit",
        default=5,
    )
    if error:
        return None, error

    normalized_episodic_limit, error = _normalize_optional_positive_int(
        episodic_limit,
        field_name="episodic_limit",
    )
    if error:
        return None, error

    normalized_semantic_limit, error = _normalize_optional_positive_int(
        semantic_limit,
        field_name="semantic_limit",
    )
    if error:
        return None, error

    normalized_semantic_min_score: Optional[float] = None
    if semantic_min_score is not None:
        if isinstance(semantic_min_score, bool) or not isinstance(
            semantic_min_score, (int, float)
        ):
            return None, "semantic_min_score must be a number"
        normalized_semantic_min_score = float(semantic_min_score)
        if not 0.0 <= normalized_semantic_min_score <= 1.0:
            return None, "semantic_min_score must be between 0 and 1"

    return {
        "limit": normalized_limit,
        "episodic_limit": normalized_episodic_limit,
        "semantic_limit": normalized_semantic_limit,
        "semantic_min_score": normalized_semantic_min_score,
        "use_balanced_limits": bool(
            normalized_episodic_limit is not None
            or normalized_semantic_limit is not None
            or normalized_semantic_min_score is not None
        ),
    }, None


def filter_results_by_min_score(
    results: Iterable[Dict[str, Any]],
    min_score: Optional[float],
) -> List[Dict[str, Any]]:
    """Drop search results that fall below an optional similarity floor."""
    if min_score is None:
        return list(results)

    filtered: List[Dict[str, Any]] = []
    for result in results:
        score = result.get("score")
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            continue
        if float(score) >= min_score:
            filtered.append(result)
    return filtered


def _extract_semantic_facts(text: str) -> List[str]:
    facts: List[str] = []
    in_facts = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.lower() == "facts:":
            in_facts = True
            continue
        if not in_facts:
            continue
        if line.startswith("-"):
            fact = line[1:].strip()
            if fact:
                facts.append(fact)
    return facts


def _is_low_signal_semantic_fact(fact: str) -> bool:
    normalized = fact.strip()
    if len(normalized) < 8:
        return True
    lowered = normalized.lower()
    if lowered in _NO_DURABLE_MEMORY_MARKERS:
        return True
    return any(
        pattern.search(normalized) for pattern in _LOW_SIGNAL_SEMANTIC_FACT_PATTERNS
    )


def is_durable_semantic_text(text: Any) -> bool:
    """Return True when a semantic memory contains at least one durable fact."""
    if not isinstance(text, str):
        return False
    normalized = text.strip()
    if not normalized:
        return False
    facts = _extract_semantic_facts(normalized)
    if not facts:
        return True
    return any(not _is_low_signal_semantic_fact(fact) for fact in facts)


def exclude_conversation_results(
    results: Iterable[Dict[str, Any]],
    conversation_id: Optional[str],
) -> List[Dict[str, Any]]:
    """Drop episodic rows from the active conversation to avoid echoing context."""
    if not conversation_id:
        return list(results)

    return [
        result
        for result in results
        if not (
            result.get("type") == "episodic"
            and result.get("conversation_id") == conversation_id
        )
    ]


def group_memory_texts(results: Iterable[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Normalize raw memory rows into semantic/episodic text buckets.

    Episodic injection prefers interaction-style memories that include both
    user and assistant content (for richer retrieval context in prompt
    construction). If no interaction-style episodic rows are present, falls
    back to the original episodic results.
    """
    grouped: Dict[str, List[str]] = {"semantic": [], "episodic": []}
    episodic_interactions: List[str] = []
    episodic_fallback: List[str] = []

    def _is_completed_turn_interaction(result: Dict[str, Any], text: str) -> bool:
        metadata = result.get("metadata")
        if isinstance(metadata, dict):
            source = str(metadata.get("source", "")).strip().lower()
            record_kind = str(metadata.get("record_kind", "")).strip().lower()
            if (
                source == COMPLETED_TURN_MEMORY_SOURCE
                or record_kind == INTERACTION_RECORD_KIND
            ):
                return True

        normalized_text = text.strip().lower()
        return "user:" in normalized_text and "assistant:" in normalized_text

    for result in results:
        memory_type = result.get("type", "episodic")
        text = result.get("text")
        if memory_type in grouped and text:
            if memory_type == "semantic":
                if not is_durable_semantic_text(text):
                    continue
                grouped["semantic"].append(text)
                continue
            if _is_completed_turn_interaction(result, text):
                episodic_interactions.append(text)
            else:
                episodic_fallback.append(text)

    if episodic_interactions:
        grouped["episodic"] = episodic_interactions
        return grouped

    grouped["episodic"] = episodic_fallback
    return grouped


def normalize_store_memory_by_embedding_payload(
    content: Any,
    embedding: Any,
    embedding_space_version: Any,
    memory_type: Any,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Validate and normalize SDK-owned store_memory_by_embedding payload fields.

    Returns:
        ({content, embedding, embedding_space_version, memory_type}, None) on success
        (None, "<error message>") on validation failure
    """
    if content is None:
        return None, "Missing content"

    if not isinstance(content, str):
        return None, "content must be a string"

    if memory_type is not None and not isinstance(memory_type, str):
        return None, "memory_type must be a string"

    normalized_content = sanitize_surrogates_in_text(content.strip())
    normalized_memory_type = (memory_type or "episodic").strip().lower()

    if not normalized_content:
        return None, "Missing content"

    if normalized_memory_type not in {"episodic", "semantic"}:
        return None, f"Invalid memory_type: {normalized_memory_type}"

    normalized_embedding, embedding_error = normalize_search_memory_embedding_payload(
        embedding=embedding,
        memory_type=normalized_memory_type,
        embedding_space_version=embedding_space_version,
    )
    if embedding_error:
        return None, embedding_error

    return {
        "content": normalized_content,
        "embedding": normalized_embedding["embedding"],
        "embedding_space_version": normalized_embedding["embedding_space_version"],
        "memory_type": normalized_memory_type,
    }, None


def build_completed_turn_memory_metadata(
    memory_type: str,
    session_id: Optional[str],
) -> Dict[str, Optional[str]]:
    """Build metadata for completed-turn interaction memories."""
    return {
        "type": memory_type,
        "source": COMPLETED_TURN_MEMORY_SOURCE,
        "conversation_id": session_id,
    }


async def store_memory_by_embedding(
    memory_store: Any,
    *,
    content: str,
    embedding: List[float],
    embedding_space_version: Optional[str],
    memory_type: str,
    user_id: str,
    conversation_id: Optional[str],
) -> Any:
    """Persist one SDK-formatted memory row with its SDK-provided embedding."""
    metadata = build_completed_turn_memory_metadata(memory_type, conversation_id)
    return await memory_store.add(
        content,
        user_id,
        metadata,
        conversation_id=conversation_id,
        record_kind=INTERACTION_RECORD_KIND,
        embedding=embedding,
        embedding_space_version=embedding_space_version,
    )


def build_store_memory_response_data(
    memory_id: str,
    memory_type: str,
) -> Dict[str, str]:
    """Build common success payload for store_memory_by_embedding handlers."""
    return {
        "memory_id": memory_id,
        "memory_type": memory_type,
        "message": f"Stored {memory_type} memory",
    }


async def normalize_and_store_memory_by_embedding(
    memory_store: Any,
    *,
    content: Any,
    embedding: Any,
    embedding_space_version: Any,
    memory_type: Any,
    user_id: str,
    conversation_id: Optional[str],
) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    """
    Validate store_memory_by_embedding inputs and persist row on success.

    Returns:
        ({"memory_id": str, "memory_type": str}, None) on success
        (None, "<error message>") on validation failure
    """
    normalized, error = normalize_store_memory_by_embedding_payload(
        content=content,
        embedding=embedding,
        embedding_space_version=embedding_space_version,
        memory_type=memory_type,
    )
    if error:
        return None, error

    normalized_memory_type = normalized["memory_type"]
    memory_id = await store_memory_by_embedding(
        memory_store,
        content=normalized["content"],
        embedding=normalized["embedding"],
        embedding_space_version=normalized["embedding_space_version"],
        memory_type=normalized_memory_type,
        user_id=user_id,
        conversation_id=conversation_id,
    )

    return {
        "memory_id": memory_id,
        "memory_type": normalized_memory_type,
    }, None
