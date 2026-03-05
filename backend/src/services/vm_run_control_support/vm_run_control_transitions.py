"""Status transition helpers for VmRunControlService."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional, Set


def normalize_control_action(action: str) -> str:
    return action.strip().lower()


def apply_control_transition(
    run: Dict[str, Any],
    *,
    action: str,
    control_mode: Optional[str],
) -> None:
    if action == "pause":
        run["status"] = "paused"
    elif action == "resume":
        run["status"] = "running" if run.get("worker") else "awaiting_worker"
    elif action == "stop":
        run["status"] = "stopped"
    elif action == "set-control-mode" and control_mode:
        run["control_mode"] = control_mode


def apply_stream_event_transition(
    run: Dict[str, Any],
    *,
    event_type: str,
    terminal_event_to_status: Mapping[str, str],
) -> None:
    if event_type in terminal_event_to_status:
        run["status"] = terminal_event_to_status[event_type]
    elif run.get("status") in {"awaiting_worker", "queued"}:
        run["status"] = "running"


def apply_worker_heartbeat_transition(
    run: Dict[str, Any],
    *,
    status: str,
    ready_worker_statuses: Set[str] | frozenset[str],
) -> None:
    if run.get("status") in {"awaiting_worker", "queued"} and status in ready_worker_statuses:
        run["status"] = "running"
