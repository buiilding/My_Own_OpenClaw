---
summary: "Plan for reorganizing top-level Electron main-process modules into domain folders without changing runtime behavior."
read_when:
  - When moving or auditing files under `frontend/src/main`.
  - When debugging require-path churn after the Electron main domain-folder cleanup.
title: "Electron Main Domain Folder Rehome Plan"
---

# Electron Main Domain Folder Rehome Plan

Date: 2026-06-08

## User Intent

Reduce the crowded top-level `frontend/src/main` directory by moving
domain-specific Electron main modules into domain folders. The goal is visual
and navigational clarity, not behavior change.

## Architectural Target

Keep Electron main ownership intact:

- `frontend/src/main/index.cjs` remains the main process composition root.
- `frontend/src/main/ipc.cjs` remains the broad SDK/renderer IPC composition
  root for now.
- Focused modules move into folders that match their runtime domain:
  - `app/` for app lifecycle, menu, runtime mode, GPU, VM worker, runtime paths.
  - `sidecar/` for local backend/sidecar bridge and daemon supervision.
  - `permissions/` for permission services, state, IPC, and sudo handling.
  - `surfaces/` for windows, overlays, surface policy, display affinity, and
    chat/response overlay lifecycle.
  - `wakeword/` for wakeword bridge/supervision.
  - `sdk/` for SDK desktop agent/tool capability modules.
  - `extensions/` for extension manifest, MCP runtime, and tool manifest
    helpers.
  - `debug/` for live-surface/chat-pill trace helpers.
- Existing `ipc/`, `python/`, `generated/`, `assets/`, and `platform/`
  subtrees stay where they are.

## In Scope

- Move top-level `.cjs` modules into domain folders.
- Update `require(...)` paths in runtime files and tests.
- Update docs that describe the frontend main source layout.
- Update `CHANGELOG.md`.
- Run focused frontend tests for Electron main IPC, sidecar bridge,
  permissions, window/surface, wakeword, and SDK-runtime imports.

## Out of Scope

- Renaming APIs, exported function names, IPC channels, or behavior.
- Splitting `ipc.cjs` further.
- Moving `frontend/src/main/python`.
- Moving generated manifests or assets.
- Converting CommonJS to ESM or TypeScript.
- Adding compatibility stubs at the old paths unless validation proves an
  external importer cannot be updated.

## Workflow

1. Inventory current top-level `frontend/src/main/*.cjs` modules and classify
   each module into a target folder.
2. Move files with `git mv` in coherent domain batches.
3. Update `require(...)` paths from moved files, top-level composition roots,
   nested `ipc/` files, and tests.
4. Update docs and changelog.
5. Run focused tests and `git diff --check`.
6. Inspect the final top-level directory and classify remaining files as
   intentionally top-level or out of scope.

## Validation Plan

```bash
bin/windie test frontend -- IpcMainBridge.query.test.cjs IpcSettingsSync.test.cjs IpcChannels.test.cjs LocalBackendBridge.test.cjs PermissionIpcRuntime.test.cjs MainWindowRuntime.test.cjs WakewordBridge.test.cjs WindieSdkClient.test.ts
bin/windie docs list
git diff --check
```

Additional tests may be added if require-path validation surfaces adjacent
failures.

## Success Criteria

- Top-level `frontend/src/main` contains only composition roots, durable
  subfolders, and intentionally broad/legacy entrypoints.
- Domain modules live under clear folders.
- No behavior-oriented code changes are mixed into the move.
- Focused frontend tests pass or unrelated failures are documented.
- Docs and changelog describe the new organization.
- No compatibility stubs are left behind without a stated reason.

## Reread Anchors After Compaction

- This plan.
- Matching report:
  `docs/plans/2026-06-08-electron-main-domain-folder-rehome-report.md`
- `docs/architecture/frontend_architecture.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/sidecar/`
- `frontend/src/main/surfaces/`
- `frontend/src/main/permissions/`
