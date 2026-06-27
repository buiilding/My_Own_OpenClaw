---
summary: "Frontend protocol error contract covering preload IPC validation failures, websocket bridge reconnect and send-failure synthesis, settings ACK timeout behavior, local-runtime JSON-RPC fallback responses, and wakeword subprocess/helper error status propagation."
read_when:
  - When changing `preload.js`, `ipc.cjs`, `local_runtime_bridge.cjs`, `wakeword_bridge.cjs`, or `wakeword_bridge_runtime.cjs` error behavior.
  - When debugging query send failures, settings-sync timeouts, or local-runtime startup failures.
title: "Frontend IPC, WS Bridge, and Local Runtime Error-Recovery Contract Reference"
---

# Frontend IPC, WS Bridge, and Local Runtime Error-Recovery Contract Reference

## Coverage Snapshot (2026-02-27)

- Error-related protocol test files: `6`
- Total test cases across listed files: `64`

## Scope and Sources

Primary sources:

- Preload boundary: `frontend/src/preload.js`
- Main websocket bridge/state: `frontend/src/main/ipc.cjs`
- Settings-sync ACK timeout helpers: `frontend/src/main/ipc/ipc_settings_sync.cjs`
- Synthetic query failure events: `frontend/src/main/ipc/ipc_query_events.cjs`
- Local-runtime bridge + utils: `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_utils.cjs`
- Wakeword subprocess bridge: `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`

Primary error-path tests:

- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`

## Preload IPC Validation Error Surface

`window.ipc` behavior in preload:

| API | Invalid channel behavior |
|---|---|
| `invoke(channel, data)` | Rejects promise with `Error("Invalid invoke channel: <channel>")` |
| `send(channel, data)` | Silently no-op (channel ignored) |
| `on(channel, fn)` | Silently no-op / no subscription returned |
| `once(channel, fn)` | Silently no-op |

Implication:

- Only `invoke` gives explicit renderer-visible rejection for bad channels.
- `send`/`on` misuse can fail quietly unless renderer has separate guards.

## Main WS Bridge Failure and Recovery Contract (`ipc.cjs`)

### Connection Loss

On websocket close:

1. marks disconnected (`isConnected=false`)
2. resets settings gate/pending ACK state
3. clears session/user/conversation refs from backend
4. preserves active display-affinity cache for reconnect-time monitor continuity
5. forces overlay phase `idle`
6. broadcasts `ipc-status` disconnected
7. schedules reconnect in `1000ms`

On websocket error while open:

- calls `ws.close()` to converge into same close/reconnect path.

### Outbound Send Failure

SDK runtime backend sends return `null` when:

- socket not connected/open,
- `currentUserId` missing,
- `ws.send(...)` throws.

For query sends, null result triggers synthesized failure event:

```json
{
  "type": "error",
  "id": "<queryMessageId>",
  "payload": {
    "message": "Your message wasn't sent because WindieOS isn't connected right now. Try again when the connection is restored."
  }
}
```

Context fields are included when available (`turn_ref`, `session_id`, `user_id`, `conversation_ref`).

## Settings ACK Timeout Contract

Settings update gating behavior:

- Each outbound `update-settings` waits for ACK by message id.
- ACK timeout fixed at `2500ms`.
- Timeout resolves pending promise as `false` and logs timeout source.
- In-flight ACK map cleared on reconnect/close to avoid stale waits.

ACK resolution paths:

- backend message `type='settings-updated'` + matching `id` => success
- backend message `type='error'` + matching `id` => failure
- timeout => failure

## Local Runtime Bridge Error Surface (`local_runtime_bridge.cjs`)

### JSON-RPC request-level failures

`sendRequestOrError(...)` wraps failures into canonical object:

```json
{ "success": false, "error": "<message>" }
```

Failure causes include:

- local runtime not ready,
- request timeout,
- JSON-RPC error responses,
- stdin write failures.

### Process lifecycle failures

Failure notifications emitted to main window via `local-runtime-status`:

| Failure case | Status payload |
|---|---|
| script file missing | `{ ready: false, error: "Local runtime daemon script not found: ..." }` |
| spawn `ENOENT` | `{ ready: false, error: "Python executable '<path>' not found..." }` |
| non-zero process exit | `{ ready: false, error: "Python process exited with code <n>" }` |
| runtime process error | `{ ready: false, error: "<error.message>" }` |

Internal cleanup on process failure/exit:

- reject all pending JSON-RPC promises,
- clear readiness callback state,
- reset stdout buffer + process refs.

### Readiness probe fallback semantics

- `ping` readiness retries up to 10 attempts.
- per-attempt callback timeout: `500ms`.
- if all retries fail/time out, bridge logs warning and still marks ready (anti-deadlock behavior).

## Wakeword Bridge Error Surface (`wakeword_bridge.cjs` + `wakeword_bridge_runtime.cjs`)

Status propagation channel: `wakeword-status`.

| Failure class | Emitted payload |
|---|---|
| Python reports JSON stderr `{status:'error'}` | `{ ready: false, error: <message> }` |
| subprocess spawn `ENOENT` | `{ ready: false, error: "Python executable '<path>' not found..." }` |
| subprocess non-zero exit | `{ ready: false, error: "Python process exited with code <n>" }` |
| normal stop/exit | `{ ready: false }` |

Other robustness details:

- malformed/partial stderr JSON lines are ignored.
- known noisy graphics-driver warnings are suppressed.
- detection parse errors are logged but do not crash bridge loop.
- wakeword disable flushes buffered detection frames to prevent stale triggers.

## Drift Checks

When changing error semantics, keep aligned:

- preload allowlist behavior vs renderer typed IPC wrappers.
- query send failure envelope consumed by renderer stream/error handlers.
- settings ACK timeout constant and expected UX fallback behavior.
- local-runtime/wakeword status payload keys (`ready`, `error`) and channel names.
- helper-level startup/process error mapping in `wakeword_bridge_runtime.cjs` (packaged-vs-dev missing-runtime guidance, ENOENT executable guidance).

## Error Control-Path Index

| Error control path | Runtime owner | Recovery/safety contract |
|---|---|---|
| invalid IPC channel invoke/send/listen | `frontend/src/preload.js` + renderer bridge wrapper | invalid `invoke` rejects; invalid `send/on/once` do not cross boundary |
| websocket disconnect/error converge path | `frontend/src/main/ipc.cjs` | socket errors converge into close path; state reset + reconnect timer restoration |
| query send unavailable fallback | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_query_events.cjs`, `frontend/src/main/ipc/ipc_query_broadcast.cjs` | failed send emits an SDK `turn_error` conversation event with preserved turn/session context |
| settings ACK timeout fallback | `frontend/src/main/ipc.cjs` | unresolved ACKs auto-resolve false after `2500ms`; pending maps cleared on reconnect |
| local-runtime request/process failure handling | `frontend/src/main/sidecar/local_runtime_bridge.cjs` | RPC failures normalize to `{success:false,error}`; process failure rejects pending requests and broadcasts unavailable status |
| wakeword subprocess failure/status handling | `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs` | startup/exit/stderr failures normalize to `wakeword-status` `{ready:false,error?}` without crashing bridge loops; helper runtime provides deterministic error/status normalization |

## Related Deep Dives

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)
