---
summary: "Deep reference for Electron-main memory-store event persistence: payload-first mapping, session fallback order, fire-and-forget write semantics, and fail-open logging behavior before renderer fan-out."
read_when:
  - When changing backend `memory-store` event handling in `ipc.cjs` or `ipc_runtime_helpers.cjs`.
  - When debugging duplicated interaction-memory rows, missing `session_id` on persisted events, or swallowed `storeMemory` failures.
title: "IPC Memory-Store Event Persistence Payload Fallback and Fail-Open Logging Contract Reference"
---

# IPC Memory-Store Event Persistence Payload Fallback and Fail-Open Logging Contract Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_memory_store_persistence.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `tests/frontend/IpcMemoryStorePersistence.test.cjs`
- `tests/frontend/IpcMainBridge.query.test.cjs`

## Ownership Boundary

`ipc_memory_store_persistence.cjs` owns the main-process side effect for backend `memory-store` events:

- map backend event shape to local `storeMemory(...)` payload
- execute one asynchronous persistence write from Electron main process
- log and suppress persistence failures

Renderer windows only receive the original backend event fan-out and do not write memory rows directly.

## Payload Mapping Contract (`mapMemoryStoreEventPayload`)

Mapped output fields:

- `user_query = event.payload.user_query`
- `assistant_response = event.payload.assistant_response`
- `memory_type = event.payload.memory_type || "episodic"`
- `user_id = event.payload.user_id || event.user_id`
- `session_id = event.payload.session_id || event.session_id || event.conversation_ref`

Precedence rules:

- payload-level identity fields override envelope-level fields
- `conversation_ref` is only used as final fallback for `session_id`

## Persist Contract (`persistMemoryStoreEvent`)

Input:

- `eventData` backend event envelope
- deps:
  - `storeMemory` function (optional)
  - `log` function (optional, default no-op)

Behavior:

1. if `storeMemory` is not a function -> no-op
2. otherwise call `storeMemory(mappedPayload)` in fire-and-forget mode (`void ...catch(...)`)
3. on rejection, emit log line:
   - `Main-process memory-store persistence failed: <error.message>`

No exception is thrown to caller.

## Integration Flow Contract

Backend message path:

1. `ipc.cjs` receives websocket message
2. `ipc_runtime_helpers.processBackendMessageData(...)` checks `data.type === "memory-store"`
3. callback `onMemoryStoreEvent(data)` is invoked
4. `ipc.cjs` callback delegates to `persistMemoryStoreEvent(data, { storeMemory, log })`
5. event still broadcasts to all renderer windows via `from-backend`

Key invariant:

- persistence side effect executes in main process exactly once per backend event, independent of renderer window count
- `memory-store` is a valid post-terminal event and must still persist after `streaming-complete`

## Failure and Safety Semantics

- missing/invalid deps are fail-open (no crash, no throw)
- persistence rejection does not block renderer fan-out
- mapping keeps nullable fields (for example missing `session_id`) instead of inventing synthetic values

## Test-Backed Invariants

`tests/frontend/IpcMemoryStorePersistence.test.cjs` validates:

- payload-first field precedence and envelope fallbacks
- default `memory_type="episodic"`
- `conversation_ref` fallback when `session_id` absent
- rejection logging behavior
- no-op behavior when `storeMemory` is unavailable

`tests/frontend/IpcMainBridge.query.test.cjs` validates:

- backend `memory-store` events persist exactly once in main process before renderer fan-out

## Drift Hotspots

1. Moving persistence back into renderer event handlers can duplicate writes per open window.
2. Changing fallback precedence can break session attribution for historical interaction rows.
3. Awaiting persistence in websocket hot path can delay realtime renderer event delivery.
4. Throwing from persistence helper can break unrelated backend-event processing.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
