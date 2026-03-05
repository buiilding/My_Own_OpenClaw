"""Worker assignment helpers for VM run-control queues."""

from __future__ import annotations

from typing import Any, Callable, Optional

from backend.src.services.vm_run_control_event_payloads import build_worker_assigned_payload
from backend.src.services.vm_run_control_worker_state import build_run_worker_state


def assign_next_run_to_worker(
    *,
    runs: dict[str, dict[str, Any]],
    workers: dict[str, dict[str, Any]],
    workspace_queue: list[str],
    worker_id: str,
    user_id: str,
    vm_id: str,
    session_id: Optional[str],
    agent_id: Optional[str],
    worker_status: str,
    ready_worker_statuses: frozenset[str],
    now_iso: Callable[[], str],
    append_event: Callable[..., dict[str, Any]],
    clone_run: Callable[[dict[str, Any]], dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Assign next eligible queued run to worker and append assignment event."""
    if worker_status not in ready_worker_statuses:
        return None

    while workspace_queue:
        run_id = workspace_queue.pop(0)
        run = runs.get(run_id)
        if not run:
            continue
        if run.get("status") not in {"awaiting_worker", "queued"}:
            continue
        assigned_worker = run.get("worker")
        if isinstance(assigned_worker, dict) and assigned_worker.get("worker_id") not in {
            None,
            worker_id,
        }:
            continue

        now = now_iso()
        run["worker"] = build_run_worker_state(
            worker_id=worker_id,
            vm_id=vm_id,
            session_id=session_id,
            agent_id=agent_id,
            user_id=user_id,
            status=worker_status,
            metadata=workers.get(worker_id, {}).get("metadata", {}),
            last_heartbeat_at=now,
        )
        run["last_heartbeat_at"] = now
        run["status"] = "queued"
        append_event(
            run,
            event_type="run-worker-assigned",
            source="backend",
            payload=build_worker_assigned_payload(
                worker_id=worker_id,
                user_id=user_id,
                vm_id=vm_id,
                session_id=session_id,
                agent_id=agent_id,
                status=run["status"],
            ),
        )
        return clone_run(run)

    return None
