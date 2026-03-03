"""Hosted VM run/control API routes for web dashboard integration."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.src.services.vm_run_control import VmRunControlService

router = APIRouter(prefix="/api/runs", tags=["runs"])


class RunFileRef(BaseModel):
    artifact_id: str = Field(min_length=1)
    filename: Optional[str] = None
    content_type: Optional[str] = None


class RunView(BaseModel):
    run_id: str
    workspace_id: str
    agent_id: Optional[str] = None
    conversation_ref: str
    query_message_id: Optional[str] = None
    query: str
    requested_by: Optional[str] = None
    files: List[RunFileRef] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: str
    control_mode: str
    worker: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str
    last_heartbeat_at: Optional[str] = None
    last_event_seq: int


class RunEvent(BaseModel):
    seq: int
    timestamp: str
    event_type: str
    source: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class CreateRunRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    query: str = Field(min_length=1)
    agent_id: Optional[str] = None
    requested_by: Optional[str] = None
    files: List[RunFileRef] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CreateRunResponse(BaseModel):
    run: RunView
    events: List[RunEvent] = Field(default_factory=list)


class RunControlRequest(BaseModel):
    action: Literal["pause", "resume", "stop", "set-control-mode"]
    requested_by: Optional[str] = None
    control_mode: Optional[Literal["agent_only", "shared_control", "human_override"]] = None


class RunControlResponse(BaseModel):
    run: RunView
    latest_event: RunEvent


class WorkerHeartbeatRequest(BaseModel):
    worker_id: str = Field(min_length=1)
    vm_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    agent_id: Optional[str] = None
    status: str = "ready"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkerHeartbeatResponse(BaseModel):
    run: RunView
    latest_event: RunEvent


class WorkerPollHeartbeatRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    worker_id: str = Field(min_length=1)
    vm_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    session_id: Optional[str] = None
    agent_id: Optional[str] = None
    status: str = "ready"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkerAssignedRun(BaseModel):
    run_id: str
    workspace_id: str
    agent_id: Optional[str] = None
    conversation_ref: str
    query: str
    requested_by: Optional[str] = None
    files: List[RunFileRef] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    control_mode: str


class WorkerControlCommand(BaseModel):
    run_id: str
    command_id: str
    action: str
    requested_by: Optional[str] = None
    control_mode: Optional[str] = None
    created_at: str


class WorkerPollHeartbeatResponse(BaseModel):
    worker: Dict[str, Any]
    assigned_run: Optional[WorkerAssignedRun] = None
    control_commands: List[WorkerControlCommand] = Field(default_factory=list)


class WorkerDispatchedRequest(BaseModel):
    worker_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    turn_ref: str = Field(min_length=1)
    conversation_ref: Optional[str] = None


class WorkerDispatchedResponse(BaseModel):
    run: RunView
    latest_event: RunEvent


class RunEventIngestRequest(BaseModel):
    event_type: str = Field(min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)
    source: str = "worker-stream"


class RunEventIngestResponse(BaseModel):
    run: RunView
    latest_event: RunEvent


class RunEventsResponse(BaseModel):
    run_id: str
    events: List[RunEvent] = Field(default_factory=list)
    next_after_seq: int


def get_vm_run_control_service(request: Request) -> VmRunControlService:
    state = request.app.state
    service = getattr(state, "vm_run_control_service", None)
    if service is None:
        service = VmRunControlService()
        state.vm_run_control_service = service
    return service


VmRunControlServiceDep = Annotated[VmRunControlService, Depends(get_vm_run_control_service)]


def _to_run_view(run: Dict[str, Any]) -> RunView:
    return RunView(**{k: v for k, v in run.items() if k != "events"})


@router.post("/", response_model=CreateRunResponse)
async def create_run(
    payload: CreateRunRequest,
    service: VmRunControlServiceDep,
) -> CreateRunResponse:
    run = await service.create_run(
        workspace_id=payload.workspace_id,
        query=payload.query,
        agent_id=payload.agent_id,
        requested_by=payload.requested_by,
        files=[file.model_dump() for file in payload.files],
        metadata=payload.metadata,
    )
    events = run.get("events", [])
    return CreateRunResponse(
        run=_to_run_view(run),
        events=[RunEvent(**event) for event in events],
    )


@router.post("/workers/heartbeat", response_model=WorkerPollHeartbeatResponse)
async def worker_poll_heartbeat(
    payload: WorkerPollHeartbeatRequest,
    service: VmRunControlServiceDep,
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
) -> RunView:
    run = await service.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_run_view(run)


@router.get("/{run_id}/events", response_model=RunEventsResponse)
async def list_run_events(
    run_id: str,
    service: VmRunControlServiceDep,
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
        run=_to_run_view(run),
        latest_event=RunEvent(**latest_event),
    )


@router.post("/{run_id}/control", response_model=RunControlResponse)
async def control_run(
    run_id: str,
    payload: RunControlRequest,
    service: VmRunControlServiceDep,
) -> RunControlResponse:
    if payload.action == "set-control-mode" and payload.control_mode is None:
        raise HTTPException(
            status_code=422,
            detail="control_mode is required when action is set-control-mode",
        )
    run = await service.apply_control(
        run_id,
        action=payload.action,
        requested_by=payload.requested_by,
        control_mode=payload.control_mode,
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    events = run.get("events", [])
    if not events:
        raise HTTPException(status_code=500, detail="Run control event not recorded")
    latest_event = events[-1]
    return RunControlResponse(
        run=_to_run_view(run),
        latest_event=RunEvent(**latest_event),
    )


@router.post("/{run_id}/worker-dispatched", response_model=WorkerDispatchedResponse)
async def worker_dispatched(
    run_id: str,
    payload: WorkerDispatchedRequest,
    service: VmRunControlServiceDep,
) -> WorkerDispatchedResponse:
    run = await service.acknowledge_run_dispatch(
        run_id,
        worker_id=payload.worker_id,
        user_id=payload.user_id,
        turn_ref=payload.turn_ref,
        conversation_ref=payload.conversation_ref,
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found or worker mismatch")
    events = run.get("events", [])
    if not events:
        raise HTTPException(status_code=500, detail="Dispatch event not recorded")
    latest_event = events[-1]
    return WorkerDispatchedResponse(
        run=_to_run_view(run),
        latest_event=RunEvent(**latest_event),
    )


@router.post("/{run_id}/worker-heartbeat", response_model=WorkerHeartbeatResponse)
async def worker_heartbeat(
    run_id: str,
    payload: WorkerHeartbeatRequest,
    service: VmRunControlServiceDep,
) -> WorkerHeartbeatResponse:
    run = await service.record_worker_heartbeat(
        run_id,
        worker_id=payload.worker_id,
        vm_id=payload.vm_id,
        session_id=payload.session_id,
        agent_id=payload.agent_id,
        status=payload.status,
        metadata=payload.metadata,
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    events = run.get("events", [])
    if not events:
        raise HTTPException(status_code=500, detail="Worker heartbeat event not recorded")
    latest_event = events[-1]
    return WorkerHeartbeatResponse(
        run=_to_run_view(run),
        latest_event=RunEvent(**latest_event),
    )
