---
summary: "Implementation report for reorganizing top-level Electron main-process modules into domain folders."
read_when:
  - When auditing the Electron main domain-folder cleanup or continuing require-path fixes.
title: "Electron Main Domain Folder Rehome Report"
---

# Electron Main Domain Folder Rehome Report

Date: 2026-06-08

Plan: `docs/plans/2026-06-08-electron-main-domain-folder-rehome-plan.md`

## Status

Complete.

## Checklist

- [x] Move modules into domain folders.
- [x] Update runtime `require(...)` paths.
- [x] Update test imports.
- [x] Update docs and changelog.
- [x] Run focused validation.
- [x] Inspect final top-level directory.

## Validation Log

- `bin/windie docs list` passed.
- `git diff --check` passed.
- Static resolver check over `frontend/src/main` and `tests/frontend` passed:
  relative `.cjs`, `.js`, and `.json` `require(...)` calls resolve after the
  move. The two ignored misses are string-based legacy absence checks for
  `windie_agent_host.cjs`.
- `bin/windie test frontend -- IpcMainBridge.query.test.cjs IpcSettingsSync.test.cjs IpcChannels.test.cjs LocalBackendBridge.test.cjs PermissionIpcRuntime.test.cjs MainWindowRuntime.test.cjs MainWindowOverlayRuntime.test.cjs MainWindowIconRuntime.test.cjs RuntimePaths.test.cjs WakewordBridge.test.cjs IpcMainSdkRuntimeBoundary.test.cjs ModularRefactorCompletionBoundary.test.ts`
  passed: 11 suites, 126 tests.
- `bin/windie test frontend` was attempted and failed in unrelated broader SDK
  and renderer suites after the rehome-sensitive suites passed:
  `WindieSdkClient.test.ts`, `ChatStreamThinkingStatus.state.test.tsx`, and
  `WindieSdkMockBackendE2E.test.ts`. `IpcPersistenceConcurrency.test.cjs`
  failed only during the full-suite run and passed when rerun in isolation.

## Design Inspection

- Current top-level `frontend/src/main` files after the move:
  - `index.cjs`
  - `ipc.cjs`
- Existing subtrees preserved in place:
  - `assets/`
  - `generated/`
  - `ipc/`
  - `platform/`
  - `python/`
- New domain folders:
  - `app/`
  - `debug/`
  - `extensions/`
  - `permissions/`
  - `sdk/`
  - `sidecar/`
  - `surfaces/`
  - `wakeword/`
- Mechanical resolver check confirmed relative `.cjs` imports in
  `frontend/src/main` and `tests/frontend` resolve after the move. The two
  `windie_agent_host.cjs` references are intentional absence/legacy-boundary
  checks, not real module imports.
- Moved files that used `__dirname` needed explicit path correction after the
  new folder depth:
  - `app/runtime_paths.cjs` points dev sidecar launch at `main/python`.
  - `surfaces/main_window_overlay_runtime.cjs` points packaged renderer HTML at
    `frontend/dist` and preload at `frontend/src/preload.js`.
  - `surfaces/main_window_runtime.cjs` points preload at
    `frontend/src/preload.js`.
  - `surfaces/main_window_icon_runtime.cjs` points the first icon candidate at
    `main/assets`.

## Commit Log

- Pending.
