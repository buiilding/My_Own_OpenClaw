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

Second implementation slice complete and ready to commit. The latest ownership
inventory found no live renderer feature/app path calling legacy direct
`windie:*` runtime channels or direct chat-history sidecar IPC names for
user-facing SDK concepts.

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
- `localConversationStore` and `sdkSidecarConversationStore` still knew
  sidecar-shaped chat storage channels. Classification before this slice:
  `localConversationStore` was a renderer-facing SDK-owned violation when used
  by snapshot loading; `sdkSidecarConversationStore` was the narrow
  SDK/local-runtime/store internal adapter.
- Renderer native host commands remain direct IPC. Classification:
  `Electron-native host command`.
- Post-implementation search confirms `desktopLiveTurnRuntimeClient` and
  `desktopBackendTransport` no longer reference `WINDIE_SEND`, `WINDIE_STOP`,
  `WINDIE_REHYDRATE`, `WINDIE_COMPACT_HISTORY`,
  `WINDIE_WAKEWORD_DETECTED`, `WINDIE_UPDATE_SETTINGS`, or
  `WINDIE_LIST_MODELS`.

## 2026-06-05 Second Slice Findings

- Fresh orientation reran `./bin/docs-list`, reread `AGENTS.md`, this plan,
  this report, `docs/architecture/frontend_architecture.md`,
  `docs/architecture/runtime_boundary_matrix.md`,
  `docs/sdk/windie_client_runtime.md`,
  `docs/sdk/conversation_runtime.md`, and
  `docs/architecture/storage_persistence_change_workflow.md`.
- Recent related commits still show the current direction as SDK-shaped
  renderer commands and direct Electron-main `WindieClient.wakeUp(...)` use:
  `3b82937a2`, `59f3d230b`, `d90e28c31`, and `0f3bec959`.
- `localConversationStore.ts` is the only renderer source file still directly
  invoking `LIST_CHAT_CONVERSATIONS`, `SEARCH_CHAT_CONVERSATIONS`, and
  `GET_CHAT_EVENTS`. Classification: `renderer-facing SDK-owned violation`
  when used by `conversationLocalSnapshotLoader`, because the SDK
  `SidecarConversationStore` already exposes `loadEvents`, `loadForDisplay`,
  and `loadForRehydrate` behind the SDK store interface.
- `sdkSidecarConversationStore.ts` still maps SDK store RPC methods to
  sidecar-shaped IPC channels. Classification:
  `documented SDK/local-runtime/store internal`; it remains the narrow adapter
  where sidecar names are allowed.
- `DesktopSettingsRuntimeClient.test.ts` still expects
  `WINDIE_LIST_MODELS` and `WINDIE_UPDATE_SETTINGS` direct invokes even though
  the implementation now goes through `desktopBackendTransport` and
  `invokeWindieCommand(...)`. Classification: stale test contract.
- `DesktopConversationContinuityService.test.ts` still expects
  `windie:rehydrate` and `windie:compact-history` direct invokes even though
  `desktopBackendTransport` now emits `conversation.rehydrate` and
  `conversation.compact`. Classification: stale test contract.
- `frontend/src/renderer/folder_structure.md` still documents
  `IpcBridge.invoke(INVOKE_CHANNELS.WINDIE_SEND, payload)`. Classification:
  stale docs.
- Generic `window.ipc.invoke(...)` remains exposed for Electron-native host
  commands. Classification: `known transitional host bridge`; this slice will
  tighten boundary tests but not remove the host bridge.

## 2026-06-05 Second Slice Result

- Deleted `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`.
- Changed `conversationLocalSnapshotLoader` to read through
  `createDesktopConversationStore(...)`, which is backed by the SDK
  `SidecarConversationStore` adapter instead of a redundant renderer helper.
- Kept `sdkSidecarConversationStore.ts` as the only renderer source file that
  maps SDK store RPC methods to sidecar-shaped chat storage IPC channels.
  Classification: `documented SDK/local-runtime/store internal`.
- Added public SDK agent methods `WindieAgent.prepareEditAndResend(...)` and
  `WindieAgent.prepareRetryTurn(...)`.
- Added Electron main `windie:invoke` allowlist commands
  `conversation.prepareEditAndResend` and `conversation.prepareRetryTurn`,
  both calling the new public SDK agent methods.
