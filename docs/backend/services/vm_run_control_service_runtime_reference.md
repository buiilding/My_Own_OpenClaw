---
summary: "Service-level deep reference for `VmRunControlService`: queue assignment, status transitions, control-command buffering, and event sequencing semantics."
read_when:
  - When changing `backend/src/services/vm_run_control.py` internal state transitions or queueing logic.
  - When debugging worker assignment races, duplicate control commands, or run status drift.
title: "VM Run Control Service Runtime Reference"
---

# VM Run Control Service Runtime Reference

## Canonical Module

- `backend/src/services/vm_run_control.py`
- `backend/src/services/vm_run_control_helpers.py`
- `backend/src/services/vm_run_control_worker_state.py`

## Runtime State Containers

`VmRunControlService` maintains four in-memory maps:

- `_runs: Dict[run_id, run_state]`
- `_workers: Dict[worker_id, worker_state]`
- `_workspace_run_queues: Dict[workspace_id, List[run_id]]`
- `_max_active_runs_per_workspace: int`

Synchronization:

- all mutation/read paths are serialized under one `asyncio.Lock` (`self._lock`)

## Run Lifecycle Semantics

Initial run state (`create_run`):

- `status = "awaiting_worker"`
- `control_mode = "agent_only"`
- `last_event_seq = 0`
- one appended `run-created` event (`seq=1`)
- run id enqueued into workspace queue

Conversation ref rule:

- if `metadata.conversation_ref` is present and non-empty, use it
- else default `conversation_ref = "run-{run_id}"`

Active-run cap enforcement:

- counts runs in statuses `{awaiting_worker, queued, running, paused}`
- rejects new run when cap reached

## Worker Assignment Path

`register_worker_heartbeat(...)` performs:

1. upsert worker record
2. if worker status is `ready|running`, attempt queue assignment
3. collect pending control commands for that worker

Worker state shaping is centralized in `vm_run_control_worker_state.py`:

- `build_registry_worker_state(...)` for `_workers` map entries
- `build_run_worker_state(...)` for run-local worker snapshots
- `build_worker_heartbeat_event_payload(...)` for `worker-heartbeat` event payloads

Assignment constraints (`_assign_next_run_to_worker_locked`):

- workspace id must match queue
- run status must be `awaiting_worker|queued`
- if run already has worker binding, worker id must match current worker

Assignment side effects:

- run `worker` block refreshed
- run `status = "queued"`
- run `last_heartbeat_at` set
- event appended: `run-worker-assigned`

## Dispatch and Stream Transition Path

Dispatch ack (`acknowledge_run_dispatch`):

- validates run exists and bound worker matches
- validates worker/user compatibility
- sets:
  - `status = "running"`
  - `query_message_id = turn_ref`
  - optional conversation ref override
- appends `run-dispatched` event

Stream ingest (`append_stream_event`):

- always appends event with caller `event_type` + payload
- status transitions:
  - `streaming-complete` -> `completed`
  - `error` -> `failed`
  - otherwise `awaiting_worker|queued` -> `running`

## Control Command Buffering

Control update (`apply_control`):

- normalizes action to lowercase stripped string
- updates run status/control mode
- appends one command object to `pending_controls`
- appends `run-control` event with `command_id`

Bulk stop (`stop_all_runs`):

- iterates all runs, optional workspace filter
- only affects active statuses
- sets status `stopped`
- appends queued `stop` command and `run-control` event (`bulk=true`)

Worker drain behavior:

- `_collect_pending_control_commands_locked(worker_id)` returns queued commands for worker-owned runs
- after return, each run `pending_controls` is cleared (one-shot delivery)

## Legacy Run-Scoped Heartbeat Compatibility

`record_worker_heartbeat(...)` remains for compatibility paths/tests:

- updates run-local worker payload
- syncs `_workers[worker_id]`
- promotes run to `running` when status is `awaiting_worker|queued` and heartbeat status is `ready|running`
- appends `worker-heartbeat` event

## Event Sequencing Contract

`_append_event_locked(...)` guarantees:

- strictly increasing per-run `seq`
- `updated_at` set to event timestamp
- deep-copied payload protection on return paths

Caller safety:

- public APIs return deep clones (`deepcopy`) of run/event state, preventing accidental external mutation.

## Operational Limits and Durability

- designed as single-process, in-memory coordinator
- no persistence across backend restarts
- no distributed locking across backend instances

## Related Docs

- [Runs Route and VM Control Service Reference](../api/runs_route_and_vm_control_service_reference.md)
- [HTTP and WebSocket Endpoint Reference](../api/http_and_ws_endpoint_reference.md)
- [Services and Storage](services_and_storage.md)
