---
summary: "Deep reference for Electron VM worker run-bridge runtime."
read_when:
  - When changing VM mode worker heartbeat/dispatch behavior in Electron main.
title: "VM Worker Runs Bridge Runtime Reference"
---

# VM Worker Runs Bridge Runtime Reference

## Scope

This page documents the Electron-main VM worker orchestration bridge:

- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`
- startup wiring in `frontend/src/main/index.cjs`
- Runtime contract tests:
  - `tests/frontend/VmWorkerRuntime.test.cjs`

## VM Mode and Worker Activation

Mode gates (`runtime_mode.cjs`):

- `isVmModeEnabled(env)` -> true only when `WINDIE_VM_MODE == "1"`.
- `isVmWorkerModeEnabled(env)`:
  - if `WINDIE_VM_WORKER_MODE` absent, inherits VM mode.
  - else true only when `WINDIE_VM_WORKER_MODE == "1"`.

Bootstrap in `index.cjs`:

- VM mode adds `vm_mode=1` query parameter when loading renderer window URL/file.
- When worker mode is enabled, main process creates one VM worker runtime and starts/stops it with app lifecycle.

## VM Worker Runtime Contract

`createVmWorkerRuntime(...)` requires injected callbacks:

- `getBackendConnectionState`
- `sendAutomatedQuery`
- `registerBackendMessageObserver`
- optional `sendStopQueryToBackend` for stop-control command application

Optional env inputs:

- `WINDIE_VM_WORKSPACE_ID` (default `default-workspace`)
- `WINDIE_VM_WORKER_ID` (else derived `worker-${userId}`)
- `WINDIE_VM_ID` (else derived `vm-${workerId}`)
- `WINDIE_VM_AGENT_ID`
- `WINDIE_VM_WORKER_HEARTBEAT_MS` (min 1000ms, default 5000ms)
- runs API key resolution (first non-empty):
  - `WINDIE_VM_RUNS_API_KEY`
  - `WINDIE_RUNS_API_KEY`

If a key resolves and the host skin supplies a runs API key header, the worker
includes that header on all `/api/runs/*` HTTP calls. The WindieOS host skin
uses `x-windie-runs-key` for the hosted runs API.

Heartbeat interval parsing:

- Runtime parses heartbeat ms as integer.
- Non-numeric, partial-numeric, decimal, or `< 1000` values are clamped back to
  default `5000`.

## Heartbeat Tick Loop

Every interval (plus immediate first tick), runtime:

1. Reads backend connection state.
2. Skips tick unless websocket is connected and `backendHttpUrl` + `userId` are available.
3. Posts `POST /api/runs/workers/heartbeat` with worker/session status.
4. Applies returned `control_commands`.
5. Dispatches one `assigned_run` when present.

Guardrails:

- `inTick` prevents overlapping heartbeat requests.
- Runtime no-ops safely on malformed command/run payloads.
- Worker heartbeat payload details:
  - `session_id` fallback order: `connection.sessionId` -> `connection.serverUserId` -> `userId`
  - `status` is computed as:
    - `running` when there is at least one active run mapping
    - `ready` when no active run mapping exists

## Assigned Run Dispatch Path

For assigned runs, runtime:

1. Validates `run_id`, `conversation_ref`, `query`.
2. Normalizes `files[]` and builds multiline attachment context from artifact refs.
3. Calls `sendAutomatedQuery({ text, conversationRef, attachmentContext, attachmentFilenames })`, which delegates dispatch orchestration to `ipc_automated_query_dispatcher.cjs`.
4. On success:
  - stores mapping `conversation_ref <-> run_id`
  - acks `POST /api/runs/{run_id}/worker-dispatched` with `turn_ref`
5. On failure:
  - writes error event to `POST /api/runs/{run_id}/events` with `event_type="error"`.

Dispatch dedupe/validation:

- Run dispatch requires non-empty `run_id`, `conversation_ref`, and `query`.
- If `run_id` is already active in map state, dispatch is skipped.
- `files[]` is normalized to artifact-backed refs only (`artifact_id` required, `filename/content_type` optional).

## Backend Stream Relay Path

Runtime subscribes to backend messages via `registerBackendMessageObserver`.

For active mapped runs:

- forwards stream envelopes to `POST /api/runs/{run_id}/events` with:
  - `event_type = backend type`
  - payload shape:
    - `payload.payload = original backend payload object`
    - `payload.conversation_ref`, `payload.turn_ref`, `payload.session_id`, `payload.user_id`
- clears run mapping after terminal `streaming-complete` or `error`.

## Control Command Application

Current implementation only executes `stop` controls:

- resolves run -> conversation mapping
- sends websocket message `type="stop-query"` with `{ conversation_ref }`
- emits run timeline event `run-control-applied` to `/api/runs/{run_id}/events`

Other command actions are ignored by worker runtime today.

Control command no-op cases:

- command is non-object
- action is not `stop`
- command has no `run_id`
- `run_id` does not resolve to an active conversation mapping
- `sendStopQueryToBackend` dependency is not provided

## Worker Runtime Lifecycle Cleanup

`start()`:

- installs backend observer callback
- executes one immediate heartbeat tick
- starts interval heartbeat loop

`stop()`:

- unregisters backend observer (when available)
- clears heartbeat interval
- clears both conversation<->run mapping maps

This makes worker stop idempotent and prevents stale run mappings across app lifecycle transitions.

## Renderer Integration Points

- VM-mode renderer helper `renderer/infrastructure/runtime/vmMode.js` reads URL query `vm_mode=1` for surface behavior toggles.

## Test Coverage Pointers

- VM worker runtime tests: `tests/frontend/VmWorkerRuntime.test.cjs`
- Runtime mode env tests: `tests/frontend/RuntimeMode.test.cjs`
