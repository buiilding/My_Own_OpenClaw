---
summary: "Developer runbook for WindieOS `/api/runs/*` endpoints, auth, payloads, status transitions, event polling, and test coverage."
read_when:
  - When integrating with the hosted VM runs API or changing route models and examples.
  - When debugging runs API auth, active-run caps, event polling, worker dispatch, or stop-all behavior.
title: "Runs API Runbook"
---

# Runs API Runbook

The runs API is a hosted HTTP control plane for VM-backed Windie execution. It is not the normal chat websocket. Use it to create a run, let a worker pick it up, control it, and inspect its timeline.

The current run store is process memory. The route dependency lazily creates one
`VmRunControlService` per FastAPI app state and protects first creation with a
thread lock so concurrent first requests share the same run map.

For owner-file routing, invariants, and focused validation by change type, start with [VM Run Control Change Workflow](vm_run_control_change_workflow.md).

## Auth

Header:

```http
x-windie-runs-key: <shared-key>
```

Backend accepted env vars:

- `WINDIE_RUNS_API_KEY`

Worker env lookup order:

1. `WINDIE_VM_RUNS_API_KEY`
2. `WINDIE_RUNS_API_KEY`

If the backend has no runs key configured, `/api/runs/*` fails closed with
`503`. Configure the backend env var before enabling VM run control.

## Endpoint Matrix

| Endpoint | Purpose | Primary code |
| --- | --- | --- |
| `POST /api/runs/` | Create a run and enqueue it by workspace | `router.py:create_run`, `VmRunControlService.create_run` |
| `GET /api/runs/{run_id}` | Read latest run view | `router.py:get_run` |
| `GET /api/runs/{run_id}/events` | Poll timeline events after sequence number | `router.py:list_run_events`, `route_helpers.py` |
| `POST /api/runs/{run_id}/events` | Ingest worker/backend stream event | `router.py:ingest_run_event`, `append_stream_event` |
| `POST /api/runs/{run_id}/control` | Queue pause/resume/stop/control-mode command | `router.py:control_run`, `route_helpers.py:validate_control_request` |
| `POST /api/runs/stop-all` | Stop all active runs, optionally workspace-scoped | `router.py:stop_all_runs`, `vm_run_control_bulk_stop.py` |
| `POST /api/runs/workers/heartbeat` | Register worker, assign next run, return commands | `router.py:worker_poll_heartbeat`, `register_worker_heartbeat` |
| `POST /api/runs/{run_id}/worker-dispatched` | Worker ack after websocket query dispatch | `router.py:worker_dispatched`, `acknowledge_run_dispatch` |

## Create a Run

Request:

```json
{
  "workspace_id": "workspace-demo",
  "agent_id": "agent-alpha",
  "query": "Find the latest invoice and summarize it",
  "requested_by": "operator-123",
  "files": [
    {
      "artifact_id": "artifact-uuid",
      "filename": "invoice.pdf",
      "content_type": "application/pdf"
    }
  ],
  "metadata": {
    "conversation_ref": "optional-existing-conversation"
  }
}
```

Response includes:

- `run.run_id`
- `run.status`
- `run.control_mode`
- `run.conversation_ref`
- initial `events[]` with `run-created`

Failure modes:

- `503`: backend runs key is not configured.
- `401`: invalid or missing runs key when backend key is configured.
- `409`: active-run cap reached for the workspace.
- `422`: request model validation failed.

## Worker Poll

Request:

```json
{
  "workspace_id": "workspace-demo",
  "worker_id": "worker-user-123",
  "vm_id": "vm-worker-user-123",
  "user_id": "user-123",
  "session_id": "session-123",
  "agent_id": "agent-alpha",
  "status": "ready",
  "metadata": {
    "platform": "darwin"
  }
}
```

Response:

```json
{
  "worker": {
    "worker_id": "worker-user-123",
    "workspace_id": "workspace-demo",
    "vm_id": "vm-worker-user-123",
    "user_id": "user-123",
    "session_id": "session-123",
    "agent_id": "agent-alpha",
    "status": "ready",
    "metadata": {
      "platform": "darwin"
    },
    "last_heartbeat_at": "2026-05-13T00:00:00+00:00"
  },
  "assigned_run": null,
  "control_commands": []
}
```

When a queued run is assigned, `assigned_run` contains:

