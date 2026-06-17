---
summary: "Deep reference for `/api/runs` Pydantic request/response schemas, endpoint-to-model bindings, and direct router registration."
read_when:
  - When changing `/api/runs` request/response fields, validation constraints, or response model bindings in `models.py` and `router.py`.
  - When debugging route-registration imports or 422 validation failures from hosted VM run-control endpoints.
title: "Runs Route Models Reference"
---

# Runs Route Models Reference

## Canonical Modules

- `backend/src/api/routes/runs/models.py`
- `backend/src/api/routes/runs/router.py`
- `tests/backend/test_run_control_routes.py`

## Package Split Contract

`backend/src/api/routes/runs/` is the canonical package surface for hosted VM control-plane routes:

- `models.py`: Pydantic request/response schemas and literal-enforced enums.
- `router.py`: FastAPI endpoint handlers that bind those schemas to `VmRunControlService`.
- `support.py`: shared route helpers (service singleton, API key guard, run/event helper guards).
Import ownership contract:

- Route registration imports `router` from `backend.src.api.routes.runs.router`.
- Route handlers are imported from `backend.src.api.routes.runs.router`.
- Request/response models are imported from `backend.src.api.routes.runs.models`.
- Service/auth helpers are imported from `backend.src.api.routes.runs.support`.

## Request Model Validation Matrix

### `CreateRunRequest`

- required non-empty fields:
  - `workspace_id`
  - `query`
- optional:
  - `agent_id`, `requested_by`
  - `files: List[RunFileRef]`
  - `metadata: Dict[str, Any]` (defaults `{}`)

### `RunFileRef`

- required non-empty: `artifact_id`
- optional metadata-only fields:
  - `filename`
  - `content_type`

### `RunControlRequest`

- `action` literal must be one of:
  - `pause`
  - `resume`
  - `stop`
  - `set-control-mode`
- `control_mode` optional literal:
  - `agent_only`
  - `shared_control`
  - `human_override`
- extra route-level guard in `control_run(...)`:
  - action `set-control-mode` requires non-null `control_mode`
  - missing value raises `422` with explicit detail string

### `WorkerPollHeartbeatRequest`

- required non-empty:
  - `workspace_id`
  - `worker_id`
  - `vm_id`
  - `user_id`
- optional:
  - `session_id`
  - `agent_id`
  - `status` default `"ready"`
  - `metadata` default `{}`

### `WorkerDispatchedRequest`

- required non-empty:
  - `worker_id`
  - `user_id`
  - `turn_ref`
- optional:
  - `conversation_ref`

### `RunEventIngestRequest`

- required non-empty:
  - `event_type`
- optional:
  - `payload` default `{}`
  - `source` default `"worker-stream"`

### `StopAllRunsRequest`

- optional-only request body:
  - `workspace_id`
  - `requested_by`

## Response Model Shape Contract

### Shared Route View Models

- `RunView` is the non-events projection used by most endpoints.
- `RunEvent` is the normalized event row (`seq`, `timestamp`, `event_type`, `source`, `payload`).
- `to_run_view_dict(...)` strips `events` before `RunView` model construction.

### Endpoint Response Models

- `POST /api/runs/` -> `CreateRunResponse`
  - `run: RunView`
  - `events: List[RunEvent]` (initial persisted event list, includes `run-created`)
- `GET /api/runs/{run_id}` -> `RunView`
- `GET /api/runs/{run_id}/events` -> `RunEventsResponse`
- `POST /api/runs/{run_id}/events` -> `RunEventIngestResponse`
- `POST /api/runs/{run_id}/control` -> `RunControlResponse`
- `POST /api/runs/stop-all` -> `StopAllRunsResponse`
- `POST /api/runs/{run_id}/worker-dispatched` -> `WorkerDispatchedResponse`
- `POST /api/runs/workers/heartbeat` -> `WorkerPollHeartbeatResponse`

### Poll-Heartbeat Composite Response

`WorkerPollHeartbeatResponse` intentionally bundles three distinct concerns:

- `worker`: current registry snapshot for sender worker.
- `assigned_run`: optional `WorkerAssignedRun` when queue assignment succeeded.
- `control_commands`: one-shot drained `WorkerControlCommand[]` for worker-owned runs.

## Validation and Error Surface Boundaries

- Pydantic/body/query validation failures return FastAPI-managed `422`.
- Capacity rejection from `VmRunControlService.create_run(...)` is converted to `409` in router.
- Missing run/event helper paths raise explicit `404`/`500` through shared helpers in `support.py`.
- Route success responses are always model-instantiated (`RunView(...)`, `RunEvent(...)`) rather than raw dict passthrough.

## Drift Hotspots

1. Changing fields in `models.py` without matching router payload construction can cause model instantiation failures at runtime.
2. Reintroducing `runs/__init__.py` recreates a second import surface for run-control internals.
3. Changing literal enums (`RunControlRequest`, control mode literals) without syncing frontend worker/control send paths can create 422 regressions.
4. Returning raw run dicts (including `events`) instead of `RunView` projection inflates payload size and breaks endpoint shape consistency.

## Related Pages

- [Runs Route and VM Control Service Reference](runs_route_and_vm_control_service_reference.md)
- [Runs Route Helper Validation and Incremental Events Projection Contract Reference](runs_route_helper_validation_and_incremental_events_projection_contract_reference.md)
- [Runs Route Support Helpers and API-Key Guard Reference](runs_route_support_helpers_and_api_key_guard_reference.md)
- [VM Run Control Service Runtime Reference](../services/vm_run_control_service_runtime_reference.md)
