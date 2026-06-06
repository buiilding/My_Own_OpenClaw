---
title: "SDK Desktop Bootstrap Refactor Report"
summary: "Completion report for making Electron main a direct WindieAgent.startDesktop customer and deleting the Electron host wrapper."
read_when:
  - When reviewing the SDK desktop bootstrap cleanup or why Electron main no longer owns WebSocket, sidecar, or local-tool adapter setup.
  - When continuing cleanup around Electron main, SDK desktop runtime startup, local sidecar ownership, or windie:* IPC handlers.
---

# SDK Desktop Bootstrap Refactor Report

Last updated: 2026-05-28

## Goal

Make Electron main a thin SDK customer:

```js
const agent = await WindieAgent.startDesktop({
  apiKey,
  workspace,
  appName: "WindieOS",
});
```

Electron main should subscribe to SDK outputs and expose renderer IPC handlers
that call SDK agent methods. It should not construct the SDK backend session,
local runtime adapter, tool manifest, WebSocket implementation, display-row
projection, or current-turn projection.

## Completed Changes

- `WindieAgent.startDesktop(...)` now accepts the public desktop bootstrap
  contract: `apiKey`, `workspace`, and `appName`.
- Advanced/debug startup inputs are grouped under `endpoint`, `debug`,
  `connection`, and `testing` instead of being mixed into the normal Electron
  startup call.
- The SDK resolves install identity from `apiKey` through authenticated
  `GET /api/install/me`; Electron main no longer passes `userId` or
  `installId` during normal startup.
- Conversation selection moved out of startup. Electron sends
  `conversation_ref` through agent command payloads such as `run`, `rehydrate`,
  and `compactHistory`.
- The SDK now supplies the Node WebSocket implementation from its own `ws`
  dependency in Node runtimes, so Electron main does not pass `WebSocketImpl`
  during normal startup.
- Electron main imports `WindieAgent` directly, lazily starts the desktop agent,
  subscribes to `rows`, `status`, `conversationEvent`, `currentTurn`,
  connection, traffic, fallback, and raw backend events, then broadcasts
  renderer-safe `windie:*` outputs.
- Renderer IPC handlers now call the direct SDK agent methods:
  `run`, `stop`, `updateSettings`, `requestModelList`, `rehydrateMessages`,
  `compactHistory`, and `wakewordDetected`.
- `frontend/src/main/windie_agent_host.cjs` was deleted.
- The old Electron local-tool adapter path was removed from normal startup.
  Sidecar startup, tool discovery, local tool execution, and backend result
  return are SDK-owned by default.

## Previous Behavior

Electron main created a host wrapper that still knew too much about SDK
internals. It passed `WebSocketImpl`, endpoint wiring, install auth details,
and an Electron-local `executeLocalTool` adapter into `WindieAgent.startDesktop`.
That kept Electron main acting like an SDK host adapter instead of a normal SDK
consumer.

## Current Behavior

Electron main starts a `WindieAgent` directly with only the normal public
startup inputs: install token as `apiKey`, selected `workspace`, and
`appName`. The SDK owns desktop runtime bootstrap, install-token identity
lookup, endpoint defaults, connection lifecycle events, and reusable
conversation/tool semantics. Electron main keeps true desktop-shell duties:
windows, renderer IPC, settings gate, endpoint diagnostics, overlay side
effects, and renderer broadcasting.

## Validation

- `npm run build` in `packages/windie-sdk-js`
- `node -c frontend/src/main/ipc.cjs`
- `npm run test -- IpcMainSdkRuntimeBoundary ModularRefactorCompletionBoundary WindieSdkDesktopAgent IpcMainBridge.query IpcMainBridge.lifecycle WindieSdkClient --runInBand`
- `npm run typecheck` in `frontend`
- `npm run lint` in `frontend`
- `bin/windie docs list`
- `git diff --check`

The follow-up clean-startup slice also validated:

- `./scripts/python-in-env backend pytest tests/backend/test_install_auth.py -q`
- focused frontend SDK/runtime test suite with 118 passing tests

## Remaining Debt

Some older troubleshooting and inventory docs still describe the historical
main-process SDK host path. The canonical runtime docs and boundary tests now
describe the new ownership. Future docs-only cleanup should replace historical
references with `frontend/src/main/ipc.cjs` plus
`packages/windie-sdk-js/src/runtime/WindieDesktopAgent.ts`.
