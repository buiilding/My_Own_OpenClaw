"""In-memory run/control registry for hosted VM demo orchestration."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any, Dict, List, Optional
from uuid import uuid4

from backend.src.services.vm_run_control_helpers import (
    normalize_files,
    normalize_optional_string,
    now_iso,
)
from backend.src.services.vm_run_control_event_payloads import (
    build_run_control_payload,
    build_run_created_payload,
    build_run_dispatched_payload,
)
from backend.src.services.vm_run_control_event_log import (
    append_run_event,
    select_run_events,
)
from backend.src.services.vm_run_control_assignment import assign_next_run_to_worker
from backend.src.services.vm_run_control_pending_controls import (
    collect_pending_control_commands_for_worker,
    create_control_command,
)
from backend.src.services.vm_run_control_worker_state import (
    build_registry_worker_state,
    build_run_worker_state,
    build_worker_heartbeat_event_payload,
)
from backend.src.services.vm_run_control_transitions import (
    apply_control_transition,
    apply_stream_event_transition,
    apply_worker_heartbeat_transition,
    normalize_control_action,
)


class VmRunControlService:
    """Store and mutate VM-backed run state for web dashboard integration."""

    _READY_WORKER_STATUSES = frozenset({"ready", "running"})
    _TERMINAL_EVENT_TO_STATUS = {
        "streaming-complete": "completed",
        "error": "failed",
    }
    _ACTIVE_STATUSES = frozenset({"awaiting_worker", "queued", "running", "paused"})

    def __init__(self, *, max_active_runs_per_workspace: int = 1) -> None:
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._workers: Dict[str, Dict[str, Any]] = {}
        self._workspace_run_queues: Dict[str, List[str]] = {}
        self._lock = asyncio.Lock()
        self._max_active_runs_per_workspace = max(1, int(max_active_runs_per_workspace))

    @staticmethod
    def _clone_run(run: Dict[str, Any]) -> Dict[str, Any]:
        return deepcopy(run)

    def _append_event_locked(
        self,
        run: Dict[str, Any],
        *,
        event_type: str,
        source: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return append_run_event(
            run,
            event_type=event_type,
            source=source,
            payload=payload,
        )

    def _enqueue_run_locked(self, workspace_id: str, run_id: str) -> None:
        queue = self._workspace_run_queues.setdefault(workspace_id, [])
        queue.append(run_id)

    def _count_active_runs_locked(self, workspace_id: str) -> int:
        return sum(
            1
            for run in self._runs.values()
            if run.get("workspace_id") == workspace_id
            and run.get("status") in self._ACTIVE_STATUSES
        )

    def _assign_next_run_to_worker_locked(
        self,
        *,
        workspace_id: str,
        worker_id: str,
        user_id: str,
        vm_id: str,
        session_id: Optional[str],
        agent_id: Optional[str],
        worker_status: str,
    ) -> Optional[Dict[str, Any]]:
        queue = self._workspace_run_queues.get(workspace_id, [])
        return assign_next_run_to_worker(
            runs=self._runs,
            workers=self._workers,
            workspace_queue=queue,
            worker_id=worker_id,
            user_id=user_id,
            vm_id=vm_id,
            session_id=session_id,
            agent_id=agent_id,
            worker_status=worker_status,
            ready_worker_statuses=self._READY_WORKER_STATUSES,
            now_iso=now_iso,
            append_event=self._append_event_locked,
            clone_run=self._clone_run,
        )

    def _collect_pending_control_commands_locked(self, worker_id: str) -> List[Dict[str, Any]]:
        return collect_pending_control_commands_for_worker(self._runs, worker_id=worker_id)

    def _enqueue_control_command_locked(
        self,
        run: Dict[str, Any],
        *,
        action: str,
        requested_by: Optional[str],
        control_mode: Optional[str],
        bulk: bool = False,
    ) -> Dict[str, Any]:
        command = create_control_command(
            command_id=str(uuid4()),
            action=action,
            requested_by=requested_by,
            control_mode=control_mode,
            created_at=now_iso(),
        )
        run.setdefault("pending_controls", []).append(command)
        self._append_event_locked(
            run,
            event_type="run-control",
            source="api",
            payload=build_run_control_payload(
                action=action,
                requested_by=requested_by,
                control_mode=control_mode,
                status=run["status"],
                command_id=command["command_id"],
                bulk=bulk,
            ),
        )
        return command

    def _append_event_for_run_locked(
        self,
        run_id: str,
        *,
        event_type: str,
        source: str,
        payload: Optional[Dict[str, Any]],
    ) -> Optional[tuple[Dict[str, Any], Dict[str, Any]]]:
        run = self._runs.get(run_id)
        if not run:
            return None
        event = self._append_event_locked(
            run,
            event_type=event_type,
            source=source,
            payload=payload,
        )
        return run, event

    async def create_run(
        self,
        *,
        workspace_id: str,
        query: str,
        agent_id: Optional[str] = None,
        requested_by: Optional[str] = None,
        files: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        async with self._lock:
            active_runs = self._count_active_runs_locked(workspace_id)
            if active_runs >= self._max_active_runs_per_workspace:
                raise ValueError(
                    "Active run limit reached for workspace "
                    f"'{workspace_id}' ({self._max_active_runs_per_workspace})."
                )

            run_id = str(uuid4())
            now = now_iso()
            normalized_metadata = deepcopy(metadata) if isinstance(metadata, dict) else {}
            explicit_conversation_ref = normalize_optional_string(
                normalized_metadata.get("conversation_ref")
            )
            conversation_ref = explicit_conversation_ref or f"run-{run_id}"

            run: Dict[str, Any] = {
                "run_id": run_id,
                "workspace_id": workspace_id,
                "agent_id": agent_id,
                "conversation_ref": conversation_ref,
                "query_message_id": None,
                "query": query,
                "requested_by": requested_by,
                "files": normalize_files(files),
                "metadata": normalized_metadata,
                "status": "awaiting_worker",
                "control_mode": "agent_only",
                "worker": None,
                "pending_controls": [],
                "created_at": now,
                "updated_at": now,
                "last_heartbeat_at": None,
                "last_event_seq": 0,
                "events": [],
            }
            self._append_event_locked(
                run,
                event_type="run-created",
                source="api",
                payload=build_run_created_payload(
                    run_id=run_id,
                    workspace_id=workspace_id,
                    agent_id=agent_id,
                    conversation_ref=conversation_ref,
                    status=run["status"],
                    control_mode=run["control_mode"],
                ),
            )
            self._runs[run_id] = run
            self._enqueue_run_locked(workspace_id, run_id)
            return self._clone_run(run)

    async def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            run = self._runs.get(run_id)
            return self._clone_run(run) if run else None

    async def list_events(
        self,
        run_id: str,
        *,
        after_seq: int = 0,
        limit: int = 200,
    ) -> Optional[List[Dict[str, Any]]]:
        async with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return None
            return select_run_events(
                run,
                after_seq=after_seq,
                limit=limit,
            )

    async def append_event(
        self,
        run_id: str,
        *,
        event_type: str,
        source: str = "backend",
        payload: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            appended = self._append_event_for_run_locked(
                run_id,
                event_type=event_type,
                source=source,
                payload=payload,
            )
            if appended is None:
                return None
            _, event = appended
            return deepcopy(event)

    async def append_stream_event(
        self,
        run_id: str,
        *,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        source: str = "worker-stream",
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            appended = self._append_event_for_run_locked(
                run_id,
                event_type=event_type,
                source=source,
                payload=payload,
            )
            if appended is None:
                return None
            run, event = appended

            apply_stream_event_transition(
                run,
                event_type=event_type,
                terminal_event_to_status=self._TERMINAL_EVENT_TO_STATUS,
            )
            return {
                "run": self._clone_run(run),
                "event": deepcopy(event),
            }

    async def apply_control(
        self,
        run_id: str,
        *,
        action: str,
        requested_by: Optional[str] = None,
        control_mode: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return None

            normalized_action = normalize_control_action(action)
            apply_control_transition(
                run,
                action=normalized_action,
                control_mode=control_mode,
            )

            command = self._enqueue_control_command_locked(
                run,
                action=normalized_action,
                requested_by=requested_by,
                control_mode=run["control_mode"],
            )
            return self._clone_run(run)

    async def stop_all_runs(
        self,
        *,
        workspace_id: Optional[str] = None,
        requested_by: Optional[str] = None,
    ) -> List[str]:
        async with self._lock:
            stopped_run_ids: List[str] = []
            normalized_workspace_id = normalize_optional_string(workspace_id)
            for run in self._runs.values():
                if (
                    normalized_workspace_id is not None
                    and run.get("workspace_id") != normalized_workspace_id
                ):
                    continue
                if run.get("status") not in self._ACTIVE_STATUSES:
                    continue

                run["status"] = "stopped"
                self._enqueue_control_command_locked(
                    run,
                    action="stop",
                    requested_by=requested_by,
                    control_mode=run.get("control_mode"),
                    bulk=True,
                )
                stopped_run_ids.append(str(run.get("run_id")))
            return stopped_run_ids

    async def register_worker_heartbeat(
        self,
        *,
        workspace_id: str,
        worker_id: str,
        vm_id: str,
        user_id: str,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        status: str = "ready",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        async with self._lock:
            now = now_iso()
            worker = build_registry_worker_state(
                worker_id=worker_id,
                workspace_id=workspace_id,
                vm_id=vm_id,
                user_id=user_id,
                session_id=session_id,
                agent_id=agent_id,
                status=status,
                metadata=metadata,
                last_heartbeat_at=now,
            )
            self._workers[worker_id] = worker

            assigned_run = self._assign_next_run_to_worker_locked(
                workspace_id=workspace_id,
                worker_id=worker_id,
                user_id=user_id,
                vm_id=vm_id,
                session_id=session_id,
                agent_id=agent_id,
                worker_status=status,
            )

            control_commands = self._collect_pending_control_commands_locked(worker_id)
            return {
                "worker": deepcopy(worker),
                "assigned_run": assigned_run,
                "control_commands": control_commands,
            }

    async def acknowledge_run_dispatch(
        self,
        run_id: str,
        *,
        worker_id: str,
        user_id: str,
        turn_ref: str,
        conversation_ref: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return None
            worker = run.get("worker")
            if not isinstance(worker, dict) or worker.get("worker_id") != worker_id:
                return None
            if worker.get("user_id") not in {None, user_id}:
                return None

            run["status"] = "running"
            run["query_message_id"] = turn_ref
            normalized_conversation_ref = normalize_optional_string(conversation_ref)
            if normalized_conversation_ref:
                run["conversation_ref"] = normalized_conversation_ref
            self._append_event_locked(
                run,
                event_type="run-dispatched",
                source="worker",
                payload=build_run_dispatched_payload(
                    worker_id=worker_id,
                    user_id=user_id,
                    turn_ref=turn_ref,
                    conversation_ref=run["conversation_ref"],
                ),
            )
            return self._clone_run(run)

    async def record_worker_heartbeat(
        self,
        run_id: str,
        *,
        worker_id: str,
        vm_id: str,
        session_id: str,
        agent_id: Optional[str] = None,
        status: str = "ready",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Backward-compatible run-scoped heartbeat used by earlier tests/routes."""
        async with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return None
            now = now_iso()
            existing_worker = self._workers.get(worker_id, {})
            worker_user_id = normalize_optional_string(existing_worker.get("user_id"))
            worker_workspace_id = normalize_optional_string(existing_worker.get("workspace_id"))
            run["worker"] = build_run_worker_state(
                worker_id=worker_id,
                vm_id=vm_id,
                session_id=session_id,
                agent_id=agent_id,
                user_id=worker_user_id,
                status=status,
                metadata=metadata,
                last_heartbeat_at=now,
            )
            run["last_heartbeat_at"] = now
            apply_worker_heartbeat_transition(
                run,
                status=status,
                ready_worker_statuses=self._READY_WORKER_STATUSES,
            )

            self._workers[worker_id] = build_registry_worker_state(
                worker_id=worker_id,
                workspace_id=worker_workspace_id or run.get("workspace_id"),
                vm_id=vm_id,
                user_id=worker_user_id,
                session_id=session_id,
                agent_id=agent_id,
                status=status,
                metadata=metadata,
                last_heartbeat_at=now,
            )

            self._append_event_locked(
                run,
                event_type="worker-heartbeat",
                source="worker",
                payload=build_worker_heartbeat_event_payload(
                    worker_id=worker_id,
                    vm_id=vm_id,
                    session_id=session_id,
                    agent_id=agent_id,
                    status=status,
                ),
            )
            return self._clone_run(run)
