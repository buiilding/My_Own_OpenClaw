"""
Shared memory request/response helpers for sidecar services.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.unicode_sanitizer import sanitize_surrogates_in_text
from memory.record_kinds import (
    COMPLETED_TURN_MEMORY_SOURCE,
    INTERACTION_RECORD_KIND,
    TRANSCRIPT_RECORD_KIND,
)


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
    episodic_structured_rows: List[Dict[str, Any]] = []

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
                grouped["semantic"].append(text)
                continue
            if _is_completed_turn_interaction(result, text):
                episodic_interactions.append(text)
            else:
                episodic_fallback.append(text)
                episodic_structured_rows.append(result)

    if episodic_interactions:
        grouped["episodic"] = episodic_interactions
        return grouped

    synthesized_pairs = synthesize_transcript_interaction_pairs(episodic_structured_rows)
    grouped["episodic"] = synthesized_pairs or episodic_fallback
    return grouped


def _normalize_message_index(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None


def _resolve_result_metadata(result: Dict[str, Any]) -> Dict[str, Any]:
    metadata = result.get("metadata")
    if isinstance(metadata, dict):
        return metadata
    return {}


def synthesize_transcript_interaction_pairs(results: Iterable[Dict[str, Any]]) -> List[str]:
    """
    Build best-effort user/assistant pairs from transcript search rows.

    This is a fallback for cases where explicit interaction memories are not returned
    in top-k similarity results.
    """
    assistant_rows_by_conversation: Dict[str, List[Tuple[Optional[int], str]]] = {}
    user_rows_by_conversation: Dict[str, List[Tuple[Optional[int], str]]] = {}

    for result in results:
        text = result.get("text")
        if not isinstance(text, str) or not text.strip():
            continue

        metadata = _resolve_result_metadata(result)
        record_kind = (
            result.get("record_kind")
            or metadata.get("record_kind")
            or ""
        )
        if str(record_kind).strip().lower() != TRANSCRIPT_RECORD_KIND:
            continue

        conversation_id = (
            result.get("conversation_id")
            or metadata.get("conversation_id")
            or "__unknown_conversation__"
        )
        normalized_conversation_id = str(conversation_id).strip() or "__unknown_conversation__"
        role = (
            result.get("role")
            or metadata.get("role")
            or ""
        )
        normalized_role = str(role).strip().lower()
        message_index = _normalize_message_index(
            result.get("message_index", metadata.get("message_index"))
        )

        if normalized_role == "assistant":
            assistant_rows_by_conversation.setdefault(normalized_conversation_id, []).append((message_index, text))
            continue
        if normalized_role == "user":
            user_rows_by_conversation.setdefault(normalized_conversation_id, []).append((message_index, text))

    if not user_rows_by_conversation or not assistant_rows_by_conversation:
        return []

    def _row_sort_key(row: Tuple[Optional[int], str]) -> Tuple[int, int]:
        message_index = row[0]
        return (
            message_index if message_index is not None else 10**9,
            0 if message_index is not None else 1,
        )

    for conversation_id in assistant_rows_by_conversation:
        assistant_rows_by_conversation[conversation_id] = sorted(
            assistant_rows_by_conversation[conversation_id],
            key=_row_sort_key,
        )
    for conversation_id in user_rows_by_conversation:
        user_rows_by_conversation[conversation_id] = sorted(
            user_rows_by_conversation[conversation_id],
            key=_row_sort_key,
        )

    paired_interactions: List[str] = []
    for conversation_id, user_rows in user_rows_by_conversation.items():
        assistant_rows = assistant_rows_by_conversation.get(conversation_id, [])
        for user_index, user_text in user_rows:
            selected_assistant_idx = None
            selected_assistant_text = None

            for idx, (assistant_index, assistant_text) in enumerate(assistant_rows):
                if user_index is None:
                    selected_assistant_idx = idx
                    selected_assistant_text = assistant_text
                    break
                if assistant_index is None or assistant_index > user_index:
                    selected_assistant_idx = idx
                    selected_assistant_text = assistant_text
                    break

            if selected_assistant_idx is None or selected_assistant_text is None:
                continue

            paired_interactions.append(
                format_interaction_memory(user_text, selected_assistant_text)
            )
            assistant_rows.pop(selected_assistant_idx)

    return paired_interactions


def format_interaction_memory(user_query: str, assistant_response: str) -> str:
    """Store user/assistant exchanges in the canonical memory text format."""
    return (
        f"User: {sanitize_surrogates_in_text(user_query)}\n"
        f"Assistant: {sanitize_surrogates_in_text(assistant_response)}"
    )


def normalize_store_memory_payload(
    user_query: Any,
    assistant_response: Any,
    memory_type: Any,
) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    """
    Validate and normalize store-memory payload fields.

    Returns:
        ({user_query, assistant_response, memory_type}, None) on success
        (None, "<error message>") on validation failure
    """
    if user_query is None or assistant_response is None:
        return None, "Missing user_query or assistant_response"

    if not isinstance(user_query, str) or not isinstance(assistant_response, str):
        return None, "user_query and assistant_response must be strings"

    if memory_type is not None and not isinstance(memory_type, str):
        return None, "memory_type must be a string"

    normalized_query = sanitize_surrogates_in_text(user_query.strip())
    normalized_response = sanitize_surrogates_in_text(assistant_response.strip())
    normalized_memory_type = (memory_type or "episodic").strip().lower()

    if not normalized_query or not normalized_response:
        return None, "Missing user_query or assistant_response"

    if normalized_memory_type not in {"episodic", "semantic"}:
        return None, f"Invalid memory_type: {normalized_memory_type}"

    return {
        "user_query": normalized_query,
        "assistant_response": normalized_response,
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


async def store_completed_turn_memory(
    memory_store: Any,
    *,
    user_query: str,
    assistant_response: str,
    memory_type: str,
    user_id: str,
    session_id: Optional[str],
) -> Any:
    """Persist one completed-turn interaction memory row."""
    memory_content = format_interaction_memory(user_query, assistant_response)
    metadata = build_completed_turn_memory_metadata(memory_type, session_id)
    return await memory_store.add(
        memory_content,
        user_id,
        metadata,
        conversation_id=session_id,
        record_kind=INTERACTION_RECORD_KIND,
    )


def build_store_memory_response_data(
    memory_id: str,
    memory_type: str,
) -> Dict[str, str]:
    """Build common success payload for store-memory handlers."""
    return {
        "memory_id": memory_id,
        "memory_type": memory_type,
        "message": f"Stored {memory_type} memory",
    }


async def normalize_and_store_completed_turn_memory(
    memory_store: Any,
    *,
    user_query: Any,
    assistant_response: Any,
    memory_type: Any,
    user_id: str,
    session_id: Optional[str],
) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    """
    Validate store-memory inputs and persist interaction row on success.

    Returns:
        ({"memory_id": str, "memory_type": str}, None) on success
        (None, "<error message>") on validation failure
    """
    normalized, error = normalize_store_memory_payload(
        user_query=user_query,
        assistant_response=assistant_response,
        memory_type=memory_type,
    )
    if error:
        return None, error

    normalized_memory_type = normalized["memory_type"]
    memory_id = await store_completed_turn_memory(
        memory_store,
        user_query=normalized["user_query"],
        assistant_response=normalized["assistant_response"],
        memory_type=normalized_memory_type,
        user_id=user_id,
        session_id=session_id,
    )

    return {
        "memory_id": memory_id,
        "memory_type": normalized_memory_type,
    }, None
