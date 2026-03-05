"""Event payload builders for VmRunControlService."""

from __future__ import annotations

from typing import Any, Dict, Optional


def build_run_created_payload(
    *,
    run_id: str,
    workspace_id: str,
    agent_id: Optional[str],
    conversation_ref: str,
    status: str,
    control_mode: str,
) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "workspace_id": workspace_id,
        "agent_id": agent_id,
        "conversation_ref": conversation_ref,
        "status": status,
        "control_mode": control_mode,
    }


def build_worker_assigned_payload(
    *,
    worker_id: str,
    user_id: str,
    vm_id: str,
    session_id: Optional[str],
    agent_id: Optional[str],
    status: str,
) -> Dict[str, Any]:
    return {
        "worker_id": worker_id,
        "user_id": user_id,
        "vm_id": vm_id,
        "session_id": session_id,
        "agent_id": agent_id,
        "status": status,
    }


def build_run_control_payload(
    *,
    action: str,
    requested_by: Optional[str],
    control_mode: Optional[str],
    status: str,
    command_id: str,
    bulk: bool,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "action": action,
        "requested_by": requested_by,
        "control_mode": control_mode,
        "status": status,
        "command_id": command_id,
    }
    if bulk:
        payload["bulk"] = True
    return payload


def build_run_dispatched_payload(
    *,
    worker_id: str,
    user_id: str,
    turn_ref: str,
    conversation_ref: str,
) -> Dict[str, Any]:
    return {
        "worker_id": worker_id,
        "user_id": user_id,
        "turn_ref": turn_ref,
        "conversation_ref": conversation_ref,
    }
