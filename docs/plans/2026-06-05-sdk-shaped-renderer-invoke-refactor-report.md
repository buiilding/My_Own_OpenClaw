---
summary: "Execution report for the SDK-shaped renderer invoke refactor."
read_when:
  - When reviewing implementation status for the SDK-shaped renderer invoke refactor.
  - When continuing memory/conversation command ownership cleanup after a partial implementation.
title: "SDK-Shaped Renderer Invoke Refactor Report"
---

# SDK-Shaped Renderer Invoke Refactor Report

Plan: [SDK-Shaped Renderer Invoke Refactor Plan](2026-06-05-sdk-shaped-renderer-invoke-refactor-plan.md)

## Status

Complete. SDK, sidecar storage, renderer command, and Electron-main command
routing slices are implemented and validated.

## Deterministic Findings

- `./bin/docs-list` passed before implementation.
- Recent related commits show the active direction is SDK ownership and
  Electron-main direct `WindieClient.wakeUp(...)` usage:
  - `d90e28c31 docs(frontend): align minimal pill sdk ownership docs`
  - `0f3bec959 fix(frontend-chat): remove synthetic query send projection`
  - `47a180ffd refactor(frontend-chat): move minimal pill to sdk-owned surface`
  - `629d435c0 docs(agents): use plan and report files`
- Renderer memory actions are still renderer-facing old-path commands through
  `DesktopMemoryRuntimeClient`, which invokes sidecar-shaped channels:
  `list-episodic-memories`, `list-semantic-memories`,
  `delete-episodic-memory`, `delete-semantic-memory`,
  `clear-local-memory`, and `clear-chat-history`.
- Renderer dashboard memory UI reaches those commands through the app runtime
  facade. That facade is the right edit point for the first renderer slice.
- Renderer conversation browsing/search/delete uses
  `DesktopConversationLibraryClient`; it now routes user-facing
  list/search/delete/load actions through SDK-shaped invokes.
  `DesktopConversationContinuityService`, `SidecarConversationStore`, and
  local transcript store reads remain for replay/edit/rehydrate and SDK-store
  internals.
