---
summary: "Frontend protocol error contract covering preload IPC validation failures, websocket bridge reconnect and send-failure synthesis, settings ACK timeout behavior, local-backend JSON-RPC fallback responses, and wakeword subprocess error status propagation."
read_when:
  - When changing `preload.js`, `ipc.cjs`, `local_backend_bridge.cjs`, or `wakeword_bridge.cjs` error behavior.
  - When debugging query send failures, settings-sync timeouts, or sidecar process startup failures.
title: "Frontend IPC, WS Bridge, and Local Backend Error-Recovery Contract Reference"
---

# Frontend IPC, WS Bridge, and Local Backend Error-Recovery Contract Reference

## Scope and Sources

Primary sources:

- Preload boundary: `frontend/src/preload.js`
- Main websocket bridge/state: `frontend/src/main/ipc.cjs`
- Synthetic query failure events: `frontend/src/main/ipc_query_events.cjs`
- Local backend bridge + utils: `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/local_backend_bridge_utils.cjs`
- Wakeword subprocess bridge: `frontend/src/main/wakeword_bridge.cjs`

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
4. forces overlay phase `idle`
5. broadcasts `ipc-status` disconnected
6. schedules reconnect in `5000ms`

On websocket error while open:

- calls `ws.close()` to converge into same close/reconnect path.

### Outbound Send Failure

`sendMessageToBackend(...)` returns `null` when:

- socket not connected/open,
- `currentUserId` missing,
- `ws.send(...)` throws.

For query sends, null result triggers synthesized failure event:

```json
{
  "type": "error",
  "id": "<queryMessageId>",
  "payload": {
    "message": "Unable to send query: backend connection is unavailable."
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

## Local Backend Bridge Error Surface (`local_backend_bridge.cjs`)

### JSON-RPC request-level failures

`sendRequestOrError(...)` wraps failures into canonical object:

```json
{ "success": false, "error": "<message>" }
```

Failure causes include:

- local backend not ready,
- request timeout,
- JSON-RPC error responses,
- stdin write failures.

### Process lifecycle failures

Failure notifications emitted to main window via `local-backend-status`:

| Failure case | Status payload |
|---|---|
| script file missing | `{ ready: false, error: "Local backend script not found: ..." }` |
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

## Wakeword Bridge Error Surface (`wakeword_bridge.cjs`)

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
- local-backend/wakeword status payload keys (`ready`, `error`) and channel names.
