"""
Shared memory request/response helpers for sidecar services.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple


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
    """Normalize raw memory rows into semantic/episodic text buckets."""
    grouped: Dict[str, List[str]] = {"semantic": [], "episodic": []}
    for result in results:
        memory_type = result.get("type", "episodic")
        text = result.get("text")
        if memory_type in grouped and text:
            grouped[memory_type].append(text)
    return grouped


def format_interaction_memory(user_query: str, assistant_response: str) -> str:
    """Store user/assistant exchanges in the canonical memory text format."""
    return f"User: {user_query}\nAssistant: {assistant_response}"


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

    normalized_query = user_query.strip()
    normalized_response = assistant_response.strip()
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


def build_interaction_metadata(
    memory_type: str,
    session_id: Optional[str],
) -> Dict[str, Optional[str]]:
    """Build metadata for conversation interaction memories."""
    return {
        "type": memory_type,
        "source": "interaction_completed",
        "conversation_id": session_id,
    }


async def store_interaction_memory(
    memory_store: Any,
    *,
    user_query: str,
    assistant_response: str,
    memory_type: str,
    user_id: str,
    session_id: Optional[str],
) -> Any:
    """Persist a normalized user/assistant interaction row."""
    memory_content = format_interaction_memory(user_query, assistant_response)
    metadata = build_interaction_metadata(memory_type, session_id)
    return await memory_store.add(
        memory_content,
        user_id,
        metadata,
        conversation_id=session_id,
        record_kind="interaction",
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
