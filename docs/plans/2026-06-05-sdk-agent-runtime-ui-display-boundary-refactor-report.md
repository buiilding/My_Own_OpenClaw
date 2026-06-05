---
summary: "Execution report for the SDK agent runtime UI display boundary refactor."
read_when:
  - When reviewing implementation status for the SDK-agent-runtime UI/display boundary cleanup.
  - When continuing this refactor after context compaction or a partial implementation.
title: "SDK Agent Runtime UI Display Boundary Refactor Report"
---

# SDK Agent Runtime UI Display Boundary Refactor Report

Plan: [SDK Agent Runtime UI Display Boundary Refactor Plan](2026-06-05-sdk-agent-runtime-ui-display-boundary-refactor-plan.md)

## Status

Implementation complete pending commit.

## Deterministic Findings

- `./bin/docs-list` passed before implementation.
- `git status --short --branch` before implementation showed unrelated dirty
  files that must not be staged:
  - `examples/simple-chat-cli/run.mjs`
  - `TASK.md`
  - `You are a transformed-based Large Langua`
- Recent related commits confirm the current architecture direction:
  - `9a37ea54d docs(plans): add sdk runtime ui boundary plan`
  - `21ffaffab docs(plans): record sdk ipc refactor report`
  - `2237d8a3e refactor(frontend): retire legacy sdk ipc channels`
  - `3b82937a2 refactor(frontend): route live turn through sdk invoke`
  - `59f3d230b refactor(frontend): route renderer commands through sdk invoke`

## Classification Log

- `DesktopMemoryRuntimeClient` is target-compliant: it invokes
  `memories.list`, `memories.delete`, `memories.clearAll`, and
  `conversations.clearAll` through `invokeWindieCommand(...)`.
- Electron main already has strict `windie:invoke` handlers for memory and
  conversation list/search/delete/clear/load commands and calls public SDK agent
  APIs.
- Direct memory invoke channels in `frontend/src/shared/ipcChannels.json` and
  `frontend/src/renderer/infrastructure/ipc/channels.ts` were violations
  because they made sidecar memory RPC names renderer/preload-facing. Removed:
  `search-memory`, `list-episodic-memories`, `list-semantic-memories`,
  `delete-episodic-memory`, `delete-semantic-memory`, and
  `clear-local-memory`.
- Direct `clear-chat-history` in the shared/preload invoke registry was a
  violation for the destructive nuke chats action because UI now uses
  `conversations.clearAll`. Removed from renderer/preload registry and the
  renderer-side store adapter's supported RPC method table.
- `DesktopConversationContinuityService` metadata list/search/delete and local
  conversation read/rehydrate helpers were narrowed to SDK-shaped commands
  where possible: `conversations.list`, `conversations.search`,
  `conversations.delete`, `conversation.load`, and `conversation.rehydrate`.
- `DesktopTranscriptProjectionRuntimeClient` metadata/load/delete helpers were
  narrowed to SDK-shaped commands.
- The renderer-side `sdkSidecarConversationStore.ts` adapter was removed after
  adding public SDK agent APIs for `conversation.getRevision`,
  `conversation.appendEvent`, `conversation.rewrite`, and
  `conversation.replaceCompactedReplay`.
- `desktopConversationStore.ts` now implements renderer transcript projection
  persistence through SDK-shaped commands:
  `conversation.getRevision`, `conversation.appendEvent`,
  `conversation.rewrite`, `conversation.replaceCompactedReplay`,
  `conversation.load`, and `conversations.list/search/delete/clearAll`.
- `SidecarConversationStore` remains only in `packages/windie-sdk-js` as the
  SDK/local-runtime persistence adapter. Sidecar RPC names remain in SDK store
  internals, Electron main local-backend mapper internals, sidecar code, and
  tests for those internals.
- `conversationLocalSnapshotLoader.ts` and its test were removed. Snapshot
  loads now go through `conversation.load` and SDK display/rehydrate
  projections.
- `conversationInferenceSessionRuntime.ts` no longer passes a `recordKind`
  storage selector from renderer hydration code.
- Remaining direct `IpcBridge.invoke(...)` paths in renderer services/features
  are classified as Electron host/native commands: windows, overlay sizing,
  screenshot attachment capture, artifact upload/fetch, local-backend status,
  permissions, workspace, browser session actions, system-state capture, and
  image context menu.
- Final source inventory found no old chat/memory sidecar channel names in
  `frontend/src/renderer`, `frontend/src/shared`, or `frontend/src/preload.js`.

## Checklist

- [x] Reread this plan and the matching report before coding.
- [x] Run required orientation commands and preserve unrelated dirty worktree
      changes.
