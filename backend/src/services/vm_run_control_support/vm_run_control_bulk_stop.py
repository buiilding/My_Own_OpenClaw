"""Bulk stop helpers for VmRunControlService."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Set

from backend.src.services.vm_run_control_support.vm_run_control_helpers import (
    normalize_optional_string,
)


def stop_active_runs(
    runs: Dict[str, Dict[str, Any]],
    *,
    workspace_id: Optional[str],
    active_statuses: Set[str] | frozenset[str],
    on_stop: Callable[[Dict[str, Any]], None],
) -> List[str]:
    """Stop active runs in place and invoke `on_stop` for each stopped run."""
    stopped_run_ids: List[str] = []
    normalized_workspace_id = normalize_optional_string(workspace_id)

    for run in runs.values():
        if (
            normalized_workspace_id is not None
            and run.get("workspace_id") != normalized_workspace_id
        ):
            continue
        if run.get("status") not in active_statuses:
            continue

        run["status"] = "stopped"
        on_stop(run)
        stopped_run_ids.append(str(run.get("run_id")))

    return stopped_run_ids

