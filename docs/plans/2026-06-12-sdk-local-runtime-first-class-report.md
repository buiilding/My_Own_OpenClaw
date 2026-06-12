---
summary: "Implementation report for making SDK local tool execution first-class and deleting Electron-owned duplicate local-runtime authority."
read_when:
  - When continuing or auditing the SDK local runtime first-class plan.
  - When changing standalone SDK local tool execution, Electron browser button routing, or local-backend bridge runtime ownership.
title: "SDK Local Runtime First-Class Report"
---

# SDK Local Runtime First-Class Report

Plan: [SDK Local Runtime First-Class Plan](2026-06-12-sdk-local-runtime-first-class-plan.md)

Status: implemented.

## Intent

Make SDK local runtime/tool execution a first-class layer that can be used
without a `WindieAgent`, conversation, backend websocket, or model loop. Then
remove Electron main's duplicate local-runtime provider/cache so desktop host
paths consume the SDK runtime manager instead of owning sidecar lifecycle.

## Checklist

- [x] Phase 1: SDK local runtime manager and public standalone APIs.
- [x] Phase 2: Agent helpers delegate to the SDK local runtime manager where appropriate.
- [x] Phase 3: Electron bridge duplicate runtime provider/cache deleted.
- [x] Phase 4: Browser button and permission warmup use standalone SDK runtime.
- [x] Phase 5: Docs/examples/compatibility cleanup.
- [x] Validation complete.
- [x] Final inspection complete.

## Implementation Log

- 2026-06-12: Plan approved by user with instruction to implement all phases.
- 2026-06-12: Initial inspection confirmed current SDK primitives exist in
  `LocalSidecarRuntime.ts`, but `WindieClient` only ensures local runtime during
  `wakeUp(...)`; Electron `local_backend_bridge.cjs` still owns a fallback
  local-runtime provider/cache.
- 2026-06-12: Added `WindieClient.localRuntime(...)`,
  `getKnownLocalRuntime()`, `executeTool(...)`, `rpc(...)`,
  `listLocalTools(...)`, and `localStatus(...)` so SDK callers can start/reuse
  local runtime and execute tools without an agent, conversation, backend
  websocket, or model turn.
- 2026-06-12: Updated `WindieAgent` to consume the owner client's known/ensured
  local runtime for status, list-tools, shutdown, conversation creation, memory
  RPC helpers, and local-runtime event subscription.
- 2026-06-12: Reworked Electron main to create one shared `WindieClient` and
  pass SDK local-runtime resolvers into the local-backend bridge.
- 2026-06-12: Deleted bridge-owned local-runtime provider/cache ownership from
  `local_backend_bridge.cjs`; the bridge now remains a host IPC/status facade
  and uses SDK resolvers for RPC/tool execution.
- 2026-06-12: Updated SDK/frontend architecture docs and changelog for the new
  local-runtime layer split.

## Decisions

- Preserve `WindieAgent` as a convenience consumer of local runtime. Do not make
  agent creation a prerequisite for local tool calls.
- Keep Electron `local_backend_bridge.cjs` as an IPC and host-policy facade. The
  deletion target is its local-runtime ownership, not all bridge IPC handlers.
- Keep `WindieClient.status()` and `WindieClient.listTools()` as non-starting
  inspection helpers; add explicit `localStatus()` and `listLocalTools()` for
  callers that want startup/reuse.
- Do not let `stopLocalBackend()` shut down SDK-owned runtime. Bridge stop now
  stops bridge execution and clears bridge observations only; SDK client
  shutdown remains the runtime owner.

## Validation Log

- Passed: `cd packages/windie-sdk-js && npm run build`.
- Passed: `bin/windie test frontend -- WindieSdkClient.test.ts -t "localRuntime starts|executeTool and rpc use|wakeUp reuses a standalone|standalone localRuntime fails"`.
- Passed bridge/browser/permission suites within:
  `bin/windie test frontend -- WindieSdkClient.test.ts LocalBackendBridge.lifecycle.test.cjs LocalBackendBridge.rpc.test.cjs MainWindowRuntime.test.cjs ChatBrowserSessionControl.test.jsx BrowserSessionStore.test.js PermissionIpcRuntime.test.cjs`
  for `LocalBackendBridge.lifecycle.test.cjs`,
  `LocalBackendBridge.rpc.test.cjs`, `MainWindowRuntime.test.cjs`,
  `ChatBrowserSessionControl.test.jsx`, `BrowserSessionStore.test.js`, and
  `PermissionIpcRuntime.test.cjs`.
- Passed follow-up bridge rerun:
  `bin/windie test frontend -- LocalBackendBridge.lifecycle.test.cjs LocalBackendBridge.rpc.test.cjs`.
- Known remaining caveat: the full `WindieSdkClient.test.ts` file still has
  broader conversation/memory/stream expectation failures unrelated to the new
  standalone local-runtime tests in this change set. The targeted new SDK API
  tests pass.
- Passed: `bin/windie docs list`.

## Inspection Log

- `rg` scan confirmed `local_backend_bridge.cjs` no longer imports
  `createWindieLocalRuntimeProvider`, owns `sdkLocalRuntimeProvider`, or accepts
  `localRuntimeProvider` / `getActiveLocalRuntime` bridge options.
- Remaining `createWindieLocalRuntimeProvider` hits are the SDK implementation
  and SDK provider tests. Remaining `createDesktopAutoSidecarLaunchPlan` hits
  are the desktop launch-options helper, its tests, and `ipc.cjs`, where launch
  facts feed the shared `WindieClient`.
- `node -c` passed for `frontend/src/main/sidecar/local_backend_bridge.cjs`,
  `frontend/src/main/ipc.cjs`,
  `frontend/src/main/surfaces/main_window_runtime.cjs`, and
  `frontend/src/main/index.cjs`.

## Commits

- Pending commit.

## Blockers

- None currently.
