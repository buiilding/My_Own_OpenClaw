---
summary: "Refactor plan for converging composer send, retry, and edit/resend onto one desktop live-turn query dispatch path."
read_when:
  - When changing chat composer send, retry, edit/resend, replay rewrites, backend rehydrate, or desktop query dispatch.
  - When a bug suggests existing-chat replay actions and new-message sends disagree about connection readiness, query IPC, local echo, settings sync, workspace context, or send-failure behavior.
title: "Chat Replay Send Convergence Plan"
---

# Chat Replay Send Convergence Plan

This is a medium-width boundary refactor, not an app rewrite. The goal is to
keep replay-specific transcript work intact while deleting the parallel final
query dispatch path that makes normal sends and edit/resend behave differently.

Current symptom: a first message can reach Electron main through typed
`send-chat-query`, but an existing-chat edit/resend can fail before main logs a
query and still show the generic "backend disconnected" replay error. That is
an ownership bug: continuity work and final transport dispatch are coupled in
the replay path.

## Current Facts

- Composer send in `useChatMessageSender.ts` resolves conversation/workspace
  state, persists the user projection, applies deferred model selection, then
  calls `DesktopLiveTurnRuntimeClient.sendQuery(...)`.
- `DesktopLiveTurnRuntimeClient.sendQuery(...)` creates an SDK conversation
  runtime with `createDesktopBackendTransport(...)`; the transport invokes the
  typed `send-chat-query` IPC handler.
- Electron main's typed query handler owns backend connection readiness,
  initial settings sync, query payload enrichment, SDK runtime dispatch, and
  synthetic query-send failure events.
- Replay actions in `useConversationReplayActions.js` build projected replay
  rows, set local pending UI state, then call
  `DesktopConversationContinuityService.editAndResend(...)` or `retryTurn(...)`.
- The desktop continuity service creates a seeded SDK runtime and calls
  `runtime.editAndResend(...)` / `runtime.retryTurn(...)`; the SDK runtime then
  rewrites, rehydrates, and calls `runtime.send(...)` internally.
- The replay hook catches every thrown error and appends the same local
  "WindieOS isn't connected right now" message, even when the failure could be
  rewrite, message-id lookup, seeded-store persistence, rehydrate, model sync,
  or final query dispatch.
- Existing tests currently encode the split: replay tests expect continuity
  service calls, desktop continuity tests expect `send-chat-query` from inside
  continuity, and runtime boundary tests assert edit/resend lives under
  `DesktopConversationContinuityService`.

## Target Ownership

- Renderer UI owns: selecting retry/edit, edited text, temporary replay display,
  and user-visible pending/error state.
- Desktop continuity runtime owns: transcript projection rewrite, SDK revision
  metadata, backend rehydrate preparation, and replay-safe message filtering.
- Desktop live-turn runtime owns: the final "send this user turn" operation for
  composer send, retry, and edit/resend.
- Electron main owns: typed query IPC, backend connection readiness, settings
  sync gate, host-only query enrichment, local user echo, and query-send failure
  synthesis.
- SDK runtime owns: reusable conversation event/revision semantics, normalized
  display and rehydrate projections, and public SDK chat-session retry/edit
  APIs for non-Electron clients.
- Backend owns: active inference history, prompt construction, provider/tool
  loop, and final model-facing history after query and tool results arrive.

## Refactor Checklist

- [x] Split replay preparation from replay dispatch.

  Issue: `DesktopConversationContinuityService.editAndResend(...)` and
  `retryTurn(...)` currently perform three jobs: seed/rewrite local transcript
  projection, rehydrate backend history, and send the next query. That hides
  final query transport failures behind the replay API.

  Owner: Desktop continuity owns rewrite and rehydrate preparation only.
  Desktop live-turn owns the final query send.

  Implement: Introduce explicit continuity methods such as
  `prepareEditAndResend(...)` and `prepareRetryTurn(...)` that return a prepared
  replay result: `conversationRef`, final `text`, replay payload, workspace
  binding, optional model selection, revision/rehydrate metadata, and enough
  IDs for UI correlation. These methods may call SDK store/rewrite/rehydrate
  helpers, but they must not call `runtime.send(...)`.

  Delete: Remove final `runtime.send(...)` ownership from the desktop
  continuity service for Electron replay actions. Keep SDK-level
  `ConversationRuntime.editAndResend(...)` and `retryTurn(...)` for external SDK
  callers unless a replacement public API is designed in the same SDK layer.

  Exclusions: Do not change backend active history, sidecar tool execution, or
  provider payload formatting as part of this split.

  Success criteria: A desktop edit/resend preparation can succeed without
  sending a query, and a failed final send is observable as a live-turn send
  failure rather than a continuity failure.

