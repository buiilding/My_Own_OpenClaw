"""
Shared memory request/response helpers for sidecar services.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


def build_memory_filters(memory_type: Optional[str]) -> Dict[str, str]:
    """Build optional memory type filter payload."""
    if not memory_type:
        return {}
    return {"type": memory_type}


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
