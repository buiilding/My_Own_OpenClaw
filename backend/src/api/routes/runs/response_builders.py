"""Helpers for projecting VM run-control service dictionaries into route models."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from .models import (
    CreateRunResponse,
    RunControlResponse,
    RunEvent,
    RunEventIngestResponse,
    RunView,
    WorkerAssignedRun,
    WorkerControlCommand,
    WorkerDispatchedResponse,
    WorkerHeartbeatResponse,
    WorkerPollHeartbeatResponse,
)
from .support import latest_run_event_dict, to_run_view_dict


def build_run_view(run: dict[str, Any]) -> RunView:
    return RunView(**to_run_view_dict(run))


def build_create_run_response(run: dict[str, Any]) -> CreateRunResponse:
    events = run.get("events", [])
    return CreateRunResponse(
        run=build_run_view(run),
        events=[RunEvent(**event) for event in events],
    )


def build_run_control_response(run: dict[str, Any], *, missing_detail: str) -> RunControlResponse:
    latest_event = RunEvent(
        **latest_run_event_dict(run, missing_detail=missing_detail)
    )
    return RunControlResponse(
        run=build_run_view(run),
        latest_event=latest_event,
    )


def build_worker_dispatched_response(run: dict[str, Any]) -> WorkerDispatchedResponse:
    latest_event = RunEvent(
        **latest_run_event_dict(run, missing_detail="Dispatch event not recorded")
    )
    return WorkerDispatchedResponse(
        run=build_run_view(run),
        latest_event=latest_event,
    )


def build_worker_heartbeat_response(run: dict[str, Any]) -> WorkerHeartbeatResponse:
    latest_event = RunEvent(
        **latest_run_event_dict(run, missing_detail="Worker heartbeat event not recorded")
    )
    return WorkerHeartbeatResponse(
        run=build_run_view(run),
        latest_event=latest_event,
    )


def build_ingested_run_event_response(result: dict[str, Any]) -> RunEventIngestResponse:
    run = result.get("run")
    latest_event = result.get("event")
    if not isinstance(run, dict) or not isinstance(latest_event, dict):
        raise HTTPException(status_code=500, detail="Run event was not persisted")
    return RunEventIngestResponse(
        run=build_run_view(run),
        latest_event=RunEvent(**latest_event),
    )


def build_worker_poll_heartbeat_response(result: dict[str, Any]) -> WorkerPollHeartbeatResponse:
    assigned_run = result.get("assigned_run")
    control_commands = result.get("control_commands", [])
    return WorkerPollHeartbeatResponse(
        worker=dict(result.get("worker", {})),
        assigned_run=WorkerAssignedRun(**assigned_run) if isinstance(assigned_run, dict) else None,
        control_commands=[WorkerControlCommand(**command) for command in control_commands],
    )
