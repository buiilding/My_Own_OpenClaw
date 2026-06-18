---
summary: "Deep reference for `/api/runs` route-support helpers: per-process service singleton bootstrap, API-key guard resolution, run-not-found/error helpers, and response-shape projection boundaries."
read_when:
  - When changing `/api/runs` dependency helpers in `support.py` or route-level auth/service wiring in `router.py`.
  - When debugging inconsistent runs API auth behavior, missing service state initialization, or route helper error/status mismatches.
title: "Runs Route Support Helpers and API-Key Guard Reference"
---

# Runs Route Support Helpers and API-Key Guard Reference

## Canonical Modules

- `backend/src/api/routes/runs/support.py`
- `backend/src/api/routes/runs/router.py`
- `backend/src/services/vm_run_control.py`
- `tests/backend/test_run_control_routes.py`

## Helper Ownership Boundary

`support.py` owns lightweight, route-facing support helpers:

- singleton service bootstrap on `app.state`
- optional API-key validation dependency
- common run-not-found / latest-event error helpers
- route response shape helpers (`events` projection stripping)

It does not own run lifecycle logic. Status transitions, queue assignment, and control dispatch remain in `VmRunControlService`.

## Service Bootstrap Helper

`get_vm_run_control_service(request)` behavior:

1. checks `request.app.state.vm_run_control_service`
2. if missing, parses max-active-runs env via `parse_positive_int(...)`
3. constructs `VmRunControlService(max_active_runs_per_workspace=<parsed>)`
4. stores singleton on `app.state` and returns it

Config source:

- env var: `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`
- invalid/non-positive values fall back to default `1`
- service constructor still clamps to minimum `1` (`max(1, int(...))`)

## API-Key Guard Contract

`resolve_runs_api_key()` precedence:

1. `WINDIE_RUNS_API_KEY`

The value is normalized through `normalize_optional_string(...)` (trim + empty->`None`).

`verify_runs_api_key(...)` dependency behavior:

- reads request header `x-windie-runs-key` (alias via FastAPI `Header`)
- if no expected env key is configured, raises `HTTPException(503, "Runs API key is not configured")`
- if expected key exists and normalized header mismatch occurs, raises `HTTPException(401, "Invalid runs API key")`

`resolve_runs_control_api_key()` reads `WINDIE_RUNS_CONTROL_API_KEY`.

`verify_runs_control_api_key(...)` dependency behavior:

- reads request header `x-windie-runs-control-key`
- if no expected control key is configured, raises `HTTPException(503, "Runs control API key is not configured")`
- if expected key exists and normalized header mismatch occurs, raises `HTTPException(403, "Invalid runs control API key")`
- protects destructive bulk controls such as `/api/runs/stop-all` so ordinary worker/runs API keys cannot stop arbitrary workspaces by changing request body scope

## Route-Error Helper Contracts

`require_run(run, detail="Run not found")`:

- returns run dict when present
- raises `HTTPException(404, detail)` when missing

`latest_run_event_dict(run, missing_detail)`:

- reads `run["events"][-1]`
- raises `HTTPException(500, missing_detail)` when events list is absent/empty or latest event is non-dict

`to_run_view_dict(run)`:

- returns shallow projection excluding `events`
- used to satisfy `RunView` response model surfaces without duplicating event history payloads in non-events endpoints

## Route Wiring in `router.py`

Dependency aliases:

- `VmRunControlServiceDep = Annotated[VmRunControlService, Depends(get_vm_run_control_service)]`
- `RunsApiKeyDep = Annotated[None, Depends(verify_runs_api_key)]`
- `RunsControlApiKeyDep = Annotated[None, Depends(verify_runs_control_api_key)]`

Most `/api/runs` routes include `_api_key: RunsApiKeyDep = None`, so standard runs auth behavior is uniformly applied without per-handler duplication. `/api/runs/stop-all` uses `RunsControlApiKeyDep` instead because it is a destructive bulk operation.

Helper usage patterns:

- not-found paths consistently use `require_run(...)` (`404`)
- missing-persisted-event paths use `latest_run_event_dict(...)` (`500`)
- list/get/create/control responses use `to_run_view_dict(...)` before `RunView` model construction

## Drift Hotspots

1. Changing `normalize_optional_string` semantics in helpers without matching route/auth expectations can silently alter valid-key matching.
2. Removing shared dependency aliases in `router.py` can create endpoint-specific auth drift.
3. Returning full run objects (with `events`) in non-events routes can inflate payload size and duplicate event data contracts.
4. Falling back from `WINDIE_RUNS_CONTROL_API_KEY` to the ordinary runs key would let worker/dashboard credentials authorize cross-workspace stop-all again.
5. Diverging missing-run handling away from `require_run` can produce inconsistent HTTP status/detail surfaces across endpoints.

## Related Pages

- [Runs Route and VM Control Service Reference](runs_route_and_vm_control_service_reference.md)
- [Runs Route Helper Validation and Incremental Events Projection Contract Reference](runs_route_helper_validation_and_incremental_events_projection_contract_reference.md)
- [Runs Route Models Reference](runs_route_models_and_package_export_contract_reference.md)
- [Backend API Docs Hub](README.md)
