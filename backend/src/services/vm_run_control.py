"""In-memory run/control registry for hosted VM demo orchestration."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class VmRunControlService:
    """Store and mutate VM-backed run state for web dashboard integration."""

    _READY_WORKER_STATUSES = frozenset({"ready", "running"})
    _TERMINAL_EVENT_TO_STATUS = {
        "streaming-complete": "completed",
        "error": "failed",
    }

    def __init__(self) -> None:
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._workers: Dict[str, Dict[str, Any]] = {}
        self._workspace_run_queues: Dict[str, List[str]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _normalize_files(files: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
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

    @staticmethod
    def _build_event(
        *,
        seq: int,
        event_type: str,
        source: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "seq": seq,
            "timestamp": _now_iso(),
            "event_type": event_type,
            "source": source,
            "payload": payload,
        }

    @staticmethod
    def _clone_run(run: Dict[str, Any]) -> Dict[str, Any]:
        return deepcopy(run)

    @staticmethod
    def _normalize_optional_string(value: Optional[str]) -> Optional[str]:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized if normalized else None

    def _append_event_locked(
        self,
        run: Dict[str, Any],
        *,
        event_type: str,
        source: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        next_seq = int(run.get("last_event_seq", 0)) + 1
        event_payload = deepcopy(payload) if isinstance(payload, dict) else {}
        event = self._build_event(
            seq=next_seq,
            event_type=event_type,
            source=source,
            payload=event_payload,
        )
        run["events"].append(event)
        run["last_event_seq"] = next_seq
        run["updated_at"] = event["timestamp"]
        return event

    def _enqueue_run_locked(self, workspace_id: str, run_id: str) -> None:
        queue = self._workspace_run_queues.setdefault(workspace_id, [])
        queue.append(run_id)

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
        if worker_status not in self._READY_WORKER_STATUSES:
            return None

        queue = self._workspace_run_queues.get(workspace_id, [])
        while queue:
            run_id = queue.pop(0)
            run = self._runs.get(run_id)
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

            now = _now_iso()
            run["worker"] = {
                "worker_id": worker_id,
                "vm_id": vm_id,
                "session_id": session_id,
                "agent_id": agent_id,
                "user_id": user_id,
                "status": worker_status,
                "metadata": deepcopy(self._workers.get(worker_id, {}).get("metadata", {})),
                "last_heartbeat_at": now,
            }
            run["last_heartbeat_at"] = now
            run["status"] = "queued"
            self._append_event_locked(
                run,
                event_type="run-worker-assigned",
                source="backend",
                payload={
                    "worker_id": worker_id,
                    "user_id": user_id,
                    "vm_id": vm_id,
                    "session_id": session_id,
                    "agent_id": agent_id,
                    "status": run["status"],
                },
            )
            return self._clone_run(run)

        return None

    def _collect_pending_control_commands_locked(self, worker_id: str) -> List[Dict[str, Any]]:
        commands: List[Dict[str, Any]] = []
        for run in self._runs.values():
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
            run_id = str(uuid4())
            now = _now_iso()
            normalized_metadata = deepcopy(metadata) if isinstance(metadata, dict) else {}
            explicit_conversation_ref = self._normalize_optional_string(
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
                "files": self._normalize_files(files),
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
                payload={
                    "run_id": run_id,
                    "workspace_id": workspace_id,
                    "agent_id": agent_id,
                    "conversation_ref": conversation_ref,
                    "status": run["status"],
                    "control_mode": run["control_mode"],
                },
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
            selected = [
                deepcopy(event)
                for event in run["events"]
                if int(event.get("seq", 0)) > max(after_seq, 0)
            ]
            return selected[: max(1, min(limit, 1000))]

    async def append_event(
        self,
        run_id: str,
        *,
        event_type: str,
        source: str = "backend",
        payload: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return None
            event = self._append_event_locked(
                run,
                event_type=event_type,
                source=source,
                payload=payload,
            )
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
            run = self._runs.get(run_id)
            if not run:
                return None

            event = self._append_event_locked(
                run,
                event_type=event_type,
                source=source,
                payload=payload,
            )
            if event_type in self._TERMINAL_EVENT_TO_STATUS:
                run["status"] = self._TERMINAL_EVENT_TO_STATUS[event_type]
            elif run.get("status") in {"awaiting_worker", "queued"}:
                run["status"] = "running"
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

            normalized_action = action.strip().lower()
            if normalized_action == "pause":
                run["status"] = "paused"
            elif normalized_action == "resume":
                run["status"] = "running" if run.get("worker") else "awaiting_worker"
            elif normalized_action == "stop":
                run["status"] = "stopped"
            elif normalized_action == "set-control-mode" and control_mode:
                run["control_mode"] = control_mode

            command = {
                "command_id": str(uuid4()),
                "action": normalized_action,
                "requested_by": requested_by,
                "control_mode": control_mode,
                "created_at": _now_iso(),
            }
            run.setdefault("pending_controls", []).append(command)
            self._append_event_locked(
                run,
                event_type="run-control",
                source="api",
                payload={
                    "action": normalized_action,
                    "requested_by": requested_by,
                    "control_mode": run["control_mode"],
                    "status": run["status"],
                    "command_id": command["command_id"],
                },
            )
            return self._clone_run(run)

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
            now = _now_iso()
            worker = {
                "worker_id": worker_id,
                "workspace_id": workspace_id,
                "vm_id": vm_id,
                "user_id": user_id,
                "session_id": session_id,
                "agent_id": agent_id,
                "status": status,
                "metadata": deepcopy(metadata) if isinstance(metadata, dict) else {},
                "last_heartbeat_at": now,
            }
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
            normalized_conversation_ref = self._normalize_optional_string(conversation_ref)
            if normalized_conversation_ref:
                run["conversation_ref"] = normalized_conversation_ref
            self._append_event_locked(
                run,
                event_type="run-dispatched",
                source="worker",
                payload={
                    "worker_id": worker_id,
                    "user_id": user_id,
                    "turn_ref": turn_ref,
                    "conversation_ref": run["conversation_ref"],
                },
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
            now = _now_iso()
            existing_worker = self._workers.get(worker_id, {})
            worker_user_id = self._normalize_optional_string(existing_worker.get("user_id"))
            worker_workspace_id = self._normalize_optional_string(existing_worker.get("workspace_id"))
            run["worker"] = {
                "worker_id": worker_id,
                "vm_id": vm_id,
                "session_id": session_id,
                "agent_id": agent_id,
                "user_id": worker_user_id,
                "status": status,
                "metadata": deepcopy(metadata) if isinstance(metadata, dict) else {},
                "last_heartbeat_at": now,
            }
            run["last_heartbeat_at"] = now
            if run["status"] in {"awaiting_worker", "queued"} and status in self._READY_WORKER_STATUSES:
                run["status"] = "running"

            self._workers[worker_id] = {
                "worker_id": worker_id,
                "workspace_id": worker_workspace_id or run.get("workspace_id"),
                "vm_id": vm_id,
                "user_id": worker_user_id,
                "session_id": session_id,
                "agent_id": agent_id,
                "status": status,
                "metadata": deepcopy(metadata) if isinstance(metadata, dict) else {},
                "last_heartbeat_at": now,
            }

            self._append_event_locked(
                run,
                event_type="worker-heartbeat",
                source="worker",
                payload={
                    "worker_id": worker_id,
                    "vm_id": vm_id,
                    "session_id": session_id,
                    "agent_id": agent_id,
                    "status": status,
                },
            )
            return self._clone_run(run)
