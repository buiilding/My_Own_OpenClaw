"""Shared utility helpers for VmRunControlService."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_optional_string(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def normalize_files(files: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    if not isinstance(files, list):
        return normalized
    for item in files:
        if not isinstance(item, dict):
            continue
        artifact_id = item.get("artifact_id")
        if not isinstance(artifact_id, str) or not artifact_id.strip():
            continue
        normalized.append(
            {
                "artifact_id": artifact_id.strip(),
                "filename": (
                    item.get("filename").strip()
                    if isinstance(item.get("filename"), str) and item.get("filename").strip()
                    else None
                ),
                "content_type": (
                    item.get("content_type").strip()
                    if isinstance(item.get("content_type"), str)
                    and item.get("content_type").strip()
                    else None
                ),
            }
        )
    return normalized


def build_run_event(
    *,
    seq: int,
    event_type: str,
    source: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "seq": seq,
        "timestamp": now_iso(),
        "event_type": event_type,
        "source": source,
        "payload": payload,
    }
