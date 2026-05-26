---
summary: "Real-time implementation report for the chat replay send convergence refactor."
read_when:
  - When verifying the chat replay send convergence refactor status.
  - When debugging retry/edit resend after composer send and replay send were converged onto live-turn dispatch.
title: "Chat Replay Send Convergence Report"
---

# Chat Replay Send Convergence Report

Source plan: [Chat Replay Send Convergence Plan](chat_replay_send_convergence_plan.md)

Status: implementation complete for the current checklist. Focused replay,
continuity, SDK, IPC bridge, typecheck, lint, docs, and diff validation passed.
The follow-up query-context refactor moved Electron main prompt assembly to the
backend and refreshed the IPC bridge harness, so the IPC validation command now
passes too.

## Completed Changes

- Split desktop replay preparation from final query dispatch.
  - Implemented SDK prepare-only replay methods:
    `prepareEditAndResend(...)` and `prepareRetryTurn(...)`.
  - Preserved public SDK `editAndResend(...)` and `retryTurn(...)` behavior by
    implementing them as prepare plus send.
  - Changed desktop continuity replay methods to return prepared replay turns
    instead of sending queries.

- Routed retry and edit/resend through the live-turn send primitive.
  - `useConversationReplayActions.js` now calls
    `DesktopConversationContinuityService.prepareEditAndResend(...)` or
    `prepareRetryTurn(...)`.
  - After preparation succeeds, replay actions call
    `DesktopLiveTurnRuntimeClient.sendQuery(...)`.
  - `DesktopLiveTurnRuntimeClient.sendQuery(...)` accepts optional replay
    `model` and `turnRef` inputs so prepared replay turns can preserve SDK
    query context.

- Kept transcript persistence idempotent.
  - Replay preparation still owns transcript rewrite/revision persistence.
  - Live-turn dispatch sends the prepared replay turn without adding a second
    transcript user projection.

- Preserved backend rehydrate before final send.
  - Prepare-only replay methods still run SDK rewrite plus backend rehydrate.
  - Final live-turn send runs only after replay preparation resolves.

- Replaced the generic replay disconnected catch-all for preparation failures.
  - Preparation failures now display a replay-preparation error.
  - Final send failures still display the existing backend disconnected send
    error.

- Tightened replay identity flow.
  - Replay live-turn dispatch uses the prepared replay `conversationRef` rather
    than resolving a later active-chat fallback.

- Updated tests and boundary assertions.
  - Replay hook tests now assert prepare plus live-turn send.
  - Desktop continuity tests assert prepare-only behavior and no
    `send-chat-query` dispatch.
  - SDK runtime tests assert prepare-only public helpers rewrite/rehydrate
    without sending.
  - Renderer boundary tests now assert replay preparation and shared final
    live-turn dispatch.

## Previous Behavior

- Composer sends called `DesktopLiveTurnRuntimeClient.sendQuery(...)` and
  crossed the typed `send-chat-query` IPC path.
- Retry/edit resend called desktop continuity methods that seeded transcript
  replay, rehydrated backend history, and sent the next query internally.
- Any replay exception rendered the same backend disconnected error, even when
  the failure happened before final query dispatch.

## Current Behavior

- Composer send, retry, and edit/resend now share
  `DesktopLiveTurnRuntimeClient.sendQuery(...)` as the final desktop query
  dispatch path.
- Replay continuity owns only rewrite and rehydrate preparation for Electron
  replay actions.
- SDK public retry/edit APIs still perform the convenience prepare plus send
  flow for non-Electron callers.
- Replay preparation failures and final send failures are distinguishable in
  renderer behavior and tests.

## Validation

- Passed: `cd frontend && npm run test -- ConversationReplayActions DesktopConversationContinuityService DesktopLiveTurnRuntimeClient DesktopBackendTransport RendererChatRuntimeBoundary WindieSdkConversationRuntime --runInBand`
  - Result: 6 suites passed, 98 tests passed.
- Passed: `cd frontend && npm run test -- ChatInterfaceWiring --runInBand`
  - Result: 1 suite passed, 55 tests passed.
- Passed: `cd frontend && npm run test -- ConversationContinuityService --runInBand`
  - Result: 2 suites passed, 12 tests passed.
- Passed: `cd frontend && npm run typecheck`
- Passed: `cd frontend && npm run lint`
- Passed: `./bin/docs-list`
- Passed: `git diff --check`
- Passed: `cd frontend && npm run test -- IpcMainBridge.query IpcMainBridge.lifecycle --runInBand`
  - Result: 2 suites passed, 60 tests passed.
  - Follow-up completed in the remaining-architecture refactor slice: refreshed
    the IPC bridge harness and query payload expectations so Electron main sends
    structured context while backend prompt code renders model-visible content.

## Remaining Debt

- None for the replay send convergence checklist.
