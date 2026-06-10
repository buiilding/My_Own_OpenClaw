---
summary: "Plan to remove Electron's legacy standalone local_backend.py fallback after SDK-owned sidecar daemon startup became the desktop source of truth."
read_when:
  - When reviewing why Electron main no longer owns a standalone local_backend.py sidecar process.
  - When continuing cleanup around SDK-owned sidecar daemon startup, helper RPC routing, or local-backend docs.
title: "SDK Sidecar Legacy Fallback Cleanup Plan"
---

# SDK Sidecar Legacy Fallback Cleanup Plan

## User Intent

Remove the remaining legacy Electron-owned sidecar fallback after recent work
moved desktop sidecar startup/reuse into the SDK. Update docs so ownership is
clear and agents do not reintroduce Electron-side sidecar lifecycle code.

## Architecture Target

- SDK owns sidecar daemon startup/reuse, discovery validation, RPC unwrapping,
  and local runtime exposure.
- Electron main owns desktop launch facts and host-only helper behavior:
  windows, screenshot display bounds, artifact uploads, status broadcasts, and
  narrow IPC handler registration.
- Python sidecar owns local authority and storage through one daemon-owned
  `LocalBackend` instance.
- Electron main must not spawn standalone `local_backend.py` beside
  `sidecar_daemon.py`.

## Out Of Scope

- Removing `frontend/src/main/python/local_backend.py`; the daemon still uses
  `LocalBackend` internally.
- Changing tool schemas, sidecar method names, memory schemas, or daemon HTTP
  routes.
- Reworking wakeword service process ownership.

## Workflow

1. Inspect bridge code, recent commits, and tests for standalone sidecar process
   fallback paths.
2. Delete Electron-owned stdin/stdout launch, readiness, process event, stdout,
   stderr, request transport, and stop-controller modules.
3. Keep bridge helper behavior routed through the SDK local runtime provider.
4. Rewrite bridge lifecycle tests to assert SDK-provider readiness, shutdown,
   unavailable-provider failure, and no standalone spawn.
5. Update docs/changelog and run focused validation.
6. Re-run searches for deleted module names and stale fallback wording.

## Success Criteria

- No production Electron bridge path spawns standalone `local_backend.py`.
- Bridge helper RPCs use SDK runtime `rpc(...)` or `executeTool(...)`.
- Tests fail if the bridge tries to spawn a standalone sidecar process.
- Active docs describe SDK-owned sidecar daemon lifecycle.
- Focused bridge tests and docs checks pass.

## Validation Commands

- `cd frontend && npm run test -- ../tests/frontend/LocalBackendBridge.lifecycle.test.cjs ../tests/frontend/LocalBackendBridge.rpc.test.cjs --runInBand`
- `cd frontend && npm run test -- ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs --runInBand`
- `bin/windie docs list`
- `git diff --check`
