---
summary: "Electron main local-backend bridge deep reference: readiness retry logic, JSON-RPC request correlation, mapped IPC handler registration, Linux screenshot window-hide guard, and stderr/error normalization behavior."
read_when:
  - When changing Electron main `local_backend_bridge*` modules, mapped memory handlers, or request timeout/retry behavior.
  - When debugging Linux screenshot self-capture, unknown sidecar response warnings, or renderer invoke payload mapping drift.
title: "Local Backend Bridge Handler and Window Guard Reference"
---

# Local Backend Bridge Handler and Window Guard Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/runtime_paths.cjs`

## Bridge Initialization Flow

`initializeLocalBackendBridge(getWindows)` performs:

1. resolve window accessors using `createWindowResolvers(...)`
2. start Python sidecar process (`startLocalBackend`)
3. register direct IPC handlers (`execute-tool`, `get-system-state`, `search-memory`)
4. register mapped RPC handlers from `COMPILED_RPC_HANDLER_DEFINITIONS`

## Window Resolver Contract

`createWindowResolvers(getWindows)` supports three input shapes:

- function provider: returns window object dynamically
- object with keys (`mainWindow`, `chatWindow`, optional `responseWindow`)
- single BrowserWindow object fallback

Resolver outputs:

- `resolveWindows()` -> `[mainWindow, chatWindow, responseWindow]` filtered by truthy values
- `resolveChatWindow()`
- `resolveResponseWindow()`

## Linux Screenshot Self-Capture Guard

`withHiddenWindowForScreenshot(...)` applies only on Linux (`process.platform === "linux"`).

Behavior:

1. capture visibility/focus/minimized state for all live windows
2. hide visible non-minimized windows
3. wait `320ms` before running screenshot task
4. restore windows and focus in `finally`

Overlay-specific restore rules:

- chat/response overlays prefer `showInactive()` when available
- overlays are re-raised with `setAlwaysOnTop(true, "floating")` and optional `moveTop()`
- chat overlay is blurred when it was previously not focused

Focused window restoration:

- previously focused window is re-focused after restore when still alive

## Sidecar Readiness Probe and Retry

Readiness ping contract:

- JSON-RPC method: `ping`
- request id format: `__readiness_check_<attempt>__`

Retry policy:

- max attempts: `10`
- retry delay: exponential `50ms * 2^(attempt-1)`, capped at `1000ms`
- per-attempt response timeout: `500ms`

Fail-open behavior:

- after max retries/timeouts, bridge logs warning and marks backend ready to avoid startup deadlock

## Request Correlation and Timeout Model

`sendRequest(...)`:

- creates UUID request id
- stores `{resolve,reject,timeout}` in `pendingRequests`
- default timeout: `30000ms`
- on timeout: removes pending entry and rejects with `Request timed out`

`handlePythonResponse(...)`:

- resolves pending promise when id matches
- rejects on JSON-RPC error envelope
- warns on unknown response ids

Process teardown behavior:

- `resetBackendProcessState(...)` rejects all pending requests with shared reason
- called on process exit/error paths

## IPC Handler Semantics

## `execute-tool`

- method: `execute_tool`
- timeout policy:
  - browser tool: `120000ms`
  - all other tools: `30000ms`
- screenshot tool on Linux runs through window-hide guard wrapper
- normalized return envelope:
  - success: `{success:true,data:...}`
  - failure: `{success:false,error:"..."}`

## `search-memory`

- method: `search_memory`
- params mapped through `mapSearchMemoryPayload(...)`
- supports either exclusion key:
  - `excludeConversationId`
  - `exclude_conversation_id`

## `get-system-state`

- method: `get_system_state`
- returns `null` on sidecar failure or `{success:false}` response

## Mapped RPC Handler Registry

`registerMappedRpcHandlers(...)` iterates `COMPILED_RPC_HANDLER_DEFINITIONS` and binds each with:

- channel name (renderer invoke channel)
- JSON-RPC method
- payload mapper

Mapped channels include:

- `list-conversations` -> `list_conversations`
- `get-conversation` -> `get_conversation`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-conversation` -> `delete_conversation`
- `delete-semantic-memory` -> `delete_semantic_memory`
- `store-memory` -> `store_memory`
- `store-transcript` -> `store_transcript`

## Payload Mapper Semantics

`createPayloadMapper(fieldMap)` supports three mapping modes per output key:

- direct source key (`"userId" -> user_id`)
- fallback key list (`["excludeConversationId","exclude_conversation_id"]`)
- function mapper (`conversation_id: ({conversationId}) => conversationId ?? null`)

`getPayloadObject(...)` hardens mapper input:

- non-object payloads become `{}` instead of throwing

## Utility Normalization and Noise Filtering

`local_backend_bridge_utils.cjs`:

- `getErrorMessage(...)`: stable string extraction from `Error` or unknown values
- `toErrorResponse(...)`: canonical `{success:false,error}` envelope
- `withLocalBackendNodeOptions(...)`: appends `--no-deprecation` if absent
- `shouldSuppressStderrLine(...)`: hides known Node deprecation noise lines from logs

## Debug Checklist

If renderer invoke succeeds but sidecar method never runs:

1. verify channel exists in `COMPILED_RPC_HANDLER_DEFINITIONS`
2. verify mapper output keys match sidecar method schema (snake_case where required)
3. inspect unknown-response warnings for request id drift

If Linux screenshot captures WindieOS overlays:

1. verify screenshot tool path uses `withHiddenWindowForScreenshot(...)`
2. verify overlay windows are included in resolver input
3. inspect restore warnings for `setAlwaysOnTop` failures

If requests fail intermittently with timeout:

1. inspect bridge timeout tier (`30s` vs `120s` browser)
2. inspect sidecar stdout JSON framing and readiness status
3. inspect pending request rejection reason after process exit/reset
