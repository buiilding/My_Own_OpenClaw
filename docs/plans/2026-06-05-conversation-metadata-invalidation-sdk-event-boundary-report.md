---
summary: "Realtime implementation report for the conversation metadata invalidation SDK event boundary plan."
read_when:
  - When continuing or reviewing conversation title invalidation, dashboard recent-chat refresh, sidecar-event deletion, or renderer event ownership cleanup.
title: "Conversation Metadata Invalidation SDK Event Boundary Report"
---

# Conversation Metadata Invalidation SDK Event Boundary Report

Plan: [Conversation Metadata Invalidation SDK Event Boundary Plan](2026-06-05-conversation-metadata-invalidation-sdk-event-boundary-plan.md)

## Status

Complete.

## User Intent

Remove the renderer-facing generic `sidecar-event` path for conversation
metadata invalidation. Renderer should receive a public Windie/SDK-shaped event
and reload recent-chat metadata through SDK-shaped commands. Electron main may
see raw sidecar events as an implementation detail; renderer must not.

## Inspection Log

- Read the approved plan and current `git status`.
- Re-searched current sidecar metadata invalidation path.
- Current in-scope leak:
  `sidecarDaemonManager.subscribeEvents -> broadcastSidecarEvent('sidecar-event')
  -> DesktopLocalRuntimeEventSource -> ConversationContinuityService
  -> Dashboard recent-chat reload`.
- `MemorySection` already uses `windie:memory-store-changed`; this is a
  separate public invalidation path and is out of scope.
- `frontend/src/main/python/local_backend_memory_handlers.py` still emits
  `conversation-title-updated`; this remains an internal sidecar event and is
  out of scope unless sidecar emission must change.
- `SidecarDaemonManager` tests assert local daemon event emission; that is
  internal sidecar/main behavior and not the renderer leak.
- Exported the SDK
  `conversationMetadataInvalidationFromLocalRuntimeEvent(...)` helper so main
  can use the SDK-owned normalizer instead of parsing sidecar payloads itself.
- Changed Electron main local daemon event fan-out to broadcast
  `windie:conversation-metadata-invalidated` only when the SDK normalizer
  classifies a sidecar payload as a conversation metadata invalidation.
- Removed renderer `DesktopLocalRuntimeEventSource` and the renderer/shared
  `SIDECAR_EVENT` channel constant.
- Updated `DesktopConversationContinuityService.subscribeMetadataInvalidations`
  to subscribe to `windie:conversation-metadata-invalidated`.
- Updated dashboard, preload, main broadcaster, and SDK continuity tests.
- Updated docs and `CHANGELOG.md`.
- Final design inspection found no `sidecar-event`, `SIDECAR_EVENT`, or
  `DesktopLocalRuntimeEventSource` references in `frontend/src/renderer`,
  `frontend/src/shared`, or renderer-facing tests.
- Remaining `conversation-title-updated` references are classified as:
  sidecar internal emission, SDK normalizer/tests, Electron-main mapping tests,
  and sidecar daemon client tests that prove local runtime events still flow
  below the renderer boundary.

## Checklist

- [x] Matching report created under `docs/plans/`.
- [x] Current `sidecar-event` producer/consumer path inspected end to end.
- [x] All `sidecar-event` usages classified.
- [x] SDK exposes or owns a pure conversation metadata invalidation normalizer.
- [x] Electron main broadcasts
      `windie:conversation-metadata-invalidated` for sidecar title updates.
- [x] Renderer dashboard listens to
      `windie:conversation-metadata-invalidated`.
- [x] Renderer dashboard reloads through `conversations.list`.
- [x] Renderer no longer subscribes to `sidecar-event` for conversation
      metadata invalidation.
- [x] `DesktopLocalRuntimeEventSource` deleted if unused.
- [x] Shared/preload channel registry no longer exposes `SIDECAR_EVENT` if no
      renderer consumer remains.
- [x] Tests added/updated for main event mapping.
- [x] Tests added/updated for renderer dashboard reload on public invalidation.
- [x] Tests added/updated for SDK invalidation normalization.
- [x] Docs updated.
- [x] `CHANGELOG.md` updated.
- [x] Validation commands and results recorded in report.
- [x] Fresh final inspection finds no remaining in-scope violations.
- [x] Commit created and recorded in report.

## Success Criteria Status

- [x] Renderer feature/app code has no dependency on generic `sidecar-event`
      for conversation metadata invalidation.
- [x] Renderer/shared code does not need to know `conversation-title-updated`
      as a sidecar event payload name.
- [x] Electron main is the only Electron layer that sees the raw sidecar daemon
      title event.
- [x] The renderer receives a public event named
      `windie:conversation-metadata-invalidated`.
- [x] Dashboard recent chats still refresh after title generation.
- [x] Recent-chat data continues to come from `conversations.list`, not from
      event payload mutation.
- [x] Tests fail if the renderer reintroduces `sidecar-event` for this path.
- [x] Tests fail if main stops mapping sidecar title updates to the public
      Windie invalidation event.

## Decisions And Tradeoffs

- Keep sidecar `conversation-title-updated` emission internal.
- Replace renderer local-runtime event subscription with a public Windie event
  subscription instead of adding fallback parsing.
- Keep event payload as invalidation metadata only; dashboard reload remains
  SDK-command based.

## Validation Log

- `cd packages/windie-sdk-js && npm run build`: passed.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/PreloadIpcChannels.test.cjs ../tests/frontend/ChatGptDashboardShell.test.jsx ../tests/frontend/UseDashboardConversations.test.jsx ../tests/frontend/ConversationContinuityService.test.ts ../tests/frontend/WindieSdkClient.test.ts --watch=false`:
  failed only in the broader `WindieSdkClient.test.ts` stream-order
  expectations for `memory_diagnostic` versus `assistant_message`; the
  sidecar/event-boundary suites in the same command passed.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs ../tests/frontend/PreloadIpcChannels.test.cjs ../tests/frontend/ChatGptDashboardShell.test.jsx ../tests/frontend/UseDashboardConversations.test.jsx ../tests/frontend/ConversationContinuityService.test.ts --watch=false`:
  passed, 5 suites / 57 tests. `ChatGptDashboardShell` printed existing React
  `act(...)` warnings.
- `cd frontend && npm run typecheck`: passed.
- `./bin/docs-list`: passed.
- `git diff --check`: passed.
- Sidecar tests: skipped because sidecar title-event emission and sidecar
  storage behavior did not change.

## Final Design Inspection

- `rg` found no `sidecar-event`, `SIDECAR_EVENT`, or
  `DesktopLocalRuntimeEventSource` references in renderer/shared source.
- Renderer metadata invalidation now enters at
  `ON_CHANNELS.WINDIE_CONVERSATION_METADATA_INVALIDATED`.
- Dashboard recent-chat reload still calls `DesktopConversationLibraryClient`,
  which uses SDK-shaped `conversations.list`.
- Electron main is the only Electron layer that classifies raw sidecar
  `conversation-title-updated` payloads.
- SDK owns the normalizer used by main and by
  `ConversationContinuityService.subscribeMetadataInvalidations(...)`.
- No remaining in-scope renderer-facing generic sidecar event path was found.

## Commits

- `02912bcc2` - `refactor(frontend): hide sidecar title events behind windie invalidation`
