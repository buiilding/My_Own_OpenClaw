---
summary: "Realtime execution report for implementing the SDK-owned live-turn presentation refactor."
read_when:
  - When continuing or reviewing the SDK-owned live-turn presentation refactor.
  - When debugging send-time user-row flicker, typing indicators during visible thinking/tool progress, or response overlay continuity during active turns.
title: "SDK-Owned Live Turn Presentation Refactor Report"
---

# SDK-Owned Live Turn Presentation Refactor Report

Plan: [SDK-Owned Live Turn Presentation Refactor Plan](2026-06-06-sdk-owned-live-turn-presentation-refactor-plan.md)

Status: implementation complete; pending commit.

## Intent

Implement the approved refactor so SDK conversation runtime owns:

- immediate send-time user row display
- live-turn typing visibility
- live-turn response overlay visibility
- ordered response overlay entries for thinking, assistant text, tool progress,
  tool calls, tool outputs, and errors

Renderer surfaces should render SDK-owned display rows and SDK-owned live-turn
presentation state instead of creating local optimistic transcript rows or
classifying current-turn visibility from synthetic message shapes.

## Checklist

- [x] Create execution report before runtime code changes.
- [x] Add SDK tests for immediate `turn_started` / `user_message` display before
      slow enrichment/transport.
- [x] Add SDK tests for stable user-row metadata/update projection.
- [x] Add SDK tests for live-turn presentation state and entries.
- [x] Change `ConversationRuntime.send()` ordering so base turn/user events are
      emitted before slow enrichment/transport.
- [x] Move successful send-time user-row ownership out of renderer
      `prepareDesktopChatSend(...)`.
- [x] Replace renderer synthetic current-turn response-overlay entry derivation
      with SDK live-turn presentation entries.
- [x] Remove renderer ownership of typing-vs-response visible-content semantics.
- [x] Keep Electron main response overlay code as shell/window policy only.
- [x] Update docs for SDK live-turn presentation ownership.
- [x] Update `CHANGELOG.md`.
- [x] Run focused validation.
- [x] Run final design inspection and classify remaining hits.
- [ ] Commit completed work.

## Current Findings

- The active plan is
  `docs/plans/2026-06-06-sdk-owned-live-turn-presentation-refactor-plan.md`.
- SDK `currentTurnProjection` now exposes `presentation` with ordered entries,
  `typingVisible`, `overlayVisible`, `hasVisibleContent`, `isBusy`, and
  `isTerminal`. Runtime snapshots also expose `liveTurnPresentation` as the
  same SDK-owned view.
- `ConversationRuntime.send()` now emits `turn_started` and a base
  `user_message` before SDK enrichment or backend transport, emits
  `user_message_metadata` for enriched display metadata, and emits terminal
  `turn_error` on send failure after the visible row exists.
- Successful renderer sends no longer append or mutate a renderer-local user
  row. Screenshot/readable-file metadata is carried through the SDK command
  payload and projected from SDK display rows.
- Minimal response overlay production rendering now consumes SDK presentation
  entries directly. The older synthetic current-turn message helper is no
  longer used by that production path.
- Electron main response-overlay code remained a BrowserWindow shell/phase
  policy owner; no content semantics were moved into main.

## Decisions

- Implement SDK live-turn presentation as a projection layered on normalized SDK
  current-turn data, not as a renderer-only helper.
- Treat thinking/reasoning, assistant text, tool call/progress/output, and errors
  as visible assistant content for typing suppression and response overlay
  visibility.
- Keep Electron main as BrowserWindow shell owner. It may continue to use phase
  events for window visibility while renderer content semantics move to SDK
  presentation.
- Keep renderer-local error rows only for failures before a valid SDK turn
  exists, such as readable-file attachment rejection during send preparation.
- Keep renderer-side query screenshot/readable-file preparation as a classified
  remaining host-enrichment boundary. It no longer creates a duplicate visible
  row, but moving capture/readable-file work behind SDK turn start requires a
  separate host enrichment command/hook design.

## Validation Log

- `bin/windie docs list` passed before runtime edits.
- `cd packages/windie-sdk-js && npm run build` passed.
- `cd frontend && npm test -- --runInBand ../tests/frontend/WindieSdkConversationRuntime.test.ts`
  passed: 93 tests.
- `cd frontend && npm test -- --runInBand ../tests/frontend/ChatMessageSenderUtils.test.ts ../tests/frontend/ChatMessageSender.test.tsx`
  passed: 29 tests.
- `cd frontend && npm test -- --runInBand ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx`
  passed: 46 tests.
- `cd frontend && npm test -- --runInBand ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/ChatMessageSenderUtils.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/SdkDisplayChatMessageProjection.test.ts ../tests/frontend/RendererChatRuntimeBoundary.test.ts ../tests/frontend/ResponseOverlayViewContract.test.ts ../tests/frontend/CurrentTurnPresentationStateHook.test.jsx ../tests/frontend/MessagePresentationPipeline.test.js ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx`
  passed: 234 tests.
- `cd frontend && npm run typecheck` passed.
- `cd frontend && npx eslint src/renderer/features/chat/hooks/useChatMessageSender.ts src/renderer/features/chat/hooks/useChatSurfaceController.js src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils.ts src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js --ext js,jsx,ts,tsx --report-unused-disable-directives --max-warnings 0`
  passed.
- `bin/windie docs list` passed after docs updates.
- `git diff --check` passed.
- `cd frontend && npm run lint` failed on unrelated existing unused-variable
  issues outside this refactor:
  `frontend/src/main/ipc.cjs:1367`,
  `frontend/src/main/ipc/ipc_query_send_runtime.cjs:5`,
  `frontend/src/main/ipc/ipc_query_send_runtime.cjs:6`,
  `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js:132`,
  and `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts:338`.

## Inspection Log

- Initial inspection read the approved plan, overlay phase workflow, minimal chat
  pill guide, SDK conversation runtime contract, frontend architecture contract,
  and recent related commits.
- Implementation inspection after validation searched for
  `buildPendingUserMessage`, `renderer-compose`, `setIsSending(true)`,
  `buildCurrentTurnMessagesFromProjection`, `typingVisible`, `overlayVisible`,
  `liveTurnPresentation`, and `user_message_metadata`.
- Remaining `renderer-compose` rows are pre-SDK-turn failure rows, not the
  successful send path.
- Remaining `buildCurrentTurnMessagesFromProjection` references are tests and a
  legacy pure helper; production minimal response overlay no longer consumes it.

## Remaining Risks

- Renderer-side screenshot/readable-file preparation still happens before the
  SDK command is invoked. This can delay SDK row emission for capture-heavy
  sends, but it no longer creates a competing renderer-owned visible row.
  Moving that preparation behind SDK turn start should be a separate host
  enrichment refactor because it changes the renderer/main/SDK command contract.
- `thinkingStatus` remains as a renderer cache for SDK-projected reasoning text,
  compaction status, and compatibility consumers. It no longer owns
  typing-vs-response visibility for SDK presentation paths.
- Legacy pure tests still cover synthetic current-turn message helpers. Those
  helpers are now outside the production minimal overlay path and can be removed
  in a narrower cleanup after dependent tests are retired or rewritten.
