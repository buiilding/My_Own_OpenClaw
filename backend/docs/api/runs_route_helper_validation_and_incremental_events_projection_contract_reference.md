---
summary: "Deep reference for `/api/runs` route helpers: control-action guard validation and incremental event-list response projection."
read_when:
  - When changing `backend/src/api/routes/runs/route_helpers.py` helper behavior or list-events/control route guard semantics.
  - When debugging `set-control-mode` validation failures or `next_after_seq` drift in `/api/runs/{run_id}/events`.
title: "Runs Route Helper Validation and Incremental Events Projection Contract Reference"
---

# Runs Route Helper Validation and Incremental Events Projection Contract Reference

## Canonical Modules

- `backend/src/api/routes/runs/route_helpers.py`
- `backend/src/api/routes/runs/router.py`
- `backend/src/api/routes/runs/models.py`
- `tests/backend/test_run_control_route_helpers.py`
- `tests/backend/test_run_control_routes.py`

## Ownership Boundary

`route_helpers.py` owns lightweight route-only helper behavior that does not belong in:

- `support.py` route dependency/bootstrap/auth helpers
- `response_builders.py` dict-to-model response projections
- `VmRunControlService` state mutation and lifecycle transitions

Current helper surface:

- `validate_control_request(payload)`
- `build_run_events_response(run_id, events, after_seq)`

## `validate_control_request(...)` Contract

Behavior:

- For `action == "set-control-mode"`, `control_mode` must be present.
- Missing `control_mode` raises:
  - `HTTPException(status_code=422, detail="control_mode is required when action is set-control-mode")`
- Other actions pass without additional validation in this helper.

Boundary note:

- Action enum validity is enforced by `RunControlRequest.action` model typing.
- This helper only enforces cross-field dependency (`action` -> required `control_mode`).

## `build_run_events_response(...)` Contract

Inputs:

- `run_id` from route path
- `events` from `VmRunControlService.list_events(...)`
- `after_seq` query value

Behavior:

- Converts each event dict into typed `RunEvent`.
- Computes `next_after_seq`:
  - if events are returned: last event `seq`
  - if no events: original `after_seq`

Output:

- Returns `RunEventsResponse(run_id, events, next_after_seq)` with deterministic paging cursor behavior.

## Router Integration Surface

`router.py` usage:

- `list_run_events(...)`:
  - service read `list_events(run_id, after_seq, limit)`
  - `None` -> `404`
  - list -> `build_run_events_response(...)`
- `control_run(...)`:
  - calls `validate_control_request(payload)` before service mutation

This preserves route-level fail-fast validation and a single incremental events response shape.

## Test-Locked Invariants

`tests/backend/test_run_control_route_helpers.py` covers:

- `set-control-mode` without `control_mode` returns `422`.
- Non-`set-control-mode` actions pass.
- No-events response keeps `next_after_seq == after_seq`.
- Eventful response advances `next_after_seq` to the last event sequence.

Route-path integration is also exercised in `tests/backend/test_run_control_routes.py`:

- `control_run(...)` rejects missing `control_mode` for `set-control-mode`.
- `list_run_events(...)` returns expected incremental sequence progression.

## Drift Hotspots

1. Moving `set-control-mode` guard out of `validate_control_request(...)` can create endpoint-specific validation drift.
2. Changing `next_after_seq` derivation can break polling loops that rely on idempotent cursor replay.
3. Bypassing helper usage in route handlers can duplicate logic and diverge status/detail error surfaces.

## Related Pages

- [Runs Route and VM Control Service Reference](runs_route_and_vm_control_service_reference.md)
- [Runs Route Support Helpers and API-Key Guard Reference](runs_route_support_helpers_and_api_key_guard_reference.md)
- [Runs Response Builder Projection and Event Persistence Contract Reference](runs_response_builder_projection_and_event_persistence_contract_reference.md)
- [Backend API Docs Hub](README.md)