- [x] Build a current command/runtime inventory from live code.
- [x] Classify every path as SDK command, SDK projection, Electron host command,
      SDK/local-runtime internal, violation, or unclear.
- [x] Reread all violation and unclear paths until each classification is
      grounded in code and docs.
- [x] Add missing SDK public APIs before adding renderer/main behavior for SDK
      concepts.
- [x] Route renderer SDK-owned user intent through SDK-shaped
      `windie.invoke(...)` commands.
- [x] Route Electron main SDK commands through a strict allowlist to live public
      SDK APIs.
- [x] Keep renderer feature code display-only for rows, current turn,
      normalized events, and UI state.
- [x] Keep Electron-native host commands separate from SDK-owned commands.
- [x] Remove obsolete direct IPC channels, sidecar-shaped preload entries,
      renderer helpers, tests, and docs when they are no longer justified.
- [x] Rerun ownership inventory after changes and keep fixing until no
      in-scope violations remain.
- [x] Maintain this report with findings, decisions, validations, deviations,
      blockers, and commits.
- [x] Update docs and `CHANGELOG.md` where behavior/API contracts change.
- [x] Run validation commands and commit completed work.

## Success Criteria

- [x] Renderer feature code does not call sidecar/internal IPC names for
      user-facing SDK concepts: conversations, memory, send, stop, history,
      delete, clear, search, replay, rehydrate, compact, models, settings, or
      runtime tool/conversation state.
- [x] Renderer feature code renders SDK `displayRows`, `currentTurn`, and
      normalized `conversation-event` projections instead of rebuilding durable
      runtime semantics.
- [x] Electron main exposes one SDK-shaped command invoke path for SDK-owned
      concepts and routes commands through a strict allowlist.
- [x] Electron main command handlers call public SDK APIs on the live
      `WindieClient`, `WindieAgent`, or `ConversationRuntime`.
- [x] Missing user-facing SDK capabilities are added to the SDK before the UI
      uses them.
- [x] Sidecar RPC names, storage table names, and DB semantics are only present
      in sidecar code, SDK store/local-runtime adapters, Electron main
      implementation internals, or tests for those internals.
- [x] Generic preload IPC, if retained, is not available as a path for
      SDK-owned user-facing concepts.
- [x] Existing chat pill, response overlay, dashboard, settings, models,
      memory, usage, search, send, stop, replay, rehydrate, compact, nuke,
      wakeword, and host/window behavior does not regress.
- [x] The final ownership inventory finds no in-scope violations, or this
      report marks the remaining items explicitly blocked with concrete reasons.

## Validation Log