- `run_id`
- `workspace_id`
- `agent_id`
- `conversation_ref`
- `query`
- `requested_by`
- `files`
- `metadata`
- `control_mode`

## Dispatch Ack

After `sendAutomatedQuery(...)` succeeds, the worker posts:

```json
{
  "worker_id": "worker-user-123",
  "user_id": "user-123",
  "turn_ref": "query-message-id",
  "conversation_ref": "run-run-id"
}
```

The backend verifies worker ownership, sets the run to `running`, stores `query_message_id`, and appends `run-dispatched`.

## Event Ingest

Worker relay request:

```json
{
  "event_type": "tool-call",
  "source": "worker-stream",
  "payload": {
    "payload": {},
    "conversation_ref": "run-run-id",
    "turn_ref": "query-message-id",
    "session_id": "session-123",
    "user_id": "user-123"
  }
}
```

Use backend event names as the `event_type`. Terminal mappings:

- `streaming-complete` sets run status to `completed`.
- `error` sets run status to `failed`.

All other stream events append to the timeline and can promote an unstarted run to `running`.

## Event Polling

Request:

```http
GET /api/runs/{run_id}/events?after_seq=3&limit=200
```

Response:

```json
{
  "run_id": "run-id",
  "events": [
    {
      "seq": 4,
      "timestamp": "2026-05-13T00:00:00+00:00",
      "event_type": "tool-output",
      "source": "worker-stream",
      "payload": {}
    }
  ],
  "next_after_seq": 4
}
```

Polling contract:

- `seq` is per-run and monotonically increasing.
- `after_seq` is exclusive.
- `limit` is bounded to `1..1000`.
- empty result keeps `next_after_seq` at the requested `after_seq`.

## Controls

Request:

```json
{
  "action": "stop",
  "requested_by": "operator-123"
}
```

Supported actions:

- `pause`
- `resume`
- `stop`
- `set-control-mode`

For `set-control-mode`, include:

```json
{
  "action": "set-control-mode",
  "control_mode": "human_override",
  "requested_by": "operator-123"
}
```

Control modes:

- `agent_only`
- `shared_control`
- `human_override`

Important implementation detail: controls mutate the run immediately and enqueue a command for the worker. Electron currently applies `stop` to the websocket query path. The other controls are visible in status/control-mode state and command delivery but do not pause or resume the underlying websocket execution by themselves.

## Stop All

`POST /api/runs/stop-all` requires the privileged control header
`x-windie-runs-control-key` matching `WINDIE_RUNS_CONTROL_API_KEY`. The ordinary
`x-windie-runs-key` worker/control-plane key is not accepted for this destructive
bulk operation.

Request:

```json
{
  "workspace_id": "workspace-demo",
  "requested_by": "operator-123"
}
```

Rules:

- `workspace_id` is optional.
- blank workspace id behaves like no workspace filter.
- only active statuses are stopped: `awaiting_worker`, `queued`, `running`, `paused`.
- every stopped run gets a queued `stop` command and a `run-control` event with `bulk=true`.

## Status Reference

| Status | Meaning | Set by |
| --- | --- | --- |
| `awaiting_worker` | Run exists and is waiting for a worker heartbeat assignment | create, resume with no worker |
| `queued` | Run has been assigned to a worker but not acknowledged as dispatched | worker poll assignment |
| `running` | Worker has dispatched or stream events are arriving | dispatch ack, stream event, heartbeat transition, resume with worker |
| `paused` | Operator requested pause | control action |
| `completed` | Worker relayed `streaming-complete` | event ingest |
| `failed` | Worker relayed `error` | event ingest |
| `stopped` | Operator requested stop or stop-all | control action, stop-all |

## Tests to Update

Backend route changes:

- `tests/backend/test_run_control_routes.py`

Backend service/helper changes:

- `tests/backend/test_vm_run_control_assignment.py`
- `tests/backend/test_vm_run_control_pending_controls.py`
- helper-specific tests near the touched service behavior

Frontend worker changes:

- `tests/frontend/VmWorkerRuntime.test.cjs`
- `tests/frontend/RuntimeMode.test.cjs`

Docs to keep synchronized:

- [VM Run Control Change Workflow](vm_run_control_change_workflow.md)
- [VM Runs and Workers](vm_runs_and_workers.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [API Reference](../reference/api_reference.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