- [x] Route retry and edit/resend through the same live-turn send primitive as
  composer sends.

  Issue: Normal sends call `DesktopLiveTurnRuntimeClient.sendQuery(...)`, while
  replay sends reach the same IPC only indirectly through a seeded continuity
  runtime. That makes send logging, connection readiness, settings sync, local
  echo, and query failure synthesis harder to keep aligned.

  Owner: `DesktopLiveTurnRuntimeClient` owns final desktop query dispatch for
  all renderer-originated user turns.

  Implement: After replay preparation completes, call
  `DesktopLiveTurnRuntimeClient.sendQuery(...)` with the prepared text,
  conversation ref, screenshot/artifact refs, capture metadata, attachment
  context, model selection, and workspace path. Add a small input extension if
  replay sends need a caller-supplied turn id, replay reason, or "do not write
  duplicate transcript projection" flag.

  Delete: Remove Electron replay paths that depend on
  `DesktopConversationContinuityService` being the final transport owner.

  Exclusions: Do not move replay rewrite semantics into the live-turn runtime.
  Live-turn should send a prepared user turn, not decide where history is cut.

  Success criteria: Composer send, retry, and edit/resend all cross the same
  typed `send-chat-query` IPC path, and Electron main logs/handles them through
  the same query lifecycle.

- [x] Make transcript persistence idempotent across prepared replay and live
  send.

  Issue: Composer send records a user transcript projection before final send.
  Replay preparation rewrites the transcript projection before final send. If
  replay then uses the composer send primitive unchanged, it can duplicate the
  edited/retried user row or overwrite the intended revision boundary.

  Owner: Desktop transcript projection runtime owns persisted replay rows.
  Live-turn runtime may request a user-row write only when the caller did not
  already prepare one.

  Implement: Add an explicit send option or prepared-turn shape that says
  whether the transcript user projection has already been written. Composer
  sends use `recordUserProjection: true`; replay sends use
  `recordUserProjection: false` after continuity preparation writes the revised
  projection.

  Delete: Remove implicit assumptions that every call to live-turn send should
  write a fresh transcript row.

  Exclusions: Do not migrate existing transcript rows unless a focused replay
  test proves stored data shape is wrong.

  Success criteria: After edit/resend, dashboard replay shows one edited user
  row at the correct cut point, not both the stale and edited message as active
  replay context.

- [x] Preserve backend rehydrate before the final send without making rehydrate
  a transport fallback.

  Issue: Existing-chat actions need backend inference state rebuilt from local
  transcript before sampling. That preparation is valid, but it should not own
  the final query send.

  Owner: Desktop continuity and SDK conversation runtime own rehydrate
  projection and command dispatch. Backend owns the resulting active history.

  Implement: Keep `rehydrateFromStore(...)`, `rehydrateMessages(...)`, or a new
  replay-preparation rehydrate helper before live-turn send. Ensure the final
  live-turn send runs only after rehydrate command dispatch has completed or
  failed with a replay-specific error.

  Delete: Remove code paths where rehydrate and final query send are bundled
  into one method whose caller cannot distinguish which step failed.

  Exclusions: Do not make renderer shape provider history directly. Rehydrate
  payloads must still come from SDK/store projections.

  Success criteria: Tests can force rewrite failure, rehydrate failure, and
  final send failure separately and assert different error handling.

- [x] Replace the generic replay "backend disconnected" catch-all with
  step-specific errors.

  Issue: `useConversationReplayActions.js` maps every replay exception to the
  same disconnected-backend message. That hides real rewrite, lookup, store,
  rehydrate, model-selection, and transport failures.

  Owner: Renderer replay UI owns user-visible replay errors. Electron main owns
  query-send failure events for actual final dispatch failure.

  Implement: Classify replay failures into at least: invalid/missing source
  message, rewrite/persistence failure, rehydrate failure, and final send
  failure. Let actual final send failures surface through the live-turn send
  path and reuse the existing main query-send failure event when possible.

  Delete: Remove the unconditional replay catch-all disconnected error.

  Exclusions: Do not expose raw exception stacks in user-facing chat rows.
  Developer logs can keep the detailed error object.

  Success criteria: If continuity preparation fails before transport, no
  "Received query from renderer" log is expected and the UI names replay
  preparation. If final send fails, main's typed query failure path handles it.

