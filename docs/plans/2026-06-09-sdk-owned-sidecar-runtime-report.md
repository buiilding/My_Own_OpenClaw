---
summary: "Execution report for moving desktop sidecar startup/reuse into the SDK-owned WindieClient local-runtime path."
read_when:
  - When continuing or reviewing the SDK-owned sidecar runtime implementation.
  - When debugging desktop sidecar startup, chat loading, semanticization, or local tool execution after the SDK-owned sidecar runtime change.
title: "SDK-Owned Sidecar Runtime Report"
---

# SDK-Owned Sidecar Runtime Report

Plan: [SDK-Owned Sidecar Runtime Plan](2026-06-09-sdk-owned-sidecar-runtime-plan.md)

## Status

Implemented. Live desktop sidebar verification remains unrun in this slice; the
SDK store/client contract and bridge path are covered by focused tests.

## Checklist

- [x] SDK auto-sidecar options can express Electron desktop launch needs.
- [x] SDK provider rejects stale discovery records by launch context.
- [x] SDK provider starts packaged binary or packaged Python targets from explicit launch options.
- [x] SDK provider starts dev sidecar through the repo env wrapper or explicit Python path without losing `WINDIE_PYTHON_PATH`.
- [x] SDK `SidecarDaemonHttpClient` remains the only sidecar daemon HTTP/RPC client used by `WindieClient`.
- [x] Electron `WindieClient` construction no longer passes `ensureLocalRuntime` for sidecar startup.
- [x] `ensureDaemonBackedLocalRuntime()` is deleted.
- [x] Electron duplicate daemon RPC client is deleted or reduced to non-RPC host helpers.
- [x] Local backend readiness UI still reaches renderer.
- [x] Conversation metadata invalidation still reaches renderer.
- [x] Local tool execution, screenshot attachment materialization, and display bounds behavior still work.
- [ ] Chat conversation listing returns stored conversations in desktop startup.
- [x] Semantic summarizer daemon launch context still includes active auth and backend env.
- [x] No data migration is required.
- [x] Docs and changelog updated.
- [x] Focused tests pass.
- [x] Fresh inspection finds no remaining in-scope duplicate sidecar runtime client.

## Findings

- 2026-06-09: Approved plan target is for Electron main to behave like an advanced SDK example caller: compute desktop launch parameters, pass them to `WindieClient`, and let the SDK own daemon startup/reuse plus sidecar protocol semantics.
- 2026-06-09: SDK `WindieAutoSidecarOptions` now carries explicit command/args,
  cwd, env/env mode, launch context, and stderr callback details so Electron can
  pass desktop launch facts without passing a runtime implementation.
- 2026-06-09: Electron `ipc.cjs` now builds `autoSidecar` options for
  `WindieClient`; `ensureLocalRuntime: ensureDaemonBackedLocalRuntime` is gone
  from the desktop SDK startup path.
- 2026-06-09: `sidecar_daemon_manager.cjs` and its tests were deleted. The
  remaining Electron bridge uses `createWindieLocalRuntimeProvider(...)` for
  direct helper RPC/tool calls and keeps only host-specific shaping around
  windows, screenshots, display bounds, and artifacts.
- 2026-06-09: SDK CJS output was rebuilt after the TypeScript runtime change, so
  Electron's checked-in CJS import uses the new provider behavior.
- 2026-06-09: Fresh inspection found no live runtime import of the deleted
  daemon manager. Remaining search hits are historical plan/report text or
  negative assertions in the boundary test.

## Decisions

- 2026-06-09: Do not keep `ensureLocalRuntime: ensureDaemonBackedLocalRuntime` as the desktop SDK startup path. That preserves the duplicate daemon client that caused raw JSON-RPC envelopes to normalize to empty conversation lists.
- 2026-06-09: Do not make the Electron bridge eagerly start the daemon at module
  initialization. Normal desktop startup should go through `WindieClient.wakeUp`;
  bridge-owned helper calls lazily resolve the same SDK provider.
- 2026-06-09: No storage migration is required. The change moves process/client
  ownership and keeps existing sidecar persistence files and schemas intact.

## Validation Log

- `npm run build` in `packages/windie-sdk-js` - passed.
- `npm test -- --runInBand ../tests/frontend/LocalBackendBridge.lifecycle.test.cjs ../tests/frontend/LocalBackendBridge.rpc.test.cjs ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs` in `frontend` - passed; Jest emitted its existing open-handle warning after completion.
- `npm test -- --runInBand ../tests/frontend/WindieSdkClient.test.ts -t "createWindieLocalRuntimeProvider"` in `frontend` - passed.
- `npm test -- --runInBand ../tests/frontend/WindieSdkClient.test.ts -t "SidecarDaemonHttpClient|SidecarConversationStore"` in `frontend` - passed.
- `bin/windie docs list` - passed.
- `git diff --check` - passed.
- `npm run lint` in `frontend` - failed on pre-existing unused-variable errors
  in `ipc.cjs`, `ipc_query_send_runtime.cjs`,
  `messagePresentationPipeline.js`, `manualCompactionRuntime.js`, and
  `desktopConversationStore.ts`; the `ipc.cjs` unused `payload` line is blamed
  to 2026-06-05 and was not introduced by this change.
- `npm test -- --runInBand ../tests/frontend/LocalBackendBridge.lifecycle.test.cjs ../tests/frontend/LocalBackendBridge.rpc.test.cjs ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/WindieSdkClient.test.ts` in `frontend` - failed only in broad `WindieSdkClient.test.ts` cases unrelated to this slice; focused SDK provider/client/store tests passed.

## Commits

- `29e44979d fix(sdk): own desktop sidecar runtime`
