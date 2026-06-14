"""Covers run control response builders behavior in the backend test suite."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.src.api.routes.runs.response_builders import (
    build_ingested_run_event_response,
    build_run_control_response,
    build_worker_dispatched_response,
    build_worker_poll_heartbeat_response,
)
from backend.src.services.vm_run_control import VmRunControlService


@pytest.mark.asyncio
async def test_build_run_control_response_projects_run_and_latest_event() -> None:
    service = VmRunControlService()
    run = await service.create_run(workspace_id="workspace-1", query="run this")
    await service.apply_control(run["run_id"], action="pause")
    updated_run = await service.get_run(run["run_id"])
    assert updated_run is not None

    response = build_run_control_response(
        updated_run,
        missing_detail="Run control event not recorded",
    )

    assert response.run.run_id == run["run_id"]
    assert response.latest_event.event_type == "run-control"


def test_build_ingested_run_event_response_rejects_missing_run_or_event() -> None:
    with pytest.raises(HTTPException) as exc_info:
        build_ingested_run_event_response({"run": {"run_id": "x"}, "event": None})

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Run event was not persisted"


def test_build_worker_poll_heartbeat_response_handles_empty_assignment() -> None:
    response = build_worker_poll_heartbeat_response(
        {
            "worker": {"worker_id": "worker-1"},
            "assigned_run": None,
            "control_commands": [],
        }
    )

    assert response.worker["worker_id"] == "worker-1"
    assert response.assigned_run is None
    assert response.control_commands == []


@pytest.mark.asyncio
async def test_build_worker_dispatched_response_uses_dispatch_latest_event() -> None:
    service = VmRunControlService()
    run = await service.create_run(workspace_id="workspace-1", query="run this")
    await service.register_worker_heartbeat(
        workspace_id="workspace-1",
        worker_id="worker-1",
        vm_id="vm-1",
        user_id="user-1",
        session_id="session-1",
        status="running",
    )
    await service.acknowledge_run_dispatch(
        run["run_id"],
        worker_id="worker-1",
        user_id="user-1",
        turn_ref="turn-1",
    )
    updated_run = await service.get_run(run["run_id"])
    assert updated_run is not None

    response = build_worker_dispatched_response(updated_run)

    assert response.latest_event.event_type == "run-dispatched"
