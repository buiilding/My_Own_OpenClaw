---
summary: "Execution report for deleting Electron's legacy standalone local_backend.py sidecar fallback and updating SDK-owned sidecar lifecycle docs."
read_when:
  - When reviewing the SDK sidecar legacy fallback cleanup.
  - When debugging why Electron main cannot fall back to standalone local_backend.py.
title: "SDK Sidecar Legacy Fallback Cleanup Report"
---

# SDK Sidecar Legacy Fallback Cleanup Report

Plan: [SDK Sidecar Legacy Fallback Cleanup Plan](2026-06-10-sdk-sidecar-legacy-fallback-cleanup-plan.md)

## Status

Complete.

## Checklist

- [x] Delete Electron standalone sidecar launch/readiness/transport modules.
- [x] Keep Electron helper calls routed through SDK local runtime provider.
- [x] Convert bridge tests away from stdin/stdout process mocks.
- [x] Add test guard against standalone sidecar spawn.
- [x] Update active sidecar lifecycle docs.
- [x] Complete full validation and commit.

## Findings

- The normal desktop bridge already preferred SDK local runtime provider access,
  but retained a fallback that spawned `local_backend.py` directly when the SDK
  provider was absent.
- The fallback preserved duplicate local memory ownership risk and contradicted
  the SDK-owned daemon boundary.
- `local_backend.py` remains required as the daemon's internal `LocalBackend`
  implementation and was not removed.

## Decisions

- Delete the standalone Electron fallback rather than keeping it as test/dev
  compatibility.
- Keep `local_backend_supervisor.cjs` because renderer status still needs a
  stable ready/error snapshot.
- Keep host-only screenshot/display/artifact behavior in Electron main.

## Validation Log

- `cd frontend && npm run test -- ../tests/frontend/LocalBackendBridge.lifecycle.test.cjs ../tests/frontend/LocalBackendBridge.rpc.test.cjs --runInBand` - passed, 36 tests.
- `cd frontend && npm run test -- ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs --runInBand` - passed, 7 tests.
- `cd frontend && npm run test -- ../tests/frontend/LocalBackendBridge.lifecycle.test.cjs ../tests/frontend/LocalBackendBridge.rpc.test.cjs ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs --runInBand` - passed, 43 tests.
- `bin/windie docs list` - passed.
- `git diff --check` - passed.
- Deleted-module/stale-owner search over active source/tests/docs - passed; no active references to the deleted Electron fallback modules remained.

## Commits

- Pending.
