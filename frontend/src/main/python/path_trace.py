"""
Sanitized path trace helpers for the local sidecar runtime.
"""

from __future__ import annotations

import time
from typing import Any, Dict, Optional


def monotonic_trace_start() -> float:
    """Return a monotonic timestamp for local trace duration measurement."""
    return time.perf_counter()


def elapsed_trace_ms(started_at: float) -> int:
    """Return non-negative elapsed milliseconds for a monotonic trace start."""
    return max(0, round((time.perf_counter() - started_at) * 1000))


def count_grouped_memory_results(memories: Dict[str, Any]) -> Dict[str, int]:
    episodic = memories.get("episodic") if isinstance(memories, dict) else []
    semantic = memories.get("semantic") if isinstance(memories, dict) else []
    return {
        "episodicResultCount": len(episodic) if isinstance(episodic, list) else 0,
        "semanticResultCount": len(semantic) if isinstance(semantic, list) else 0,
    }


def build_sidecar_memory_search_trace(
    *,
    method: str,
    memory_type: Optional[str],
    embedding_dimension: int,
    embedding_space_version: Optional[str],
    selection: Dict[str, Any],
    exclude_conversation_id: Optional[str],
    memories: Dict[str, Any],
    started_at: float,
) -> Dict[str, Any]:
    return {
        "runtime": "sidecar",
        "method": method,
        "searchedMemoryTypes": [memory_type] if memory_type else ["episodic", "semantic"],
        "embeddingDimension": embedding_dimension,
        "embeddingSpaceVersion": embedding_space_version,
        "combinedLimit": selection["limit"],
        "episodicLimit": selection["episodic_limit"],
        "semanticLimit": selection["semantic_limit"],
        "semanticMinScore": selection["semantic_min_score"],
        "excludeConversationId": exclude_conversation_id,
        **count_grouped_memory_results(memories),
        "durationMs": elapsed_trace_ms(started_at),
    }
