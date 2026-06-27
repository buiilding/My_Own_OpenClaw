---
summary: "Deep reference for VM run-control bulk-stop helper semantics: workspace/status filtering, in-place stop mutation, callback invocation contract, and service integration path."
read_when:
  - When changing `stop_all_runs` behavior in `VmRunControlService` or helper logic in `vm_run_control_bulk_stop.py`.
  - When debugging mismatches between `/api/runs/stop-all` results, run status transitions, and queued stop-control command emission.
title: "VM Run Control Bulk-Stop Helper Contract Reference"
---

# VM Run Control Bulk-Stop Helper Contract Reference

## Canonical Modules

- `backend/src/services/vm_run_control_support/vm_run_control_bulk_stop.py`
- `backend/src/services/vm_run_control.py`
- `tests/backend/test_vm_run_control_bulk_stop.py`
- `tests/backend/test_run_control_routes.py`

## Helper API Contract

`stop_active_runs(...)` signature:

- `runs: Dict[str, Dict[str, Any]]`
- `workspace_id: Optional[str]`
- `active_statuses: Set[str] | frozenset[str]`
- `on_stop: Callable[[Dict[str, Any]], None]`

Return value:

- ordered `List[str]` of stopped `run_id` values in iteration order.

## Filtering and Mutation Semantics

Workspace scope:

- `workspace_id` is normalized through `normalize_optional_string(...)`.
- normalized `None` means no workspace filter (all workspaces eligible).
- non-empty workspace id restricts processing to runs with exact matching `run["workspace_id"]`.

Status gate:

- only runs with `run["status"] in active_statuses` are affected.
- non-active statuses are left unchanged.

Mutation contract:

- helper mutates each matched run in place: `run["status"] = "stopped"`.
- helper does not clone run dicts.

## Callback Invocation Contract

For each stopped run:

1. helper sets `status="stopped"`.
2. helper invokes `on_stop(run)` with the mutated run dict.
3. helper appends stringified `run_id` to result list.

The helper itself does not emit events or enqueue commands; those side effects are delegated to caller-provided callback logic.

## Service Integration Path

`VmRunControlService.stop_all_runs(...)` wraps helper under service lock:

- constructs closure `enqueue_stop_control(run)` that calls `_enqueue_control_command_locked(...)` with:
  - `action="stop"`
  - caller `requested_by`
  - current `control_mode`
  - `bulk=True`
- passes `_runs` map + `_ACTIVE_STATUSES` to `stop_active_runs(...)`.

Effect:

- helper owns selection/mutation.
- service callback owns `pending_controls` command creation and `run-control` event append.

## Test-Locked Invariants

`tests/backend/test_vm_run_control_bulk_stop.py` locks helper behavior:

- workspace filter is honored.
- only active statuses are stopped.
- callback is invoked exactly for stopped runs.
- `workspace_id=None` stops active runs across all workspaces.

`tests/backend/test_run_control_routes.py` locks route-level integration behavior:

- `/api/runs/stop-all` response count and ids match stopped runs.
- matching runs transition to `stopped`; non-target workspace runs remain unchanged.

## Drift Hotspots

1. Moving callback before `status="stopped"` would break callback assumptions and event payload status values.
2. Treating empty/whitespace workspace IDs as literal values instead of normalized `None` can silently skip all runs.
3. Returning non-string run ids can break response model assumptions in route surfaces.
4. Adding event/command behavior directly in helper can duplicate side effects already owned by service callback.

## Related Pages

- [VM Run Control Service Runtime Reference](vm_run_control_service_runtime_reference.md)
- [Runs Route and VM Control Service Reference](../api/runs_route_and_vm_control_service_reference.md)

