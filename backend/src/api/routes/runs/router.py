"""Hosted VM run/control API routes for web dashboard integration."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from .models import (
    CreateRunRequest,
    CreateRunResponse,
    RunControlRequest,
    RunControlResponse,
    RunEvent,
    RunEventIngestRequest,
    RunEventIngestResponse,
    RunEventsResponse,
    RunFileRef,
    RunView,
    StopAllRunsRequest,
    StopAllRunsResponse,
    WorkerAssignedRun,
    WorkerControlCommand,
    WorkerDispatchedRequest,
    WorkerDispatchedResponse,
    WorkerHeartbeatRequest,
    WorkerHeartbeatResponse,
    WorkerPollHeartbeatRequest,
    WorkerPollHeartbeatResponse,
)
from .support import (
    get_vm_run_control_service,
    latest_run_event_dict,
    require_run,
    to_run_view_dict,
    verify_runs_api_key,
)
from backend.src.services.vm_run_control import VmRunControlService

router = APIRouter(prefix="/api/runs", tags=["runs"])

VmRunControlServiceDep = Annotated[VmRunControlService, Depends(get_vm_run_control_service)]

RunsApiKeyDep = Annotated[None, Depends(verify_runs_api_key)]


@router.post("/", response_model=CreateRunResponse)
async def create_run(
    payload: CreateRunRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> CreateRunResponse:
    try:
        run = await service.create_run(
            workspace_id=payload.workspace_id,
            query=payload.query,
            agent_id=payload.agent_id,
            requested_by=payload.requested_by,
            files=[file.model_dump() for file in payload.files],
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    events = run.get("events", [])
    return CreateRunResponse(
        run=RunView(**to_run_view_dict(run)),
        events=[RunEvent(**event) for event in events],
    )


@router.post("/workers/heartbeat", response_model=WorkerPollHeartbeatResponse)
async def worker_poll_heartbeat(
    payload: WorkerPollHeartbeatRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> WorkerPollHeartbeatResponse:
    result = await service.register_worker_heartbeat(
        workspace_id=payload.workspace_id,
        worker_id=payload.worker_id,
        vm_id=payload.vm_id,
        user_id=payload.user_id,
        session_id=payload.session_id,
        agent_id=payload.agent_id,
        status=payload.status,
        metadata=payload.metadata,
    )
    assigned_run = result.get("assigned_run")
    control_commands = result.get("control_commands", [])
    return WorkerPollHeartbeatResponse(
        worker=dict(result.get("worker", {})),
        assigned_run=WorkerAssignedRun(**assigned_run) if isinstance(assigned_run, dict) else None,
        control_commands=[WorkerControlCommand(**command) for command in control_commands],
    )


@router.get("/{run_id}", response_model=RunView)
async def get_run(
    run_id: str,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> RunView:
    return RunView(**to_run_view_dict(require_run(await service.get_run(run_id))))


@router.get("/{run_id}/events", response_model=RunEventsResponse)
async def list_run_events(
    run_id: str,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
    after_seq: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
) -> RunEventsResponse:
    events = await service.list_events(run_id, after_seq=after_seq, limit=limit)
    if events is None:
        raise HTTPException(status_code=404, detail="Run not found")
    next_after_seq = after_seq
    if events:
        next_after_seq = int(events[-1]["seq"])
    return RunEventsResponse(
        run_id=run_id,
        events=[RunEvent(**event) for event in events],
        next_after_seq=next_after_seq,
    )


@router.post("/{run_id}/events", response_model=RunEventIngestResponse)
async def ingest_run_event(
    run_id: str,
    payload: RunEventIngestRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> RunEventIngestResponse:
    result = await service.append_stream_event(
        run_id,
        event_type=payload.event_type,
        payload=payload.payload,
        source=payload.source,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Run not found")
    run = result.get("run")
    latest_event = result.get("event")
    if not isinstance(run, dict) or not isinstance(latest_event, dict):
        raise HTTPException(status_code=500, detail="Run event was not persisted")
    return RunEventIngestResponse(
        run=RunView(**to_run_view_dict(run)),
        latest_event=RunEvent(**latest_event),
    )


@router.post("/{run_id}/control", response_model=RunControlResponse)
async def control_run(
    run_id: str,
    payload: RunControlRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> RunControlResponse:
    if payload.action == "set-control-mode" and payload.control_mode is None:
        raise HTTPException(
            status_code=422,
            detail="control_mode is required when action is set-control-mode",
        )
    run = require_run(await service.apply_control(
        run_id,
        action=payload.action,
        requested_by=payload.requested_by,
        control_mode=payload.control_mode,
    ))
    return RunControlResponse(
        run=RunView(**to_run_view_dict(run)),
        latest_event=RunEvent(
            **latest_run_event_dict(run, missing_detail="Run control event not recorded")
        ),
    )


@router.post("/stop-all", response_model=StopAllRunsResponse)
async def stop_all_runs(
    payload: StopAllRunsRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> StopAllRunsResponse:
    stopped_run_ids = await service.stop_all_runs(
        workspace_id=payload.workspace_id,
        requested_by=payload.requested_by,
    )
    return StopAllRunsResponse(
        workspace_id=payload.workspace_id,
        stopped_run_ids=stopped_run_ids,
        count=len(stopped_run_ids),
    )


@router.post("/{run_id}/worker-dispatched", response_model=WorkerDispatchedResponse)
async def worker_dispatched(
    run_id: str,
    payload: WorkerDispatchedRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> WorkerDispatchedResponse:
    run = require_run(await service.acknowledge_run_dispatch(
        run_id,
        worker_id=payload.worker_id,
        user_id=payload.user_id,
        turn_ref=payload.turn_ref,
        conversation_ref=payload.conversation_ref,
    ), detail="Run not found or worker mismatch")
    return WorkerDispatchedResponse(
        run=RunView(**to_run_view_dict(run)),
        latest_event=RunEvent(
            **latest_run_event_dict(run, missing_detail="Dispatch event not recorded")
        ),
    )


@router.post("/{run_id}/worker-heartbeat", response_model=WorkerHeartbeatResponse)
async def worker_heartbeat(
    run_id: str,
    payload: WorkerHeartbeatRequest,
    service: VmRunControlServiceDep,
    _api_key: RunsApiKeyDep = None,
) -> WorkerHeartbeatResponse:
    run = require_run(await service.record_worker_heartbeat(
        run_id,
        worker_id=payload.worker_id,
        vm_id=payload.vm_id,
        session_id=payload.session_id,
        agent_id=payload.agent_id,
        status=payload.status,
        metadata=payload.metadata,
    ))
    return WorkerHeartbeatResponse(
        run=RunView(**to_run_view_dict(run)),
        latest_event=RunEvent(
            **latest_run_event_dict(run, missing_detail="Worker heartbeat event not recorded")
        ),
    )
