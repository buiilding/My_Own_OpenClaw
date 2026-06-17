"""
Sanitized path trace helpers for the Python sidecar runtime.
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


def _number(value: Any) -> Optional[float]:
    return value if isinstance(value, (int, float)) else None


def build_sidecar_screenshot_capture_trace(
    *,
    capture_payload: Dict[str, Any],
    started_at: float,
) -> Dict[str, Any]:
    capture_meta = capture_payload.get("capture_meta")
    if not isinstance(capture_meta, dict):
        capture_meta = {}
    virtual_bounds = capture_meta.get("desktop_virtual_bounds")
    if not isinstance(virtual_bounds, dict):
        virtual_bounds = {}

    trace: Dict[str, Any] = {
        "captureEngine": capture_meta.get("capture_engine"),
        "monitorId": capture_meta.get("monitor_id"),
        "sourceW": _number(capture_meta.get("source_w")),
        "sourceH": _number(capture_meta.get("source_h")),
        "cropX": _number(capture_meta.get("crop_x")),
        "cropY": _number(capture_meta.get("crop_y")),
        "cropW": _number(capture_meta.get("crop_w")),
        "cropH": _number(capture_meta.get("crop_h")),
        "virtualX": _number(virtual_bounds.get("x")),
        "virtualY": _number(virtual_bounds.get("y")),
        "virtualWidth": _number(virtual_bounds.get("width")),
        "virtualHeight": _number(virtual_bounds.get("height")),
        "byteCount": _number(capture_payload.get("size")),
        "contentType": capture_payload.get("screenshot_content_type"),
        "durationMs": elapsed_trace_ms(started_at),
        "hasCaptureMeta": bool(capture_meta),
    }
    return {key: value for key, value in trace.items() if value is not None}
