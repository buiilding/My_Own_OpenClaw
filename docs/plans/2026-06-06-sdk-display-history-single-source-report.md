---
summary: "Realtime execution report for the SDK display/history single-source migration."
read_when:
  - When continuing or reviewing the SDK display/history single-source migration.
  - When debugging whether renderer, Electron main, or SDK owns live and historical chat transcript rows.
title: "SDK Display History Single Source Report"
---

# SDK Display History Single Source Report

Source plan: [SDK Display History Single Source Plan](2026-06-06-sdk-display-history-single-source-plan.md)

Status: complete.

## User Intent

The approved architecture is:

```text
SDK emits/stores normalized events.
SDK builds UI rows from those events after every event.
Renderer renders those rows.
Historical replay uses the same projection builder.
Renderer does not decide how to preserve tool rows, assistant rows, or
current-turn rows.
```

## Recent Commit Context

- `283670043 fix(frontend): preserve completed current-turn tool rows`
  - Added a renderer-side preservation helper to stop screenshot/tool rows from
    disappearing after turn completion.
  - This fixed the visible bug but intentionally left a boundary patch:
    renderer terminal handlers still materialize rows from
    `currentTurnProjection`.
- Earlier SDK display-row work already added SDK `displayRows`, SDK store
  projection loaders, and dashboard historical loading through SDK display
  rows.
- The remaining migration is to make live dashboard rendering consume SDK
  display snapshots directly and delete the renderer current-turn transcript
  preservation path.

## Live Row-Source Inventory

Initial search findings:

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
  - Builds `currentTurnMessages` from `currentTurnProjection`.
  - Passes those messages into `buildThreadPresentationMessages(...)`.
- `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js`
  - Accepts `currentTurnMessages` and merges them into transcript rendering.
- `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`
  - Exports `buildCurrentTurnMessagesFromProjection(...)`, which creates
    transcript-shaped rows from `currentTurnProjection`.
- `frontend/src/renderer/features/chat/utils/chatStream/currentTurnMessageMaterialization.ts`
  - Materializes assistant/error/tool rows from `currentTurnProjection` during
    terminal handlers.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
  - Calls `upsertMaterializedCurrentTurnProjectionMessages(...)`.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
  - Calls `upsertMaterializedCurrentTurnProjectionMessages(...)`.
- `frontend/src/main/ipc.cjs`
  - Already forwards `snapshot.displayRows` through `windie:rows`.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
  - Already exposes `snapshot.displayRows = buildDisplayRows(events)`.

## Decisions

- Keep `currentTurnProjection` for phase/status/overlay behavior.
- Remove `currentTurnProjection` as a dashboard transcript row source.
- Treat `windie:rows` / SDK snapshot display rows as the live dashboard
  transcript feed.
- Delete the renderer terminal materialization helper after moving live display
  rows to SDK snapshot updates.
- Upgrade SDK `displayRows` from historical-only to live-and-historical:
  assistant/reasoning deltas now update a stable streaming assistant row, and
  the final assistant message completes that same row identity.
- Preserve renderer-only row annotations by id when a fresh SDK display snapshot
  arrives. This keeps feedback, token counts, and transparency metadata attached
  without letting renderer create, order, or preserve transcript rows.

## Checklist

- [x] User approved this plan before implementation.
- [x] Matching execution report created and kept current.
- [x] Recent commits inspected and summarized in the report.
- [x] Live row-source inventory recorded in the report.
- [x] SDK emits/provides display snapshots after every display-affecting
      normalized event.
- [x] Real-time store append/projection ordering is explicit and tested.
- [x] Renderer dashboard renders SDK `displayRows` as its live transcript.
- [x] Historical conversation loading uses the same SDK display projection.
- [x] `currentTurnProjection` is status/control/overlay-only in renderer.
- [x] Terminal completion/error handlers no longer materialize transcript rows
      from `currentTurnProjection`.
- [x] `buildThreadPresentationMessages(...)` no longer accepts or merges
      `currentTurnMessages`.
- [x] `buildCurrentTurnMessagesFromProjection(...)` is deleted or restricted to
      non-transcript overlay code with a documented reason.
