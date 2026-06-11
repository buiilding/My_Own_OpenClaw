from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.runs.models import (
    CreateRunRequest,
    RunControlRequest,
    RunEventIngestRequest,
    RunFileRef,
    StopAllRunsRequest,
    WorkerDispatchedRequest,
    WorkerPollHeartbeatRequest,
)
from backend.src.api.routes.runs.router import (
    control_run,
    create_run,
    get_run,
    ingest_run_event,
    list_run_events,
    router,
    stop_all_runs,
    worker_dispatched,
    worker_poll_heartbeat,
)
from backend.src.api.routes.runs.support import (
    get_vm_run_control_service,
    verify_runs_api_key,
)
from backend.src.services.vm_run_control import VmRunControlService

restore_route_deps_shim(_original_deps)


def create_runs_test_client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.mark.asyncio
async def test_get_vm_run_control_service_is_singleton_for_concurrent_first_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SlowVmRunControlService(VmRunControlService):
        def __init__(self, *args, **kwargs):
            time.sleep(0.02)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(
        "backend.src.api.routes.runs.support.VmRunControlService",
        SlowVmRunControlService,
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))

    services = await asyncio.gather(
        *[asyncio.to_thread(get_vm_run_control_service, request) for _ in range(8)]
    )

    assert len({id(service) for service in services}) == 1
    stored_service = request.app.state.vm_run_control_service
    run = await services[0].create_run(
        workspace_id="workspace-demo",
        query="first run",
    )

    assert await stored_service.get_run(run["run_id"]) == run


@pytest.mark.asyncio
async def test_create_run_returns_initial_state_and_created_event() -> None:
    service = VmRunControlService()
    payload = CreateRunRequest(
        workspace_id="workspace-demo",
        query="apply this internship job for me",
        requested_by="user_123",
        files=[
            RunFileRef(
                artifact_id="resume-1.png",
                filename="resume.pdf",
                content_type="application/pdf",
            )
        ],
    )

    response = await create_run(payload, service=service)

    assert response.run.workspace_id == "workspace-demo"
    assert response.run.status == "awaiting_worker"
    assert response.run.control_mode == "agent_only"
    assert response.run.conversation_ref.startswith("run-")
    assert response.events
    assert response.events[0].event_type == "run-created"
    assert response.events[0].seq == 1