- `cd frontend && npm run test -- PreloadIpcChannels.test.cjs IpcChannels.test.ts DesktopMemoryRuntimeClient.test.ts SettingsSection.test.jsx MemorySection.test.jsx RendererDashboardRuntimeBoundary.test.ts RendererAppRuntimeBoundary.test.ts`: passed, 7 suites / 62 tests.
- `cd frontend && npm run test -- PreloadIpcChannels.test.cjs IpcChannels.test.ts DesktopMemoryRuntimeClient.test.ts SettingsSection.test.jsx MemorySection.test.jsx DesktopConversationStore.test.ts ConversationLocalSnapshotLoader.test.ts RendererDashboardRuntimeBoundary.test.ts RendererAppRuntimeBoundary.test.ts`: passed, 9 suites / 85 tests.
- `cd frontend && npm run test -- DesktopConversationContinuityService.test.ts DesktopTranscriptProjectionRuntimeClient.test.ts DesktopConversationLibraryClient.test.ts ConversationInferenceSessionRuntime.test.ts ConversationLocalSnapshotLoader.test.ts DesktopConversationStore.test.ts RendererAppRuntimeBoundary.test.ts`: passed, 7 suites / 45 tests. Jest printed an existing transcript-session warning about `window.ipc` being unavailable in a node test.
- `cd frontend && npm run test -- DesktopConversationContinuityService.test.ts ConversationInferenceSessionRuntime.test.ts ConversationLocalSnapshotLoader.test.ts DesktopConversationLibraryClient.test.ts DesktopTranscriptProjectionRuntimeClient.test.ts RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts`: passed, 7 suites / 59 tests. Jest printed the same existing transcript-session node-test warning.
- `cd packages/windie-sdk-js && npm run build`: passed.
- `cd frontend && npm run test -- DesktopConversationStore.test.ts ConversationReplayActions.test.jsx ChatInterfaceWiring.test.jsx ChatGptDashboardShell.test.jsx RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts RendererDashboardRuntimeBoundary.test.ts`: initially failed because dashboard/store tests still asserted old chat sidecar channels; updated tests to SDK-shaped commands and reran.
- `cd frontend && npm run test -- ChatGptDashboardShell.test.jsx DesktopConversationStore.test.ts`: passed, 2 suites / 38 tests. Jest printed existing React `act(...)` warnings in the dashboard suite.
- `cd frontend && npm run test -- PreloadIpcChannels.test.cjs IpcChannels.test.ts DesktopMemoryRuntimeClient.test.ts SettingsSection.test.jsx MemorySection.test.jsx DesktopConversationStore.test.ts DesktopConversationContinuityService.test.ts DesktopTranscriptProjectionRuntimeClient.test.ts DesktopConversationLibraryClient.test.ts ConversationInferenceSessionRuntime.test.ts RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts RendererDashboardRuntimeBoundary.test.ts ChatInterfaceWiring.test.jsx ConversationReplayActions.test.jsx ChatGptDashboardShell.test.jsx IpcMainSdkRuntimeBoundary.test.cjs LocalBackendBridge.rpc.test.cjs`: passed, 18 suites / 259 tests. Jest printed existing transcript-session and dashboard `act(...)` warnings plus a worker forced-exit warning; command exited 0.
- `cd frontend && npm run test -- WindieAgentConversationStoreApi.test.ts DesktopConversationStore.test.ts IpcMainSdkRuntimeBoundary.test.cjs PreloadIpcChannels.test.cjs`: passed, 4 suites / 26 tests.
- `cd frontend && npm run typecheck`: initially failed on a stale `recordKind` renderer hydration argument and a result-shape type guard; fixed both.
- `cd frontend && npm run typecheck`: passed.
- `cd frontend && npm run test -- WindieAgentConversationStoreApi.test.ts DesktopConversationStore.test.ts ConversationInferenceSessionRuntime.test.ts DesktopConversationContinuityService.test.ts ChatGptDashboardShell.test.jsx`: passed, 5 suites / 54 tests. Jest printed existing dashboard `act(...)` warnings.
- `./bin/docs-list`: passed.
- `cd frontend && npm run typecheck`: passed.
- `cd packages/windie-sdk-js && npm run build`: passed.
- `cd frontend && npm run test -- PreloadIpcChannels.test.cjs IpcChannels.test.ts DesktopMemoryRuntimeClient.test.ts SettingsSection.test.jsx MemorySection.test.jsx DesktopConversationStore.test.ts DesktopConversationContinuityService.test.ts DesktopTranscriptProjectionRuntimeClient.test.ts DesktopConversationLibraryClient.test.ts ConversationInferenceSessionRuntime.test.ts RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts RendererDashboardRuntimeBoundary.test.ts ChatInterfaceWiring.test.jsx ConversationReplayActions.test.jsx ChatGptDashboardShell.test.jsx IpcMainSdkRuntimeBoundary.test.cjs LocalBackendBridge.rpc.test.cjs WindieAgentConversationStoreApi.test.ts`: passed, 19 suites / 262 tests. Jest printed existing transcript-session, dashboard `act(...)`, ChatInterface mock, and worker forced-exit warnings; command exited 0.
- `./scripts/test-sidecar tests/sidecar/test_chat_event_store.py tests/sidecar/test_local_store_delete_cleanup.py`: failed because the wrapper executed the broader sidecar suite and hit unrelated generated manifest parity in `tests/sidecar/test_tool_manifest.py::test_generated_builtin_manifest_matches_sidecar_source`.
- `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_chat_event_store.py tests/sidecar/test_local_store_delete_cleanup.py`: passed, 16 tests / 3 warnings.
- `rg -n 'clear-chat-history|clear-local-memory|delete-chat-conversation|list-chat-conversations|search-chat-conversations|get-chat-events|store-chat-event|replace-chat-conversation|rewrite-chat-conversation-after-event|list-episodic-memories|list-semantic-memories|delete-episodic-memory|delete-semantic-memory|chat_events|chat_conversation_revisions' frontend/src/renderer frontend/src/shared frontend/src/preload.js`: no hits.
- `git diff --check`: passed.

## Commits

- This implementation commit: `refactor(frontend): route conversation history through sdk commands`.

## Decisions, Tradeoffs, Blockers, Deviations

- The initial implementation kept `sdkSidecarConversationStore.ts` as a
  possible internal adapter, but the later inspection found it was no longer
  needed after adding public SDK agent APIs. It was deleted.
- Desktop-specific transcript write enrichment now lives in
  `desktopConversationStore.ts` by enriching SDK conversation event payloads
  before calling SDK-shaped commands. The SDK `SidecarConversationStore`
  extracts those event payload fields when it performs sidecar persistence.
- Dashboard tests still contain a test-only shim that maps SDK commands to
  legacy sidecar-shaped fixture handlers. This is not production code and is
  isolated to the dashboard test harness so older fixture data can be reused.
