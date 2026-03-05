"""Shared VM run-control event log mutation and read helpers."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional

from backend.src.services.vm_run_control_helpers import build_run_event


def append_run_event(
    run: dict[str, Any],
    *,
    event_type: str,
    source: str,
    payload: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Append one event to run log and update sequence/time metadata."""
    next_seq = int(run.get("last_event_seq", 0)) + 1
    event_payload = deepcopy(payload) if isinstance(payload, dict) else {}
    event = build_run_event(
        seq=next_seq,
        event_type=event_type,
        source=source,
        payload=event_payload,
    )
    run["events"].append(event)
    run["last_event_seq"] = next_seq
    run["updated_at"] = event["timestamp"]
    return event


def select_run_events(
    run: dict[str, Any],
    *,
    after_seq: int = 0,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Return deep-copied events after sequence boundary with bounded limit."""
    selected = [
        deepcopy(event)
        for event in run["events"]
        if int(event.get("seq", 0)) > max(after_seq, 0)
    ]
    return selected[: max(1, min(limit, 1000))]