@pytest.mark.asyncio
async def test_create_run_rejects_when_workspace_active_limit_reached() -> None:
    service = VmRunControlService(max_active_runs_per_workspace=1)
    await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="first run",
        ),
        service=service,
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_run(
            CreateRunRequest(
                workspace_id="workspace-demo",
                query="second run",
            ),
            service=service,
        )

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_control_run_requires_control_mode_for_set_control_mode_action() -> None:
    service = VmRunControlService()
    created = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="run browser task",
        ),
        service=service,
    )

    with pytest.raises(HTTPException) as exc_info:
        await control_run(
            created.run.run_id,
            RunControlRequest(action="set-control-mode"),
            service=service,
        )

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_worker_poll_heartbeat_assigns_pending_run() -> None:
    service = VmRunControlService()
    created = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="submit internship application",
            agent_id="agent-alpha",
        ),
        service=service,
    )

    heartbeat = await worker_poll_heartbeat(
        WorkerPollHeartbeatRequest(
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
    run = await get_run(created.run.run_id, service=service)
    assert run.status == "queued"
    assert run.worker is not None
    assert run.worker["worker_id"] == "worker-alpha"


@pytest.mark.asyncio
async def test_worker_dispatched_updates_running_state_and_turn_ref() -> None:
    service = VmRunControlService()
    created = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="submit internship application",
        ),
        service=service,
    )

    await worker_poll_heartbeat(
        WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-1",
            vm_id="vm-1",
            user_id="vm-user-1",
            session_id="session-1",
            status="ready",
        ),
        service=service,
    )
    response = await worker_dispatched(
        created.run.run_id,
        WorkerDispatchedRequest(
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
    created = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="process files",
        ),
        service=service,
    )

    await ingest_run_event(
        created.run.run_id,
        RunEventIngestRequest(
            event_type="streaming-response",
            payload={"payload": {"text": "hello"}},
        ),
        service=service,
    )
    done = await ingest_run_event(
        created.run.run_id,
        RunEventIngestRequest(
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
    created = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="process files",
        ),
        service=service,
    )
    run_id = created.run.run_id

    await control_run(
        run_id,
        RunControlRequest(action="pause", requested_by="tester"),
        service=service,
    )
    await control_run(
        run_id,
        RunControlRequest(action="resume", requested_by="tester"),
        service=service,
    )

    events = await list_run_events(run_id, service=service, after_seq=1, limit=50)

    assert events.run_id == run_id
    control_events = [
        event for event in events.events if event.event_type == "run-control"
    ]
    trace_events = [
        event for event in events.events if event.event_type == "trace_event"
    ]
    assert [event.payload["action"] for event in control_events] == ["pause", "resume"]
    assert [event.payload["path"] for event in trace_events] == ["run.control"] * 3
    assert trace_events[0].payload["stage"] == "create"
    assert trace_events[1].payload["data"] == {
        "action": "pause",
        "controlMode": "agent_only",
        "status": "paused",
        "bulk": False,
        "pendingControlCount": 1,
    }
    assert "process files" not in str([event.payload for event in trace_events])
    assert events.next_after_seq == events.events[-1].seq


@pytest.mark.asyncio
async def test_worker_poll_heartbeat_returns_pending_control_commands_once() -> None:
    service = VmRunControlService()
    created = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="process files",
        ),
        service=service,
    )
    await worker_poll_heartbeat(
        WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-control",
            vm_id="vm-control",
            user_id="vm-user-control",
            status="ready",
        ),
        service=service,
    )

    await control_run(
        created.run.run_id,
        RunControlRequest(action="pause", requested_by="tester"),
        service=service,
    )

    first = await worker_poll_heartbeat(
        WorkerPollHeartbeatRequest(
            workspace_id="workspace-demo",
            worker_id="worker-control",
            vm_id="vm-control",
            user_id="vm-user-control",
            status="running",
        ),
        service=service,
    )
    second = await worker_poll_heartbeat(
        WorkerPollHeartbeatRequest(
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
async def test_stop_all_runs_sets_matching_active_runs_to_stopped() -> None:
    service = VmRunControlService(max_active_runs_per_workspace=4)
    run_a = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="run A",
        ),
        service=service,
    )
    run_b = await create_run(
        CreateRunRequest(
            workspace_id="workspace-demo",
            query="run B",
        ),
        service=service,
    )
    run_other = await create_run(
        CreateRunRequest(
            workspace_id="workspace-other",
            query="run C",
        ),
        service=service,
    )

    response = await stop_all_runs(
        StopAllRunsRequest(
            workspace_id="workspace-demo",
            requested_by="tester",
        ),
        service=service,
    )

    assert response.count == 2
    assert set(response.stopped_run_ids) == {run_a.run.run_id, run_b.run.run_id}
    run_a_state = await get_run(run_a.run.run_id, service=service)
    run_b_state = await get_run(run_b.run.run_id, service=service)
    run_other_state = await get_run(run_other.run.run_id, service=service)
    assert run_a_state.status == "stopped"
    assert run_b_state.status == "stopped"
    assert run_other_state.status == "awaiting_worker"


