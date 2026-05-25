"""Support helpers for hosted VM run/control API routes."""

from __future__ import annotations

import os
import threading
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, Request

from backend.src.services.vm_run_control import VmRunControlService

_VM_RUN_CONTROL_SERVICE_LOCK = threading.Lock()


def parse_positive_int(raw_value: Optional[str], default: int) -> int:
    if raw_value is None:
        return default
    try:
        parsed = int(raw_value.strip())
    except (ValueError, AttributeError):
        return default
    return parsed if parsed > 0 else default


def get_vm_run_control_service(request: Request) -> VmRunControlService:
    state = request.app.state
    service = getattr(state, "vm_run_control_service", None)
    if service is not None:
        return service
    with _VM_RUN_CONTROL_SERVICE_LOCK:
        service = getattr(state, "vm_run_control_service", None)
        if service is None:
            max_active_runs = parse_positive_int(
                os.getenv("WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE"),
                default=1,
            )
            service = VmRunControlService(max_active_runs_per_workspace=max_active_runs)
            state.vm_run_control_service = service
        return service


def normalize_optional_string(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def resolve_runs_api_key() -> Optional[str]:
    return normalize_optional_string(
        os.getenv("WINDIE_RUNS_API_KEY") or os.getenv("WINDIE_DEMO_API_KEY")
    )


def resolve_runs_control_api_key() -> Optional[str]:
    return normalize_optional_string(os.getenv("WINDIE_RUNS_CONTROL_API_KEY"))


def verify_runs_api_key(
    x_windie_runs_key: Optional[str] = Header(
        default=None,
        alias="x-windie-runs-key",
    ),
) -> None:
    expected_key = resolve_runs_api_key()
    if expected_key is None:
        raise HTTPException(
            status_code=503,
            detail="Runs API key is not configured",
        )
    if normalize_optional_string(x_windie_runs_key) != expected_key:
        raise HTTPException(status_code=401, detail="Invalid runs API key")


def verify_runs_control_api_key(
    x_windie_runs_control_key: Optional[str] = Header(
        default=None,
        alias="x-windie-runs-control-key",
    ),
) -> None:
    expected_key = resolve_runs_control_api_key()
    if expected_key is None:
        raise HTTPException(
            status_code=503,
            detail="Runs control API key is not configured",
        )
    if normalize_optional_string(x_windie_runs_control_key) != expected_key:
        raise HTTPException(status_code=403, detail="Invalid runs control API key")


def to_run_view_dict(run: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in run.items() if k != "events"}


def require_run(
    run: Optional[Dict[str, Any]], detail: str = "Run not found"
) -> Dict[str, Any]:
    if run is None:
        raise HTTPException(status_code=404, detail=detail)
    return run


def latest_run_event_dict(run: Dict[str, Any], missing_detail: str) -> Dict[str, Any]:
    events = run.get("events", [])
    if not events:
        raise HTTPException(status_code=500, detail=missing_detail)
    latest_event = events[-1]
    if not isinstance(latest_event, dict):
        raise HTTPException(status_code=500, detail=missing_detail)
    return latest_event