- `frontend/src/renderer/infrastructure/transcript/sdkSidecarConversationStore.ts`
  maps SDK store RPC methods to sidecar-shaped IPC. This remains intentionally
  internal because it implements the SDK store adapter boundary.
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs` still registers
  sidecar-shaped memory and conversation channels. They remain internal during
  this plan for SDK local-runtime/store adapters, not renderer feature API.
- SDK public APIs already exist for memory list/delete and conversation
  list/search/load/delete. SDK clear-all APIs do not exist yet.
- Sidecar `clear_chat_history` deletes `chat_events` and `conversation_titles`,
  but leaves `chat_conversation_revisions`; `list_chat_conversations` includes
  revision-only conversations through a `UNION`, so nuke chats can leave ghost
  conversations.
- Destructive settings actions currently use `DEFAULT_USER_ID` when session
  identity is missing; this must be removed for nuke actions.
- Final inspection found remaining sidecar-shaped channel names only in:
  shared channel registration/validation, Electron sidecar RPC mappers,
  SDK-sidecar conversation store adapters, local transcript replay/edit
  internals, and existing backend transport channels (`windie:send`,
  `windie:stop`, settings/model/rehydrate). No dashboard memory or dashboard
  conversation user action calls those raw sidecar command names directly.

## Reread Notes

- `docs/architecture/frontend_architecture.md`: renderer feature code should
  render SDK projections and use runtime facades; Electron main is a thin SDK
  customer; sidecar-backed stores are allowed behind SDK interfaces.
- `docs/sdk/conversation_runtime.md`: SDK owns conversation events,
  projections, store interfaces, and `SidecarConversationStore`; renderer
  should not interpret SDK-owned semantics.
- `docs/sdk/windie_client_runtime.md`: `WindieClient`/`WindieAgent` are the
  canonical runtime, with Electron main acting as a desktop host.
- `docs/architecture/storage_persistence_change_workflow.md`: sidecar SQLite
  owns local transcript/memory persistence, but storage changes must be routed
  through the runtime that owns the user-facing semantics.

## Checklist

- [x] Current renderer/main/SDK/sidecar command paths inspected and classified.
- [x] Post-findings reread completed for all relevant owner files and docs.
- [x] No renderer-facing SDK-owned command path remains unclassified before
      implementation.
- [x] Missing SDK clear APIs added before renderer routing changes.
- [x] Conversation clear semantics implemented through SDK store abstractions.
- [x] Memory clear semantics remain memory-only and chat-preserving.
- [x] Sidecar chat clear deletes events, revisions, and titles.
- [x] Renderer command calls use SDK-shaped command names for memory nuke/list/delete.
- [x] Electron main handles SDK-shaped commands through a strict allowlist.
- [x] Old renderer-facing sidecar-shaped memory command path is deleted or
      proven internal-only.
- [x] Dashboard conversation list/search/delete/load uses SDK-shaped commands.
- [x] Destructive `default_user` fallback removed from nuke actions.
- [x] Nuke UI wording matches actual persistence semantics.
- [x] Final inspection search proves remaining old sidecar-shaped command paths
      are either deleted, target-compliant, SDK internals, or documented
      out-of-scope Electron-native behavior.
- [x] Focused tests added/updated.
- [x] Docs and `CHANGELOG.md` updated.
- [x] Completed implementation committed without unrelated dirty files.

## Success Criteria

- [x] Renderer feature code no longer invokes sidecar-shaped memory
      clear/list/delete channels for user-facing memory actions.
- [x] Electron main is the renderer-command transport owner and calls public
      SDK APIs for allowlisted SDK-shaped commands.
- [x] SDK owns public command names and clear semantics.
- [x] Sidecar storage remains an implementation detail behind SDK local-runtime
      or store abstractions.
- [x] `Nuke chats` removes chat event rows, chat revision metadata, and
      conversation titles, and does not remove memory rows.
- [x] `Nuke memory` removes saved interaction memories, semantic memories,
      vector metadata/index artifacts, and semanticization watermark state, and
      does not remove chat transcripts.
- [x] Missing user identity blocks destructive nuke actions with a clear error
      instead of falling back to `default_user`.
- [x] Existing send/stop, dashboard conversation list/search/load/delete,
      memory listing, and minimal chat pill display behavior do not regress.
- [x] Tests prove the ownership boundary and destructive storage semantics.

## Validation Log

- `./bin/docs-list`: passed before implementation.
- `npm run build` in `packages/windie-sdk-js`: passed.
- `cd frontend && npm run test -- DesktopMemoryRuntimeClient.test.ts DesktopConversationLibraryClient.test.ts PreloadIpcChannels.test.cjs IpcMainSdkRuntimeBoundary.test.cjs RendererAppRuntimeBoundary.test.ts RendererDashboardRuntimeBoundary.test.ts SettingsSection.test.jsx MemorySection.test.jsx WindieSdkClient.test.ts`: failed first because `RendererAppRuntimeBoundary.test.ts` had a pre-existing app-runtime exception that was only applied in one scan.
- Same frontend focused test command after the boundary-test exception fix:
  passed, 9 suites / 122 tests.
- `./scripts/python-in-env sidecar pytest tests/sidecar/test_chat_event_store.py tests/sidecar/test_local_backend.py tests/sidecar/test_local_store_delete_cleanup.py`: passed, 78 tests.
- `./bin/docs-list`: passed after docs updates.
- `git diff --check`: passed.
- Final inspection search for renderer-facing old IPC/sidecar command names:
  completed; remaining old names are classified as internal/registry/backend
  transport/replay-edit paths, not dashboard memory or conversation user actions.

## Commits

- `refactor(frontend): route renderer commands through sdk invoke`

## Decisions And Deviations

- Added `ConversationStore.clearConversations?()` as an optional SDK store
  capability so existing stores without clear-all support would fail loudly
  through `WindieAgent.clearConversations(...)` instead of silently doing
  nothing.
- Kept sidecar-shaped chat/memory RPC names in the sidecar bridge for now
  because `SidecarConversationStore` and SDK local-runtime memory commands use
  them internally.
- Added `windie:invoke` as one renderer command transport instead of adding
  separate renderer-facing IPC channels for each SDK command.
- Kept `DesktopConversationContinuityService` and local transcript store use for
  edit/retry/rehydrate internals. Dashboard conversation user actions now use
  `conversations.*` and `conversation.load` commands through Electron main.
- Added a narrow existing exception for
  `desktopChatStreamIngressRuntime.ts` in the app-runtime boundary test; that
  file already imports a chat session helper and is not part of this refactor.
