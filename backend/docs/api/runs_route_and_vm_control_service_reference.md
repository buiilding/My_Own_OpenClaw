---
summary: "Deep reference for `/api/runs` hosted VM control-plane routes and `VmRunControlService` state/event semantics."
read_when:
  - When changing run-control HTTP endpoints, worker heartbeat assignment, or run event ingestion behavior.
  - When debugging VM worker dispatch, stop-control propagation, or active-run limit failures.
title: "Runs Route and VM Control Service Reference"
---

# Runs Route and VM Control Service Reference

## Scope

This page documents the hosted VM run-control contract implemented by:

- `backend/src/api/routes/runs/router.py`
- `backend/src/api/routes/runs/models.py`
- `backend/src/api/routes/runs/route_helpers.py`
- `backend/src/api/routes/runs/response_builders.py`
- `backend/src/services/vm_run_control.py`
- `backend/src/services/vm_run_control_support/vm_run_control_assignment.py`
- `backend/src/services/vm_run_control_support/vm_run_control_bulk_stop.py`
- `backend/src/services/vm_run_control_support/vm_run_control_event_log.py`
- `backend/src/services/vm_run_control_support/vm_run_control_event_payloads.py`
- `backend/src/services/vm_run_control_support/vm_run_control_pending_controls.py`
- `backend/src/services/vm_run_control_support/vm_run_control_transitions.py`
- `backend/src/services/vm_run_control_support/vm_run_control_worker_state.py`

This flow is HTTP-only and separate from the `/ws` chat transport. It is designed as a lightweight control plane for VM worker orchestration.

Route-level helper/auth/bootstrap details are documented separately in:

- [Runs Route Support Helpers and API-Key Guard Reference](runs_route_support_helpers_and_api_key_guard_reference.md)
- [Runs Route Models Reference](runs_route_models_and_package_export_contract_reference.md)
- [Runs Route Helper Validation and Incremental Events Projection Contract Reference](runs_route_helper_validation_and_incremental_events_projection_contract_reference.md)
- Route helper projections/validation in `route_helpers.py`:
  - `validate_control_request(...)` centralizes `set-control-mode` guardrails.
  - `build_run_events_response(...)` centralizes incremental event response shaping.

## Service Support Module Boundaries

`VmRunControlService` owns lock-scoped orchestration and delegates pure shaping/mutation to helper modules:

- `vm_run_control_assignment.py`: queue pop/worker ownership checks and `run-worker-assigned` event append.
- `vm_run_control_transitions.py`: action/event/heartbeat status transitions.
- `vm_run_control_pending_controls.py`: control command creation + one-shot command draining.
- `vm_run_control_event_log.py`: append/select event helpers with deep-copy output and sequence increments.
- `vm_run_control_event_payloads.py`: canonical payload shape builders for created/assigned/control/dispatched events.
- `vm_run_control_worker_state.py`: run and registry worker snapshot shaping with metadata copy semantics.
- `vm_run_control_bulk_stop.py`: workspace-filtered active-run stop loop used by `/stop-all`.

## Route Registration and Protection

Registered in `backend/src/api/routes/__init__.py` as:

- `runs_router` imported from `backend.src.api.routes.runs.router` and mounted at `/api/runs`

Shared-key auth:

- Header: `x-windie-runs-key`
- Accepted env var: `WINDIE_RUNS_API_KEY`
- If the env var is not set, routes fail closed with HTTP `503`.

Service lifecycle:

- Route dependency `get_vm_run_control_service(...)` stores one in-memory `VmRunControlService` on `app.state.vm_run_control_service`.
- Active run cap env: `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE` (default `1`, min effective value `1`).

## In-Memory Run State Model

Per-run persisted fields include:

- Identity/context: `run_id`, `workspace_id`, `agent_id`, `conversation_ref`, `query`, `requested_by`
- Attachment metadata: `files[]` (artifact refs only; no binary payloads)
- Runtime: `status`, `control_mode`, `worker`, `last_heartbeat_at`, `query_message_id`
- Control queue: `pending_controls[]`
- Event stream: `events[]`, `last_event_seq`
- Timestamps: `created_at`, `updated_at`

`status` lifecycle used by service code:

- Active set: `awaiting_worker`, `queued`, `running`, `paused`
- Terminal/non-active states include: `completed`, `failed`, `stopped`

`control_mode` values used by API model:

