"""Worker state shaping helpers for VmRunControlService."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional


def _normalize_optional_string(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def _normalize_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return deepcopy(metadata) if isinstance(metadata, dict) else {}


def build_run_worker_state(
    *,
    worker_id: str,
    vm_id: str,
    session_id: Optional[str],
    agent_id: Optional[str],
    user_id: Optional[str],
    status: str,
    metadata: Optional[Dict[str, Any]],
    last_heartbeat_at: str,
) -> Dict[str, Any]:
    return {
        "worker_id": worker_id,
        "vm_id": vm_id,
        "session_id": session_id,
        "agent_id": agent_id,
        "user_id": _normalize_optional_string(user_id),
        "status": status,
        "metadata": _normalize_metadata(metadata),
        "last_heartbeat_at": last_heartbeat_at,
    }


def build_registry_worker_state(
    *,
    worker_id: str,
    workspace_id: Optional[str],
    vm_id: str,
    user_id: Optional[str],
    session_id: Optional[str],
    agent_id: Optional[str],
    status: str,
    metadata: Optional[Dict[str, Any]],
    last_heartbeat_at: str,
) -> Dict[str, Any]:
    return {
        "worker_id": worker_id,
        "workspace_id": _normalize_optional_string(workspace_id),
        "vm_id": vm_id,
        "user_id": _normalize_optional_string(user_id),
        "session_id": session_id,
        "agent_id": agent_id,
        "status": status,
        "metadata": _normalize_metadata(metadata),
        "last_heartbeat_at": last_heartbeat_at,
    }


def build_worker_heartbeat_event_payload(
    *,
    worker_id: str,
    vm_id: str,
    session_id: Optional[str],
    agent_id: Optional[str],
    status: str,
) -> Dict[str, Any]:
    return {
        "worker_id": worker_id,
        "vm_id": vm_id,
        "session_id": session_id,
        "agent_id": agent_id,
        "status": status,
    }