- [x] `upsertMaterializedCurrentTurnProjectionMessages(...)` is deleted.
- [x] `examples/custom-ui` demonstrates rendering SDK display snapshots.
- [x] Docs updated to describe the new one-source row invariant.
- [x] Tests prove repeated screenshot/tool rows survive live, completion, and
      reload without renderer preservation logic.
- [x] Design-inspection loop completed and recorded in the report.
- [x] Validation commands recorded in the report.

## Validation Log

- Passed:

  ```bash
  cd frontend && npm test -- --runInBand \
    ../tests/frontend/WindieSdkConversationRuntime.test.ts \
    ../tests/frontend/SdkDisplayChatMessageProjection.test.ts \
    ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx \
    ../tests/frontend/MessagePresentationPipeline.test.js
  ```

  Result: 4 suites passed, 110 tests passed.

- Passed:

  ```bash
  cd frontend && npm test -- --runInBand \
    ../tests/frontend/WindieSdkConversationRuntime.test.ts \
    ../tests/frontend/SdkDisplayChatMessageProjection.test.ts \
    ../tests/frontend/ConversationContinuityService.test.ts \
    ../tests/frontend/DesktopConversationContinuityService.test.ts \
    ../tests/frontend/DesktopConversationLibraryClient.test.ts \
    ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx \
    ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx \
    ../tests/frontend/ChatInterfaceWiring.test.jsx \
    ../tests/frontend/ChatBoxResponse.state.test.jsx \
    ../tests/frontend/MessagePresentationPipeline.test.js \
    ../tests/frontend/RendererChatRuntimeBoundary.test.ts
  ```

  Result: 11 suites passed, 283 tests passed.

- Passed:

  ```bash
  cd frontend && npm run typecheck
  ```

- Passed:

  ```bash
  cd packages/windie-sdk-js && npm run build
  ```

- Passed:

  ```bash
  node examples/custom-ui/run.mjs --smoke
  ```

- Passed:

  ```bash
  bin/windie docs list
  git diff --check
  ```

- Search proof:

  ```bash
  rg -n "upsertMaterializedCurrentTurnProjectionMessages|currentTurnMessageMaterialization|buildMaterializedCurrentTurnMessage|currentTurnMessages|buildThreadPresentationMessages\(|buildCurrentTurnMessagesFromProjection" frontend/src tests/frontend
  rg -n "currentTurnProjection" frontend/src/renderer/features/chat frontend/src/renderer/features/minimalChatPill tests/frontend
  ```

  Findings were classified as:

  - No remaining `upsertMaterializedCurrentTurnProjectionMessages`,
    `currentTurnMessageMaterialization`, or `buildMaterializedCurrentTurnMessage`.
  - `buildThreadPresentationMessages(...)` remains as a pass-through
    presentation helper; regression tests assert it ignores `currentTurnMessages`.
  - `buildCurrentTurnMessagesFromProjection(...)` remains only for minimal
    response overlay tests and overlay code, not dashboard transcript rendering.
  - Remaining `currentTurnProjection` production hits are status/control,
    overlay, store projection, or chat surface controller paths.

## Inspection Log

- Pass 1 started from the approved plan and current live source inventory.
- Implemented SDK live display row projection for assistant/reasoning deltas.
- Added renderer `windie:rows` listener that maps SDK rows to visual messages.
- Removed dashboard `currentTurnMessages` merge from `ChatInterface` and
  `buildThreadPresentationMessages(...)`.
- Removed terminal completion/error transcript materialization and deleted
  `currentTurnMessageMaterialization.ts`.
- Reclassified `buildCurrentTurnMessagesFromProjection(...)` as overlay-only;
  production transcript paths no longer import it.
- Pass 2 reread changed SDK projection, renderer inlet, ChatInterface, terminal
  handlers, presentation pipeline, custom UI, and docs. No in-scope dashboard
  transcript row-source violations remain.
- Storage migration: none required. Existing normalized event storage is still
  the durable source; the change modifies SDK projection from those events, not
  the stored event schema.

## Commits

- `92e9417f1 refactor(frontend): render chat history from sdk display rows`
