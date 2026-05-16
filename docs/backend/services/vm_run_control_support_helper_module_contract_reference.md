---
summary: "Deep reference for `vm_run_control_support/*` helper modules: assignment, transitions, pending-control draining, event log sequencing, payload shaping, and worker-state normalization contracts."
read_when:
  - When changing helper behavior under `backend/src/services/vm_run_control_support/*`.
  - When debugging VM run-control queue assignment, control command draining, or event/payload shape drift in `VmRunControlService`.
title: "VM Run Control Support Helper Module Contract Reference"
---

# VM Run Control Support Helper Module Contract Reference

## Canonical Modules

- `backend/src/services/vm_run_control_support/vm_run_control_assignment.py`
- `backend/src/services/vm_run_control_support/vm_run_control_transitions.py`
- `backend/src/services/vm_run_control_support/vm_run_control_pending_controls.py`
- `backend/src/services/vm_run_control_support/vm_run_control_event_log.py`
- `backend/src/services/vm_run_control_support/vm_run_control_event_payloads.py`
- `backend/src/services/vm_run_control_support/vm_run_control_worker_state.py`
- `backend/src/services/vm_run_control_support/vm_run_control_helpers.py`
- `backend/src/services/vm_run_control.py`
- `tests/backend/test_vm_run_control_assignment.py`
- `tests/backend/test_vm_run_control_transitions.py`
- `tests/backend/test_vm_run_control_pending_controls.py`
- `tests/backend/test_vm_run_control_event_log.py`
- `tests/backend/test_vm_run_control_event_payloads.py`
- `tests/backend/test_vm_run_control_bulk_stop.py`

## Ownership Boundary

`VmRunControlService` owns lock-scoped orchestration and delegates deterministic pure/helper logic to `vm_run_control_support/*`.

Helper modules do not own:

- async locking
- HTTP error mapping
- API model projection

Those concerns remain in:

- `backend/src/services/vm_run_control.py`
- `backend/src/api/routes/runs/*`

## Assignment Helper Contract

`assign_next_run_to_worker(...)` (`vm_run_control_assignment.py`):

- no assignment when `worker_status` is not in ready set (`ready_worker_statuses`)
- pops queue ids until it finds an eligible run
- skips runs that:
  - are missing
  - are not in `awaiting_worker|queued`
  - are bound to a different worker id
- on assignment:
  - writes run-local worker snapshot via `build_run_worker_state(...)`
  - sets `last_heartbeat_at`
  - sets run status to `queued`
  - appends `run-worker-assigned` event payload via callback
  - returns cloned run through injected `clone_run`

Test-backed invariants:

- `tests/backend/test_vm_run_control_assignment.py` locks skip behavior for non-ready workers and successful assignment side effects/event type.

## Transition Helper Contract

`vm_run_control_transitions.py`:

- `normalize_control_action(action)`:
  - trims and lowercases action strings
- `apply_control_transition(run, action, control_mode)`:
  - `pause` -> `paused`
  - `resume` -> `running` when worker exists else `awaiting_worker`
  - `stop` -> `stopped`
  - `set-control-mode` -> updates control mode when provided
- `apply_stream_event_transition(run, event_type, terminal_event_to_status)`:
  - terminal mapping (`streaming-complete`, `error`) wins
  - non-terminal events promote `awaiting_worker|queued` to `running`
- `apply_worker_heartbeat_transition(run, status, ready_worker_statuses)`:
  - promotes `awaiting_worker|queued` to `running` only for ready/running worker heartbeat statuses

Test-backed invariants:

- `tests/backend/test_vm_run_control_transitions.py` locks trim/lowercase normalization and transition tables.

## Pending-Control Helper Contract

`vm_run_control_pending_controls.py`:

- `create_control_command(...)` returns canonical command envelope:
  - `command_id`, `action`, `requested_by`, `control_mode`, `created_at`
- `collect_pending_control_commands_for_worker(runs, worker_id)`:
  - scans worker-owned runs only
  - appends `run_id` onto each command result
  - deep-copies command payloads
  - drains matching `pending_controls` lists to `[]` (one-shot delivery)

Test-backed invariants:

- `tests/backend/test_vm_run_control_pending_controls.py` locks command shape and one-shot drain behavior.

## Event-Log Helper Contract

`vm_run_control_event_log.py`:

- `append_run_event(...)`:
  - increments `last_event_seq` by exactly one
  - deep-copies payload input
  - updates `updated_at` to appended event timestamp
- `select_run_events(...)`:
  - returns deep-copied rows only
  - filters by `seq > max(after_seq, 0)`
  - clamps limit to `1..1000`

Test-backed invariants:

- `tests/backend/test_vm_run_control_event_log.py` locks deep-copy and sequence/filter behavior.

## Event-Payload Helper Contract

`vm_run_control_event_payloads.py` shapes canonical event payload fields:

- `build_run_created_payload(...)`
- `build_worker_assigned_payload(...)`
- `build_run_control_payload(...)`
- `build_run_dispatched_payload(...)`

Important behavior:

- `build_run_control_payload(..., bulk=True)` emits `bulk: true`; otherwise `bulk` is omitted.

Test-backed invariants:

- `tests/backend/test_vm_run_control_event_payloads.py` locks required fields and bulk-flag gating.

## Worker-State Helper Contract

`vm_run_control_worker_state.py`:

- run and registry worker snapshots normalize optional user/workspace ids (`strip`, empty -> `None`)
- metadata is deep-copied so caller-side mutation does not alias service state
- heartbeat event payload helper emits compact worker identity/status block

## Shared Utility Helper Contract

`vm_run_control_helpers.py`:

- `now_iso()` produces timezone-aware UTC ISO timestamp strings
- `normalize_optional_string(...)` trims and drops blank values
- `normalize_files(...)` keeps artifact-backed file refs only:
  - `artifact_id` required
  - `filename`/`content_type` optional and trimmed
- `build_run_event(...)` centralizes event row shape

## Drift Hotspots

1. Changing helper return shapes without updating `VmRunControlService` assumptions can break route model projection at runtime.
2. Removing deep-copy behavior in event/command helpers can leak mutable references into callers.
3. Diverging transition rules between helper modules and route/docs expectations can produce status drift (`queued` vs `running` promotion timing).
4. Relaxing queue assignment guards can allow worker hijack of runs already bound to another worker id.

## Related Pages

- [VM Run Control Service Runtime Reference](vm_run_control_service_runtime_reference.md)
- [VM Run Control Bulk-Stop Helper Contract Reference](vm_run_control_bulk_stop_helper_contract_reference.md)
- [Runs Route and VM Control Service Reference](../api/runs_route_and_vm_control_service_reference.md)
- [Runs Route Helper Validation and Incremental Events Projection Contract Reference](../api/runs_route_helper_validation_and_incremental_events_projection_contract_reference.md)