- `agent_only`
- `shared_control`
- `human_override`

`create_run(...)` conversation reference policy:

- If `metadata.conversation_ref` is a non-empty string, it is used.
- Otherwise, fallback is `run-{run_id}`.

## Endpoint Behavior Matrix

### `POST /api/runs/`

Creates a run in `awaiting_worker` with `control_mode="agent_only"`.

- Emits event `run-created` (`source="api"`, `seq=1` for new run).
- Enqueues run id into workspace queue.
- Returns `409` when workspace active-run cap is reached.

### `POST /api/runs/workers/heartbeat`

Worker poll/registration endpoint.

- Registers/updates worker record (`workspace_id`, `worker_id`, `vm_id`, `user_id`, `session_id`, `status`, metadata).
- If worker is `ready` or `running`, tries queue assignment:
  - Pops workspace queue ids until finding first eligible run with status `awaiting_worker|queued`.
  - Rejects run if it is bound to a different worker id.
  - On assign: sets run `worker`, `last_heartbeat_at`, status `queued`, emits `run-worker-assigned`.
- Returns one `assigned_run` max.
- Returns `control_commands[]` drained from matching worker-owned runs (one-shot delivery).

### `GET /api/runs/{run_id}`

Returns current run snapshot (without embedding full `events[]` in model output).

### `GET /api/runs/{run_id}/events`

Incremental event polling.

- Filters to `seq > after_seq`
- Enforces `limit` range `1..1000`
- Returns `next_after_seq` as last returned seq (or provided `after_seq` if none).

### `POST /api/runs/{run_id}/events`

Ingests worker/backend stream events into run timeline.

- Default source: `worker-stream`
- Status transition rules:
  - `streaming-complete` -> `completed`
  - `error` -> `failed`
  - otherwise `awaiting_worker|queued` -> `running` (non-active statuses are unchanged)

### `POST /api/runs/{run_id}/control`

Applies control action and queues command for worker pickup.

Supported actions:

- `pause` -> run status `paused`
- `resume` -> `running` if worker exists else `awaiting_worker`
- `stop` -> `stopped`
- `set-control-mode` -> updates `control_mode` (requires `control_mode` field)

Action normalization:

- Service normalizes control action as `strip().lower()` before transition/queueing.

Every action appends:

- `pending_controls += {command_id, action, requested_by, control_mode, created_at}`
- event `run-control` (`source="api"`)

### `POST /api/runs/stop-all`

Bulk stop helper.

- Optional workspace filter.
- Workspace filter is trimmed; blank values behave like no filter.
- Only active-status runs are affected.
- Each affected run receives `status="stopped"`, one queued `stop` command, and `run-control` event payload with `bulk=true`.
- Service implementation delegates filtering/mutation loop to `vm_run_control_bulk_stop.stop_active_runs(...)` and injects the queued-control callback from `VmRunControlService`.

### `POST /api/runs/{run_id}/worker-dispatched`

Worker ack after query send to backend websocket path.

- Validates worker ownership (`worker_id`) and user compatibility.
- Sets run `status="running"`, stores `query_message_id=turn_ref`.
- Optional `conversation_ref` override if non-empty.
- Emits `run-dispatched` (`source="worker"`).

## Event/Sequence Guarantees

- Events are append-only and ordered by per-run `seq`.
- `last_event_seq` increments by one on every event write.
- API responses deep-clone run/event payloads before returning, so callers cannot mutate service state by reference.
- Event polling applies bounded selection (`seq > after_seq`) and clamps limits to `1..1000`.

## Concurrency and Durability

- All service mutation paths are guarded by a single `asyncio.Lock`.
- Storage is in-memory only; restarting backend drops runs, workers, and event history.
- This implementation is suitable for demo/runtime orchestration but is not a durable multi-instance scheduler.

## Integration Contract with Frontend VM Worker

Expected worker loop behavior (implemented by the Electron main VM worker runtime):

1. Poll `POST /workers/heartbeat`.
2. If `assigned_run` present, dispatch query and ack `POST /worker-dispatched`.
3. Relay backend stream events to `POST /{run_id}/events`.
4. Apply `control_commands` (currently `stop`) to websocket `stop-query` path.

## Test Coverage Pointers

- Backend route tests: `tests/backend/test_run_control_routes.py`
- Frontend VM worker integration tests: `tests/frontend/VmWorkerRuntime.test.cjs`
