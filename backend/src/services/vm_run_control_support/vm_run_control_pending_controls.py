"""Pending control command helpers for VmRunControlService."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional


def create_control_command(
    *,
    command_id: str,
    action: str,
    requested_by: Optional[str],
    control_mode: Optional[str],
    created_at: str,
) -> Dict[str, Any]:
    return {
        "command_id": command_id,
        "action": action,
        "requested_by": requested_by,
        "control_mode": control_mode,
        "created_at": created_at,
    }


def collect_pending_control_commands_for_worker(
    runs: Dict[str, Dict[str, Any]],
    *,
    worker_id: str,
) -> List[Dict[str, Any]]:
    commands: List[Dict[str, Any]] = []
    for run in runs.values():
        worker = run.get("worker")
        if not isinstance(worker, dict) or worker.get("worker_id") != worker_id:
            continue
        pending_commands = run.get("pending_controls", [])
        if not isinstance(pending_commands, list) or not pending_commands:
            continue
        for command in pending_commands:
            if not isinstance(command, dict):
                continue
            commands.append({"run_id": run["run_id"], **deepcopy(command)})
        run["pending_controls"] = []
    return commands