- [x] Tighten conversation/session identity handling around replay sends.

  Issue: Replay actions resolve conversation identity through transcript
  session state plus chat-store active ref, while composer sends use the send
  session helpers and inference-session hydration state. The two paths can
  diverge when opening old chats, deleting chats, or switching during a pending
  replay.

  Owner: Desktop transcript session runtime owns active conversation identity.
  Conversation inference-session runtime owns hydrated/local-only state.

  Implement: Reuse the same conversation selection and workspace-binding helper
  shape for composer and replay sends. Replay preparation should return the
  conversation ref it actually rewrote and rehydrated; live-turn send must use
  that exact ref, not a later active-chat fallback.

  Delete: Remove any replay send fallback that silently creates a fresh
  conversation when the selected stored chat cannot be resolved, unless the UI
  action is explicitly "new chat".

  Exclusions: Do not change dashboard list/search/delete storage semantics in
  this refactor except where needed for replay identity tests.

  Success criteria: Switching chats during a pending retry/edit cannot send the
  prepared query into the newly selected chat.

- [x] Update SDK public semantics without weakening desktop ownership.

  Issue: SDK `ConversationRuntime.editAndResend(...)` and `retryTurn(...)`
  currently rewrite, rehydrate, and send as one public operation. That is useful
  for SDK users, but Electron needs separated preparation and final send
  ownership.

  Owner: SDK owns reusable public chat-session semantics. Desktop facades own
  Electron-specific decomposition across continuity and live-turn runtimes.

  Implement: Add lower-level SDK helpers if needed, such as
  `rewriteForEditAndResend(...)`, `rewriteForRetry(...)`, or an option that
  prepares without sending. Keep high-level SDK APIs as convenience methods
  implemented in terms of lower-level rewrite/rehydrate/send primitives.

  Delete: Remove desktop-only seeded-runtime workarounds that call the high-level
  SDK convenience method only to get at lower-level rewrite behavior.

  Exclusions: Do not break `WindieChatSession.editAndResend(...)` or external
  SDK usage without a documented replacement and package-level tests.

  Success criteria: SDK tests still prove public retry/edit sends work, while
  desktop tests can call preparation separately from live-turn dispatch.

- [x] Rewrite boundary tests to enforce the new ownership.

  Issue: Current tests correctly captured the previous migration boundary, but
  some now assert the wrong future shape: replay hooks call continuity methods
  that also send, and runtime boundary tests forbid live-turn retry/edit methods
  rather than asserting a shared final send primitive.

  Owner: Tests and docs own the durable contract.

  Implement: Update `ConversationReplayActions.test.jsx`,
  `DesktopConversationContinuityService.test.ts`,
  `DesktopLiveTurnRuntimeClient.test.ts`, `DesktopBackendTransport.test.ts`,
  `RendererChatRuntimeBoundary.test.ts`, and SDK conversation runtime tests so
  they prove:
  - replay preparation rewrites and rehydrates without sending;
  - replay actions call `DesktopLiveTurnRuntimeClient.sendQuery(...)` after
    preparation;
  - final send reaches typed `send-chat-query`;
  - actual main dispatch failure is not swallowed as replay success;
  - preparation failures do not claim backend disconnected.

  Delete: Remove tests that require desktop continuity to be the final send
  owner.

  Exclusions: Do not broaden this into unrelated stream projection, tool
  execution, or model-list tests unless the touched path directly depends on
  them.

  Success criteria: A regression that reintroduces a replay-only transport path
  fails tests before it reaches `bin/windie start desktop`.

## Do Not Implement

- Do not move rewrite/retry cut-point semantics into Electron main.
- Do not let renderer build backend provider history directly.
- Do not add another facade that simply forwards replay calls while keeping the
  old continuity-owned send path alive.
- Do not preserve the generic replay disconnected error for non-transport
  failures.
- Do not change backend agent loop, sidecar tool execution, provider selection,
  or model-facing tool policy for this refactor.
- Do not delete SDK public retry/edit APIs unless an equivalent public SDK
  migration is implemented and documented.

## Validation Commands

- `cd frontend && npm run test -- ConversationReplayActions DesktopConversationContinuityService DesktopLiveTurnRuntimeClient DesktopBackendTransport RendererChatRuntimeBoundary --runInBand`
- `cd frontend && npm run test -- IpcMainBridge.query IpcMainBridge.lifecycle --runInBand`
- `cd frontend && npm run test -- WindieSdkConversationRuntime ConversationContinuityService --runInBand`
- `cd frontend && npm run lint`
- `cd frontend && npm run typecheck`
- `bin/windie docs list`
- `git diff --check -- docs/refactors/chat_replay_send_convergence_plan.md frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts frontend/src/renderer/app/runtime/desktopBackendTransport.ts packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`

