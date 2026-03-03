from __future__ import annotations

import pytest
from fastapi import HTTPException
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes import runs as runs_routes
from backend.src.services.vm_run_control import VmRunControlService

restore_route_deps_shim(_original_deps)


@pytest.mark.asyncio
async def test_create_run_returns_initial_state_and_created_event() -> None:
    service = VmRunControlService()
    payload = runs_routes.CreateRunRequest(
        workspace_id="workspace-demo",
        query="apply this internship job for me",
        requested_by="user_123",
        files=[
            runs_routes.RunFileRef(
                artifact_id="resume-1.png",
                filename="resume.pdf",
                content_type="application/pdf",
            )
        ],
    )

    response = await runs_routes.create_run(payload, service=service)

    assert response.run.workspace_id == "workspace-demo"
    assert response.run.status == "awaiting_worker"
    assert response.run.control_mode == "agent_only"
    assert response.run.conversation_ref.startswith("run-")
    assert response.events
    assert response.events[0].event_type == "run-created"
    assert response.events[0].seq == 1


@pytest.mark.asyncio
async def test_control_run_requires_control_mode_for_set_control_mode_action() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="run browser task",
        ),
        service=service,
    )

    with pytest.raises(HTTPException) as exc_info:
        await runs_routes.control_run(
            created.run.run_id,
            runs_routes.RunControlRequest(action="set-control-mode"),
            service=service,
        )

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_worker_heartbeat_binds_worker_and_transitions_run_to_running() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="submit internship application",
            agent_id="agent-alpha",
        ),
        service=service,
    )

    heartbeat = await runs_routes.worker_heartbeat(
        created.run.run_id,
        runs_routes.WorkerHeartbeatRequest(
            worker_id="worker-1",
            vm_id="vm-1",
            session_id="session-1",
            agent_id="agent-alpha",
            status="ready",
        ),
        service=service,
    )

    assert heartbeat.run.status == "running"
    assert heartbeat.run.worker is not None
    assert heartbeat.run.worker["vm_id"] == "vm-1"
    assert heartbeat.latest_event.event_type == "worker-heartbeat"


@pytest.mark.asyncio
async def test_worker_poll_heartbeat_assigns_pending_run() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="submit internship application",
            agent_id="agent-alpha",
        ),
        service=service,
    )

    heartbeat = await runs_routes.worker_poll_heartbeat(
        runs_routes.WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-alpha",
            vm_id="vm-alpha",
            user_id="vm-user-alpha",
            session_id="session-alpha",
            status="ready",
        ),
        service=service,
    )

    assert heartbeat.assigned_run is not None
    assert heartbeat.assigned_run.run_id == created.run.run_id
    run = await runs_routes.get_run(created.run.run_id, service=service)
    assert run.status == "queued"
    assert run.worker is not None
    assert run.worker["worker_id"] == "worker-alpha"


@pytest.mark.asyncio
async def test_worker_dispatched_updates_running_state_and_turn_ref() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="submit internship application",
        ),
        service=service,
    )

    await runs_routes.worker_poll_heartbeat(
        runs_routes.WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-1",
            vm_id="vm-1",
            user_id="vm-user-1",
            session_id="session-1",
            status="ready",
        ),
        service=service,
    )
    response = await runs_routes.worker_dispatched(
        created.run.run_id,
        runs_routes.WorkerDispatchedRequest(
            worker_id="worker-1",
            user_id="vm-user-1",
            turn_ref="turn-abc-123",
        ),
        service=service,
    )

    assert response.run.status == "running"
    assert response.run.query_message_id == "turn-abc-123"
    assert response.latest_event.event_type == "run-dispatched"


@pytest.mark.asyncio
async def test_ingest_run_event_marks_run_completed_on_streaming_complete() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="process files",
        ),
        service=service,
    )

    await runs_routes.ingest_run_event(
        created.run.run_id,
        runs_routes.RunEventIngestRequest(
            event_type="streaming-response",
            payload={"payload": {"text": "hello"}},
        ),
        service=service,
    )
    done = await runs_routes.ingest_run_event(
        created.run.run_id,
        runs_routes.RunEventIngestRequest(
            event_type="streaming-complete",
            payload={"payload": {"final_response": "done"}},
        ),
        service=service,
    )

    assert done.run.status == "completed"
    assert done.latest_event.event_type == "streaming-complete"


@pytest.mark.asyncio
async def test_list_run_events_filters_by_after_seq() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="process files",
        ),
        service=service,
    )
    run_id = created.run.run_id

    await runs_routes.control_run(
        run_id,
        runs_routes.RunControlRequest(action="pause", requested_by="tester"),
        service=service,
    )
    await runs_routes.control_run(
        run_id,
        runs_routes.RunControlRequest(action="resume", requested_by="tester"),
        service=service,
    )

    events = await runs_routes.list_run_events(run_id, service=service, after_seq=1, limit=50)

    assert events.run_id == run_id
    assert len(events.events) == 2
    assert events.events[0].event_type == "run-control"
    assert events.events[1].payload["action"] == "resume"
    assert events.next_after_seq == events.events[-1].seq


@pytest.mark.asyncio
async def test_worker_poll_heartbeat_returns_pending_control_commands_once() -> None:
    service = VmRunControlService()
    created = await runs_routes.create_run(
        runs_routes.CreateRunRequest(
            workspace_id="workspace-demo",
            query="process files",
        ),
        service=service,
    )
    await runs_routes.worker_poll_heartbeat(
        runs_routes.WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-control",
            vm_id="vm-control",
            user_id="vm-user-control",
            status="ready",
        ),
        service=service,
    )

    await runs_routes.control_run(
        created.run.run_id,
        runs_routes.RunControlRequest(action="pause", requested_by="tester"),
        service=service,
    )

    first = await runs_routes.worker_poll_heartbeat(
        runs_routes.WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-control",
            vm_id="vm-control",
            user_id="vm-user-control",
            status="running",
        ),
        service=service,
    )
    second = await runs_routes.worker_poll_heartbeat(
        runs_routes.WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-control",
            vm_id="vm-control",
            user_id="vm-user-control",
            status="running",
        ),
        service=service,
    )

    assert len(first.control_commands) == 1
    assert first.control_commands[0].action == "pause"
    assert second.control_commands == []


@pytest.mark.asyncio
async def test_get_run_returns_404_for_unknown_id() -> None:
    service = VmRunControlService()

    with pytest.raises(HTTPException) as exc_info:
        await runs_routes.get_run("missing-run", service=service)

    assert exc_info.value.status_code == 404
