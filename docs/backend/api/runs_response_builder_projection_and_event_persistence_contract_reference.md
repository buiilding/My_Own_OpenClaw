---
summary: "Deep reference for `/api/runs` response-builder helpers: run-dict projection into route models, persisted-event guarantees, and fail-closed malformed-result handling."
read_when:
  - When changing `backend/src/api/routes/runs/response_builders.py` helper behavior or route response projection logic.
  - When debugging mismatches between `VmRunControlService` dict payloads and `/api/runs` response model construction.
title: "Runs Response Builder Projection and Event Persistence Contract Reference"
---

# Runs Response Builder Projection and Event Persistence Contract Reference

## Canonical Modules

- `backend/src/api/routes/runs/response_builders.py`
- `backend/src/api/routes/runs/router.py`
- `backend/src/api/routes/runs/models.py`
- `backend/src/api/routes/runs/support.py`
- `tests/backend/test_run_control_response_builders.py`
- `tests/backend/test_run_control_routes.py`

## Ownership Boundary

`response_builders.py` owns dict-to-model projection for `/api/runs` route handlers.

It centralizes conversion from service dictionaries into strongly typed response models:

- `RunView`
- `CreateRunResponse`
- `RunControlResponse`
- `RunEventIngestResponse`
- `WorkerPollHeartbeatResponse`
- `WorkerDispatchedResponse`

Route handlers in `router.py` call these helpers instead of instantiating nested response models inline.

## Helper Contracts

### `build_run_view(run)`

Contract:

- Uses `to_run_view_dict(run)` from `support.py`.
- Drops event history fields from route payload projection.
- Instantiates `RunView(**projected_dict)`.

This keeps all run-view shaping consistent across `get_run`, `create_run`, and control responses.

### `build_create_run_response(run)`

Contract:

- Reads `run.get("events", [])`.
- Builds `CreateRunResponse` with:
  - `run=build_run_view(run)`
  - `events=[RunEvent(**event) for event in events]`

Implication:

- Missing `events` key degrades to empty list rather than failing route response creation.

### `build_run_control_response(run, missing_detail)`

Contract:

- Builds `run` projection via `build_run_view(run)`.
- Derives `latest_event` via `latest_run_event_dict(run, missing_detail=...)`.
- Always returns `RunControlResponse` with concrete `RunEvent` model.

This keeps `control_run(...)` output aligned with `worker_dispatched(...)` latest-event behavior.

### `build_worker_dispatched_response(run)`

Contract:

- Builds `run` projection via `build_run_view(run)`.
- Builds `latest_event` from:
  - `latest_run_event_dict(run, missing_detail="Dispatch event not recorded")`
- Returns fully typed `WorkerDispatchedResponse`.

This keeps dispatch-ack endpoint response shaping identical to other run-event response builders.

### `build_ingested_run_event_response(result)`

Contract:

- Expects `result["run"]` and `result["event"]` as dictionaries.
- If either is non-dict, raises:
  - `HTTPException(status_code=500, detail="Run event was not persisted")`
- Success path returns `RunEventIngestResponse` with typed `run` + `latest_event`.

Fail-closed intent:

- Event-ingest route treats malformed service result as persistence failure, not partial success.

### `build_worker_poll_heartbeat_response(result)`

Contract:

- `worker` is passed through as `dict(result.get("worker", {}))`.
- `assigned_run` is model-instantiated only when it is a dict; otherwise `None`.
- `control_commands` defaults to `[]` and each element is validated with `WorkerControlCommand`.

This keeps worker-poll responses resilient when assignment is absent.

## Router Integration Surface

Current `router.py` call sites:

- `create_run(...)` -> `build_create_run_response(...)`
- `worker_poll_heartbeat(...)` -> `build_worker_poll_heartbeat_response(...)`
- `get_run(...)` -> `build_run_view(...)`
- `ingest_run_event(...)` -> `build_ingested_run_event_response(...)`
- `control_run(...)` -> `build_run_control_response(...)`
- `worker_dispatched(...)` -> `build_worker_dispatched_response(...)`

## Test-Locked Invariants

`tests/backend/test_run_control_response_builders.py` locks:

- `build_run_control_response(...)` emits `latest_event.event_type == "run-control"` after service control action.
- `build_ingested_run_event_response(...)` raises sanitized `500` when run/event payload is missing or malformed.
- `build_worker_poll_heartbeat_response(...)` preserves worker snapshot and handles `assigned_run=None` without failure.
- `build_worker_dispatched_response(...)` uses `run-dispatched` as latest event projection.

Route-level expectations in `tests/backend/test_run_control_routes.py` validate that helpers produce response shapes accepted by endpoint models.

## Drift Hotspots

1. Returning raw service dicts from routes can bypass Pydantic validation and silently drift from endpoint contracts.
2. Relaxing malformed-result guard in `build_ingested_run_event_response(...)` can surface partial event-write success as false positive.
3. Diverging `build_run_view(...)` from `to_run_view_dict(...)` can create inconsistent run projections across `/api/runs` endpoints.
4. Passing non-dict `assigned_run` through without guard can break worker heartbeat polling responses.

## Related Pages

- [Runs Route and VM Control Service Reference](runs_route_and_vm_control_service_reference.md)
- [Runs Route Helper Validation and Incremental Events Projection Contract Reference](runs_route_helper_validation_and_incremental_events_projection_contract_reference.md)
- [Runs Route Support Helpers and API-Key Guard Reference](runs_route_support_helpers_and_api_key_guard_reference.md)
- [Runs Route Models Reference](runs_route_models_and_package_export_contract_reference.md)
- [Backend API Docs Hub](README.md)
