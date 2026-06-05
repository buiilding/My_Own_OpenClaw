---
summary: "Execution report for the continuous SDK-shaped UI runtime ownership refactor."
read_when:
  - When reviewing implementation status for continuous SDK-shaped renderer/main ownership cleanup.
  - When continuing the refactor after a partial implementation.
title: "Continuous SDK-Shaped UI Runtime Ownership Refactor Report"
---

# Continuous SDK-Shaped UI Runtime Ownership Refactor Report

Plan: [Continuous SDK-Shaped UI Runtime Ownership Refactor Plan](2026-06-05-continuous-sdk-shaped-ui-runtime-ownership-refactor-plan.md)

## Status

Complete. First implementation slice is complete, validated, and ready to
commit.

## Deterministic Findings

- `./bin/docs-list` passed before implementation.
- Recent commits confirm the active direction is direct Electron-main
  `WindieClient.wakeUp(...)` usage plus SDK-shaped renderer commands:
  - `59f3d230b refactor(frontend): route renderer commands through sdk invoke`
  - `d90e28c31 docs(frontend): align minimal pill sdk ownership docs`
  - `0f3bec959 fix(frontend-chat): remove synthetic query send projection`
- Unrelated dirty files existed before this plan and must not be staged:
  - `examples/simple-chat-cli/run.mjs`
  - `TASK.md`
  - `You are a transformed-based Large Langua`
- `DesktopLiveTurnRuntimeClient` still sends user-facing send/stop through
  `WINDIE_SEND` and `WINDIE_STOP`. Classification:
  `renderer-facing SDK-owned violation`.
- `desktopBackendTransport` still sends SDK runtime operations through typed
  `windie:*` IPC channels. Classification:
  `renderer-facing SDK-owned violation` for send/stop/rehydrate/compact/
  settings/model/wakeword runtime commands, unless routed through SDK-shaped
  commands.
- `preload.js` still exposes generic `window.ipc.invoke(...)`. Classification:
  `known transitional host bridge`; this slice will not remove it, but boundary
  tests should prevent renderer SDK-owned concepts from using it.
- `localConversationStore` and `sdkSidecarConversationStore` still know
  sidecar-shaped chat storage channels. Classification:
  `SDK/local-runtime/store internal` for this slice because they support
  replay/edit/store adapters and are not user-facing dashboard commands after
  the previous refactor.
- Renderer native host commands remain direct IPC. Classification:
  `Electron-native host command`.
- Post-implementation search confirms `desktopLiveTurnRuntimeClient` and
  `desktopBackendTransport` no longer reference `WINDIE_SEND`, `WINDIE_STOP`,
  `WINDIE_REHYDRATE`, `WINDIE_COMPACT_HISTORY`,
  `WINDIE_WAKEWORD_DETECTED`, `WINDIE_UPDATE_SETTINGS`, or
  `WINDIE_LIST_MODELS`.

## Reread Notes

- `AGENTS.md`: moderate/major changes require a plan and matching report;
  renderer owns display/user intent, SDK owns reusable runtime behavior,
  Electron main owns host IPC/native policy.
- `docs/architecture/frontend_architecture.md`: renderer should render SDK
  projections and not rebuild chat/runtime semantics.
- `docs/sdk/windie_client_runtime.md`: Electron should be a host around
  `WindieClient.wakeUp(...)` and public SDK runtime APIs.
- `docs/sdk/conversation_runtime.md`: SDK owns conversation events, snapshots,
  replay/rehydrate, display rows, and current-turn projection.
- `docs/architecture/storage_persistence_change_workflow.md`: local transcript
  and memory persistence must route through the owning runtime and document
  storage semantics.

## Checklist

- [x] Ran docs-list and inspected current dirty state.
- [x] Inspected recent commits for touched subsystems.
- [x] Built first command/path inventory from live code.
- [x] Classified first-slice findings.
- [x] Routed renderer live-turn send/stop through SDK-shaped commands.
- [x] Routed renderer backend transport runtime commands through SDK-shaped
      commands.
- [x] Added missing Electron-main allowlist commands needed by backend
      transport.
- [x] Updated focused frontend/main boundary tests.
- [x] Reran ownership search and classified remaining paths.
- [x] Updated docs and changelog.
- [x] Ran validation commands.
- [x] Committed completed work without unrelated dirty files.

## Success Criteria

- [x] User-facing send and stop no longer call `WINDIE_SEND` / `WINDIE_STOP`
      directly from renderer code.
- [x] Renderer-side SDK backend transport no longer calls direct `windie:*`
      IPC for SDK runtime commands.
- [x] Electron main handles those commands through the existing
      `windie:invoke` strict allowlist and calls live SDK runtime methods.
- [x] Existing chat pill/dashboard send, stop, rehydrate, compact, settings,
      models, and wakeword behavior does not regress.
- [x] Remaining direct IPC paths are classified as Electron-native host
      commands or SDK/store internals.

## Validation Log

- `cd frontend && npm run test -- DesktopLiveTurnRuntimeClient.test.ts DesktopBackendTransport.test.ts IpcMainSdkRuntimeBoundary.test.cjs RendererAppRuntimeBoundary.test.ts DesktopConversationLibraryClient.test.ts DesktopMemoryRuntimeClient.test.ts PreloadIpcChannels.test.cjs RendererDashboardRuntimeBoundary.test.ts WindieSdkClient.test.ts`: passed, 9 suites / 91 tests.
- `./bin/docs-list`: passed after docs updates.
- `git diff --check`: passed.

## Commits

- `refactor(frontend): route live turn through sdk invoke`

## Decisions, Tradeoffs, Blockers, Deviations

- This slice will not remove generic `window.ipc.invoke(...)`; removing it is a
  wider preload/native-host bridge migration. The slice will instead migrate
  SDK-owned runtime commands away from direct IPC and leave host/native commands
  untouched.
- Local transcript store and sidecar conversation store adapters remain
  internal for replay/edit/rehydrate storage behavior during this slice.
- SDK package build was not required in this slice because no SDK source or
  generated SDK output changed.