- Changed renderer replay preparation to call the SDK-shaped command bridge
  instead of constructing a seeded SDK conversation runtime in renderer.
- Removed legacy renderer-facing main handlers and registry entries for
  `windie:send`, `windie:stop`, `windie:update-settings`,
  `windie:list-models`, `windie:rehydrate`, `windie:compact-history`, and
  `windie:wakeword-detected`.
- Deleted the now-unused main-process `rehydrateBackendConversation` and
  `compactBackendHistory` helper names after the SDK-shaped command handlers
  became the only active entry points.
- Updated stale renderer/main tests and active docs to use `windie:invoke`
  command names.
- Final inventory confirms remaining direct IPC paths are either
  Electron-native host commands, SDK/store internals, or negative boundary-test
  strings.

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
- [x] Second slice: remove redundant renderer local conversation store direct
      sidecar RPC usage from snapshot loading.
- [x] Second slice: update stale tests/docs that still assert direct
      `windie:*` SDK-owned invokes.
- [x] Second slice: add public SDK APIs and Electron main allowlist commands
      for replay preparation instead of keeping renderer-local SDK runtime
      construction.
- [x] Second slice: remove legacy renderer-facing direct `windie:*` runtime
      handlers and registry entries after renderer no longer uses them.
- [x] Second slice: rerun ownership inventory after changes and keep fixing
      in-scope findings until none remain.

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
- [x] Renderer replay preparation uses SDK-shaped command names and Electron
      main calls public SDK agent APIs.
- [x] Legacy renderer-facing direct `windie:*` runtime channels are no longer
      registered in main or exposed in the shared preload channel registry.

## Validation Log

- `cd frontend && npm run test -- DesktopLiveTurnRuntimeClient.test.ts DesktopBackendTransport.test.ts IpcMainSdkRuntimeBoundary.test.cjs RendererAppRuntimeBoundary.test.ts DesktopConversationLibraryClient.test.ts DesktopMemoryRuntimeClient.test.ts PreloadIpcChannels.test.cjs RendererDashboardRuntimeBoundary.test.ts WindieSdkClient.test.ts`: passed, 9 suites / 91 tests.
- `cd packages/windie-sdk-js && npm run build`: passed.
- `cd frontend && npm run test -- ConversationLocalSnapshotLoader.test.ts DesktopConversationContinuityService.test.ts DesktopSettingsRuntimeClient.test.ts DesktopVoiceRuntimeClient.test.ts DesktopBackendTransport.test.ts DesktopLiveTurnRuntimeClient.test.ts DesktopConversationLibraryClient.test.ts DesktopMemoryRuntimeClient.test.ts IpcChannels.test.ts PreloadIpcChannels.test.cjs IpcMainSdkRuntimeBoundary.test.cjs IpcMainBridge.lifecycle.test.cjs IpcMainBridge.query.test.cjs RendererAppRuntimeBoundary.test.ts RendererDashboardRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts WindieSdkClient.test.ts`: passed, 17 suites / 204 tests. Jest reported existing console warnings and one worker forced-exit warning, but the command exited 0.
- `cd frontend && npm run test -- IpcMainSdkRuntimeBoundary.test.cjs IpcMainBridge.lifecycle.test.cjs IpcMainBridge.query.test.cjs`: passed after deleting unused main-process legacy relay helpers, 3 suites / 61 tests. Jest again reported one worker forced-exit warning, but the command exited 0.
- `./bin/docs-list`: passed after docs updates.
- `git diff --check`: passed.

## Commits

- `refactor(frontend): route live turn through sdk invoke`
- `refactor(frontend): retire legacy sdk ipc channels` (pending commit for
  this second slice)

## Decisions, Tradeoffs, Blockers, Deviations

- This slice did not remove generic `window.ipc.invoke(...)`; removing it is a
  wider preload/native-host bridge migration. The slice will instead migrate
  SDK-owned runtime commands away from direct IPC and leave host/native commands
  untouched.
- Sidecar-shaped chat storage channels remain in `sdkSidecarConversationStore`
  because that file is the SDK store/local-runtime adapter. They are not
  renderer-facing user command APIs.
- Sidecar tests were not run because storage semantics and sidecar RPC
  implementations did not change; the renderer-side adapter path is covered by
  focused frontend store/snapshot tests.
