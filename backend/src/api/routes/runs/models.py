"""Pydantic models used by the hosted VM run/control API routes."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


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


class StopAllRunsRequest(BaseModel):
    workspace_id: Optional[str] = None
    requested_by: Optional[str] = None


class StopAllRunsResponse(BaseModel):
    workspace_id: Optional[str] = None
    stopped_run_ids: List[str] = Field(default_factory=list)
    count: int


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


__all__ = [
    "CreateRunRequest",
    "CreateRunResponse",
    "RunControlRequest",
    "RunControlResponse",
    "RunEvent",
    "RunEventIngestRequest",
    "RunEventIngestResponse",
    "RunEventsResponse",
    "RunFileRef",
    "RunView",
    "StopAllRunsRequest",
    "StopAllRunsResponse",
    "WorkerAssignedRun",
    "WorkerControlCommand",
    "WorkerDispatchedRequest",
    "WorkerDispatchedResponse",
    "WorkerHeartbeatRequest",
    "WorkerHeartbeatResponse",
    "WorkerPollHeartbeatRequest",
    "WorkerPollHeartbeatResponse",
]