def test_verify_runs_api_key_respects_demo_key_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WINDIE_DEMO_API_KEY", "demo-key")
    verify_runs_api_key("demo-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_runs_api_key("wrong-key")
    assert exc_info.value.status_code == 401
    monkeypatch.delenv("WINDIE_DEMO_API_KEY", raising=False)
    monkeypatch.delenv("WINDIE_RUNS_API_KEY", raising=False)
    with pytest.raises(HTTPException) as missing_config:
        verify_runs_api_key(None)
    assert missing_config.value.status_code == 503


def test_runs_routes_fail_closed_when_key_is_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("WINDIE_RUNS_API_KEY", raising=False)
    monkeypatch.delenv("WINDIE_DEMO_API_KEY", raising=False)
    client = create_runs_test_client()

    create_response = client.post(
        "/api/runs/",
        json={"workspace_id": "workspace-demo", "query": "run this"},
    )
    read_response = client.get("/api/runs/missing-run")

    assert create_response.status_code == 503
    assert create_response.json()["detail"] == "Runs API key is not configured"
    assert read_response.status_code == 503
    assert read_response.json()["detail"] == "Runs API key is not configured"


def test_runs_routes_require_matching_key_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WINDIE_RUNS_API_KEY", "runs-secret")
    monkeypatch.delenv("WINDIE_DEMO_API_KEY", raising=False)
    client = create_runs_test_client()

    missing_response = client.post(
        "/api/runs/",
        json={"workspace_id": "workspace-demo", "query": "run this"},
    )
    wrong_response = client.post(
        "/api/runs/",
        headers={"x-windie-runs-key": "wrong"},
        json={"workspace_id": "workspace-demo", "query": "run this"},
    )
    created_response = client.post(
        "/api/runs/",
        headers={"x-windie-runs-key": "runs-secret"},
        json={"workspace_id": "workspace-demo", "query": "run this"},
    )
    run_id = created_response.json()["run"]["run_id"]
    read_response = client.get(
        f"/api/runs/{run_id}",
        headers={"x-windie-runs-key": "runs-secret"},
    )

    assert missing_response.status_code == 401
    assert wrong_response.status_code == 401
    assert created_response.status_code == 200
    assert read_response.status_code == 200
    assert read_response.json()["run_id"] == run_id


def test_get_run_route_network_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WINDIE_RUNS_API_KEY", "runs-secret")
    monkeypatch.delenv("WINDIE_DEMO_API_KEY", raising=False)
    client = create_runs_test_client()
    headers = {"x-windie-runs-key": "runs-secret"}

    created_response = client.post(
        "/api/runs/",
        headers=headers,
        json={
            "workspace_id": "workspace-demo",
            "query": "run this",
            "requested_by": "tester",
        },
    )
    run_id = created_response.json()["run"]["run_id"]

    success_response = client.get(f"/api/runs/{run_id}", headers=headers)
    missing_response = client.get("/api/runs/missing-run", headers=headers)
    missing_key_response = client.get(f"/api/runs/{run_id}")
    wrong_key_response = client.get(
        f"/api/runs/{run_id}",
        headers={"x-windie-runs-key": "wrong"},
    )

    assert success_response.status_code == 200
    assert success_response.json() == {
        "run_id": run_id,
        "workspace_id": "workspace-demo",
        "status": "awaiting_worker",
        "control_mode": "agent_only",
        "query": "run this",
        "agent_id": None,
        "requested_by": "tester",
        "created_at": created_response.json()["run"]["created_at"],
        "updated_at": created_response.json()["run"]["updated_at"],
        "worker": None,
        "conversation_ref": created_response.json()["run"]["conversation_ref"],
        "query_message_id": None,
        "files": [],
        "metadata": {},
        "last_event_seq": 2,
        "last_heartbeat_at": None,
    }
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "Run not found"
    assert missing_key_response.status_code == 401
    assert wrong_key_response.status_code == 401


def test_worker_dispatched_route_requires_key_and_acknowledges_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WINDIE_RUNS_API_KEY", "runs-secret")
    monkeypatch.delenv("WINDIE_DEMO_API_KEY", raising=False)
    client = create_runs_test_client()
    headers = {"x-windie-runs-key": "runs-secret"}
    created_response = client.post(
        "/api/runs/",
        headers=headers,
        json={"workspace_id": "workspace-demo", "query": "run this"},
    )
    run_id = created_response.json()["run"]["run_id"]
    client.post(
        "/api/runs/workers/heartbeat",
        headers=headers,
        json={
            "workspace_id": "workspace-demo",
            "worker_id": "worker-route",
            "vm_id": "vm-route",
            "user_id": "vm-user-route",
            "session_id": "session-route",
            "status": "ready",
        },
    )

    missing_key_response = client.post(
        f"/api/runs/{run_id}/worker-dispatched",
        json={"worker_id": "worker-route", "user_id": "vm-user-route"},
    )
    dispatched_response = client.post(
        f"/api/runs/{run_id}/worker-dispatched",
        headers=headers,
        json={
            "worker_id": "worker-route",
            "user_id": "vm-user-route",
            "turn_ref": "turn-route",
            "conversation_ref": "conv-route",
        },
    )

    assert missing_key_response.status_code == 401
    assert dispatched_response.status_code == 200
    body = dispatched_response.json()
    assert body["run"]["run_id"] == run_id
    assert body["run"]["status"] == "running"
    assert body["run"]["query_message_id"] == "turn-route"
    assert body["latest_event"]["event_type"] == "run-dispatched"


def test_stop_all_requires_distinct_control_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeRunsService:
        def __init__(self) -> None:
            self.stop_all_calls = []

        async def stop_all_runs(self, *, workspace_id=None, requested_by=None):
            self.stop_all_calls.append(
                {"workspace_id": workspace_id, "requested_by": requested_by}
            )
            return ["run-1"]

    monkeypatch.setenv("WINDIE_RUNS_API_KEY", "runs-secret")
    monkeypatch.setenv("WINDIE_RUNS_CONTROL_API_KEY", "control-secret")
    monkeypatch.delenv("WINDIE_DEMO_API_KEY", raising=False)
    client = create_runs_test_client()
    service = _FakeRunsService()
    client.app.state.vm_run_control_service = service

    ordinary_key_response = client.post(
        "/api/runs/stop-all",
        headers={"x-windie-runs-key": "runs-secret"},
        json={"workspace_id": "workspace-other", "requested_by": "tester"},
    )
    wrong_control_key_response = client.post(
        "/api/runs/stop-all",
        headers={"x-windie-runs-control-key": "wrong"},
        json={"workspace_id": "workspace-other", "requested_by": "tester"},
    )
    control_key_response = client.post(
        "/api/runs/stop-all",
        headers={"x-windie-runs-control-key": "control-secret"},
        json={"workspace_id": "workspace-demo", "requested_by": "tester"},
    )

    assert ordinary_key_response.status_code == 403
    assert wrong_control_key_response.status_code == 403
    assert control_key_response.status_code == 200
    assert control_key_response.json() == {
        "workspace_id": "workspace-demo",
        "stopped_run_ids": ["run-1"],
        "count": 1,
    }
    assert service.stop_all_calls == [
        {"workspace_id": "workspace-demo", "requested_by": "tester"}
    ]


def test_stop_all_fails_closed_when_control_key_is_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WINDIE_RUNS_API_KEY", "runs-secret")
    monkeypatch.delenv("WINDIE_RUNS_CONTROL_API_KEY", raising=False)
    client = create_runs_test_client()

    response = client.post(
        "/api/runs/stop-all",
        headers={"x-windie-runs-key": "runs-secret"},
        json={"workspace_id": "workspace-demo"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Runs control API key is not configured"


@pytest.mark.asyncio
async def test_get_run_returns_404_for_unknown_id() -> None:
    service = VmRunControlService()

    with pytest.raises(HTTPException) as exc_info:
        await get_run("missing-run", service=service)

    assert exc_info.value.status_code == 404
