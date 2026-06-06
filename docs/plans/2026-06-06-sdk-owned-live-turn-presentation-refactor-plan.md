---
summary: "Pre-flight refactor plan for moving send-time user-row display, typing state, and response overlay entries into SDK-owned live-turn presentation state."
read_when:
  - When changing renderer chat send flow, SDK ConversationRuntime send timing, SDK current-turn projections, typing indicators, or response overlay behavior.
  - When debugging sent user-message flicker, typing dots during visible thinking/tool progress, or response overlay disappearing during tool calls.
title: "SDK-Owned Live Turn Presentation Refactor Plan"
---

# SDK-Owned Live Turn Presentation Refactor Plan

Status: awaiting approval.

## User Intent

The user saw three symptoms that point to the same ownership problem:

1. Sending a chat message first renders a renderer-local user row, then the
   dashboard visually refreshes when SDK `displayRows` arrive.
2. Typing state can remain visible after thinking tokens are already present.
3. The response overlay can disappear during tool calls and later reappear,
   instead of staying present for the whole active agent loop.

The desired product behavior is:

```text
user sends message
SDK starts a new turn and immediately emits the visible user row
typing appears confidently while there is nothing assistant-visible yet
first visible thinking/text/tool/error content replaces typing with response overlay
response overlay stays visible through thinking, normal tokens, tool calls, and tool outputs
turn completes or errors
next user send starts a fresh turn, replaces old overlay content with typing, then repeats
```

This plan is for moving live-turn presentation ownership into the SDK runtime,
not for adding renderer workarounds that scan more local message shapes.

## Current Behavior

### Send Row

Current send path:

1. `useChatMessageSender(...)` passes renderer store actions including
   `addMessage`, `updateMessage`, `setIsSending`, and `setThinkingStatus`.
2. `prepareDesktopChatSend(...)` normalizes input, ensures conversation identity,
   reads selected readable-file attachments, builds a `turnId`, then calls
   `dependencies.addMessage(...)` with `sourceEventType: "renderer-compose"`.
3. The same preparation function sets sending state and later calls
   `dependencies.updateMessage(turnId, ...)` after screenshot capture/upload.
4. `dispatchPreparedDesktopChatTurn(...)` calls
   `DesktopLiveTurnRuntimeClient.sendQuery(...)`.
5. Main handles `conversation.send`, calls `agent.run(...)`, and the SDK runtime
   emits canonical `turn_started` / `user_message` events.
6. Main forwards SDK `snapshot.displayRows` over `windie:rows`.
7. Renderer maps `windie:rows` to `ChatMessage[]` and calls `setMessages(...)`,
   replacing the message list.

The remaining ownership violation is a renderer-owned visible transcript row
during send preparation. Durable live transcript writes and display history
already moved into the SDK.

### Typing And Overlay State

Current live-turn surface path:

1. SDK `currentTurnProjection` tracks `phase`, `assistantText`,
   `reasoningText`, `toolEvents`, and `lastError`.
2. Reasoning events append `reasoningText`, but preserve the previous phase
   unless the phase was `idle`, where they become `awaiting`.
3. Renderer maps SDK phases to response-overlay phases.
4. Renderer builds synthetic current-turn `ChatMessage` objects from
   `currentTurnProjection`, including a synthetic empty user marker.
5. Renderer derives response overlay entries from those synthetic messages.
6. Renderer considers a visible reply to be only non-empty `llm-text` or `error`.
7. Tool progress and tool explanations can become overlay entries, but they are
   not the canonical definition of "visible current-turn content".
8. Main-process response overlay window policy treats awaiting, streaming,
   tool-call, and tool-output phases as active-loop visible, so the window shell
   is mostly aligned; renderer presentation state can still decide there is
   nothing visible.

The result is a split authority:

- SDK knows the active turn and raw turn progress.
- Main knows active-loop overlay shell visibility.
- Renderer decides from synthetic messages whether typing or response should be
  visible.

That split is why a small condition can fix one symptom while preserving the
same bug class elsewhere.

## Recent Context Inspected

- `0f3bec959 fix(frontend-chat): remove synthetic query send projection`
  removed Electron's old synthetic local-user backend event path and made SDK
  send failure propagate.
- `2b425324a refactor(frontend): make sdk live transcript writer` removed
  renderer durable transcript writes for user/assistant/tool rows.
- `92e9417f1 refactor(frontend): render chat history from sdk display rows`
  made dashboard live/history transcript rendering consume SDK `displayRows`.
- `283670043 fix(frontend-chat): preserve completed current-turn tool rows`
  kept completed SDK current-turn tool rows visible in dashboard display state.
- `4efe7aed1 fix(frontend): restart overlay awaiting on consecutive sends` and
  `7258ea09d fix(frontend): show awaiting overlay on consecutive sends` patched
  visible overlay transitions locally.
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md` says the
  response overlay phase source of truth is for overlay visibility and stale
  correlation only, while current-turn display should come from SDK projection.
- `docs/desktop/minimal_chat_pill.md` says the response overlay phase must stay
  synchronized with pill awaiting/streaming state.
- `docs/sdk/conversation_runtime.md` says `snapshot.displayRows` is the
  canonical live and historical transcript state.

## Target Ownership

| Surface | Owner | Rule |
| --- | --- | --- |
| Send intent and composer UX | Renderer | Normalize input enough to call the desktop runtime; no transcript-row writes. |
| Immediate user display row | SDK runtime | Emit from normalized `user_message` before slow enrichment or backend transport. |
| Send-time enrichment | SDK/desktop runtime boundary | Memory retrieval, readable-file context, screenshots, workspace context, and model selection flow through SDK-owned send lifecycle or explicit runtime hooks. |
| User-message attachment metadata | SDK events/projection | Persist/project through SDK conversation events, not renderer `updateMessage(...)`. |
| Live turn phase | SDK runtime | Emit semantically useful phases for awaiting, thinking, streaming text, tool call, tool output, complete, and error. |
| Live turn visible content | SDK projection | Derive whether the current turn has user-visible assistant content from SDK events, including thinking, assistant text, tool calls/progress/outputs, and errors. |
| Typing state | SDK live-turn presentation | True only after current-turn user row and before the first visible assistant content. |
| Response overlay entries | SDK live-turn presentation | Ordered current-turn entries for thinking, assistant text, tool progress/calls/outputs, and errors. |
| Response overlay shell | Electron main | Show/hide/move BrowserWindow from active turn state; no content semantics. |
| Renderer chat/overlay | Renderer | Render SDK-owned rows and live-turn presentation; no local ownership of current-turn semantics. |
| Failure messages | SDK/runtime events where transcript-visible | Renderer-local error rows are allowed only for failures before a valid SDK turn exists, and those must be classified. |

## Required Architectural Change

Move from this shape:

```text
renderer prepare
  -> renderer addMessage(user)
  -> renderer capture/upload
  -> renderer updateMessage(user)
  -> SDK send
  -> SDK currentTurn/displayRows arrive
  -> renderer synthesizes current-turn messages
  -> renderer infers typing vs response overlay
```

to this shape:

```text
renderer prepare minimal send intent
  -> SDK send starts
  -> SDK emits turn_started + user_message/displayRows immediately
  -> SDK liveTurnPresentation emits typingVisible=true and overlayVisible=false
  -> SDK-owned enrichment/capture hooks complete
  -> SDK appends metadata/update event if display metadata changes
  -> SDK transport sends enriched backend query
  -> SDK normalized events update liveTurnPresentation entries/phase
  -> first visible thinking/text/tool/error entry flips typingVisible=false and overlayVisible=true
  -> renderer renders SDK displayRows + SDK liveTurnPresentation only
```

The clean foundational fix is to add or extend a SDK-owned current-turn
presentation projection. The renderer should not be the place that decides
whether reasoning, tool calls, or tool outputs count as visible content.

## In Scope

- Delete renderer-local optimistic user row creation from
  `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`.
- Delete or repurpose `buildPendingUserMessage(...)` if no remaining non-test
  user-row caller exists.
- Remove `addMessage` and `updateMessage` dependencies from the normal send
  path in `useChatMessageSender(...)`.
- Change `ConversationRuntime.send()` so `turn_started` / base `user_message`
  are emitted before slow enrichment or backend dispatch.
- Introduce a first-class SDK send-enrichment phase for data that currently
  blocks SDK send:
  - readable-file attachment context
  - query screenshot capture/upload metadata
  - attachment filenames
  - workspace path
  - memory retrieval enrichment
  - model selection sequencing
- Decide and implement one canonical SDK event strategy for post-start
  user-message metadata:
  - preferred: a typed SDK event such as `user_message_updated` or
    `user_message_metadata` semantics extended so SDK display rows merge
    turn-scoped metadata into the existing user row;
  - rejected unless proven necessary: renderer-only annotation merge for
    screenshots/attachments.
- Add or extend a SDK live-turn presentation projection that contains:
  - `conversationRef`
  - `turnRef`
  - semantic `phase`
  - ordered visible `entries`
  - `hasVisibleContent`
  - `typingVisible`
  - `overlayVisible`
  - terminal/error state
- Treat reasoning/thinking text as visible assistant content for typing
  suppression and overlay display.
- Treat tool call, tool progress, tool output, and tool error entries as visible
  current-turn content for typing suppression and overlay continuity.
- Make response overlay display entries come from SDK live-turn presentation
  instead of renderer-generated synthetic `ChatMessage[]`.
- Make dashboard/chat typing indicators consume SDK live-turn presentation
  instead of scanning renderer-local current-turn message shapes.
- Keep display row identity stable for the sent user row across base
  `user_message`, metadata updates, backend metadata events, completion, and
  reload.
- Update SDK projection tests for user-message metadata and live-turn
  presentation.
- Update renderer tests so successful send does not call `addMessage` /
  `updateMessage`, typing clears on first visible content, and overlay stays
  visible through tool phases.
- Update docs that still allow renderer pending visible messages or renderer
  ownership of live-turn presentation semantics.

## Out Of Scope

- Redesigning chat UI layout, MessageList visuals, or composer controls.
- Changing backend provider history ownership.
- Changing sidecar storage schema unless the chosen SDK metadata event requires
  a migration; the preferred path is append-only event compatibility with no
  database schema migration.
- Rewriting edit/resend/retry beyond preserving their current behavior through
  the new SDK-owned send and live-turn lifecycle.
- Removing renderer-local error display for failures that happen before a valid
  conversation/turn can be created; those must be classified, not blindly
  deleted.
- Replacing Electron main's BrowserWindow overlay positioning and native window
  policy. Main remains the desktop shell owner.

## Inspection Workflow

Before implementation, reread these anchors:

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/queryScreenshotPipeline.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`
- `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js`
- `frontend/src/renderer/features/chat/utils/state/liveTurnSurfaceState.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayViewContract.ts`
- `frontend/src/main/response_overlay_visibility_policy.cjs`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_events.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `frontend/src/main/ipc/ipc_chat_query_handlers.cjs`
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/projections/currentTurnProjection.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/conversation/types.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/WindieSdkConversationRuntime.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/RendererChatRuntimeBoundary.test.ts`
- `tests/frontend/ResponseOverlayViewContract.test.ts`
- `tests/frontend/ChatTurnPresentationState.test.js`
- `tests/frontend/MessagePresentationPipeline.test.js`
- `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`

Then run this inspection loop until no in-scope violations remain:

1. Search for renderer send-time message writes:
   `rg -n "buildPendingUserMessage|renderer-compose|dependencies\\.addMessage|dependencies\\.updateMessage|updateMessage\\(turnId|appendSendFailureMessage|sourceEventType: 'renderer-compose'|sourceEventType: \"renderer-compose\"" frontend/src/renderer tests/frontend`.
2. Classify every hit as deleted, pre-SDK-turn error-only, or out of scope with
   a reason.
3. Search for renderer current-turn presentation derivation:
   `rg -n "buildCurrentTurnMessagesFromProjection|buildCurrentTurnResponseOverlayEntries|findLatestVisibleAssistantReply|hasCurrentTurnAssistantThinking|showChatboxAwaitingReply|showAwaitingReply|thinkingStatus|setThinkingStatus|showAssistantAwaitingDot|hasCurrentTurnLiveProgressMessages" frontend/src tests/frontend`.
4. Classify every hit as deleted, pure renderer rendering, SDK projection
   consumer, or out of scope with a reason.
5. Search for SDK display row, current-turn, and live presentation sources:
   `rg -n "currentTurnProjection|reasoning_delta|llm-thought|tool_call|tool_output|displayRows|user_message_metadata|user_message_updated|liveTurnPresentation|typingVisible|overlayVisible" packages/windie-sdk-js/src tests/frontend`.
6. Reread changed SDK projection code after each slice and verify the live-turn
   visible-content rules are centralized.
7. Reread renderer overlay and chat surfaces after each slice and verify they no
   longer own live-turn semantic decisions.

## Implementation Checklist

- [ ] Create a matching execution report under `docs/plans/` before code
      changes, and keep it current through the refactor.
- [ ] Add SDK tests that prove `ConversationRuntime.send()` emits
      `turn_started` and a visible `user_message` snapshot before slow
      enrichment/transport resolves.
- [ ] Add SDK tests for user-message metadata/update projection: one user row,
      stable id, merged screenshot/attachment metadata, no second visible row.
- [ ] Add SDK tests for live-turn presentation:
      - new turn starts with `typingVisible=true` and no response entries
      - reasoning/thinking creates visible content and clears typing
      - assistant text appends visible entries
      - tool call/progress/output entries keep overlay visible
      - complete/error terminate busy state without losing final entries
      - a consecutive send resets presentation to the new turn
- [ ] Change `ConversationRuntime.send()` so base turn/user events are emitted
      before slow `enrichQuery(...)`.
- [ ] Split enrichment into named phases if needed so memory diagnostics,
      screenshot metadata, readable-file context, and backend payload enrichment
      are deterministic.
- [ ] Move or wrap readable-file context building so it feeds SDK send
      enrichment rather than blocking renderer before SDK row emission.
- [ ] Move or wrap screenshot capture/upload so it feeds SDK user-message
      metadata and backend payload enrichment rather than renderer
      `updateMessage(...)`.
- [ ] Remove successful-path `addMessage` and `updateMessage` from
      `prepareDesktopChatSend(...)`.
- [ ] Remove `addMessage` / `updateMessage` from `useChatMessageSender(...)`
      dependencies when they are not needed for valid SDK turns.
- [ ] Delete `buildPendingUserMessage(...)` and its test if no longer used.
- [ ] Replace renderer synthetic current-turn message construction with SDK
      live-turn presentation entries.
- [ ] Remove renderer ownership of visible-content classification for typing and
      response overlay state.
- [ ] Keep renderer overlay code as presentation only: layout, markdown render,
      scroll, close affordance, and window-size sync.
- [ ] Keep Electron main overlay phase/window code as shell policy only, or
      narrow it to consume SDK live-turn state if current bridge events are
      still a second source of truth.
- [ ] Preserve readable attachment failure behavior, but classify whether it is
      pre-SDK-turn local validation or should become a SDK/runtime error event.
- [ ] Preserve backend send failure behavior as SDK/runtime terminal state, not
      renderer-local transcript append.
- [ ] Update renderer boundary tests to fail if successful send writes
      transcript rows locally.
- [ ] Update renderer overlay tests to prove typing and response overlay derive
      from SDK live-turn presentation.
- [ ] Update docs in `docs/sdk/conversation_runtime.md`,
      `docs/architecture/frontend_architecture.md`,
      `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`, and
      `docs/desktop/minimal_chat_pill.md`.
- [ ] Update `CHANGELOG.md` before commit.

## Success Criteria

- On successful send, the renderer does not call `addMessage(...)` or
  `updateMessage(...)` to create or patch the user transcript row.
- The first visible user row after send comes from SDK `displayRows`.
- The user row appears before backend transport completes.
- Screenshot/attachment metadata either appears in the same SDK row via a
  metadata/update event or is intentionally excluded with a documented reason.
- A fresh SDK `displayRows` snapshot does not cause the user row to remount
  because of a renderer-local to SDK-owned identity handoff.
- Typing appears immediately after the user row for a new turn.
- Typing disappears as soon as the SDK live-turn presentation has visible
  assistant content: reasoning, assistant text, tool call/progress/output, error.
- Response overlay appears as soon as there is visible assistant content.
- Response overlay stays visible through thinking, text streaming, tool calls,
  tool progress, and tool outputs for the active turn.
- A consecutive user send starts a new SDK-owned turn presentation and replaces
  the old overlay content with the new turn's typing state.
- Historical replay uses the same SDK projection rules as live display where
  durable display rows are involved.
- Send failure and readable-file failure behavior remains visible and
  deterministic.
- No new Electron-only bridge or adapter exists only to rename payloads.
- No renderer-local synthetic current-turn message path remains in the overlay
  or typing decision flow.
- No storage migration is needed, or a no-migration note explains why the
  append-only event strategy is compatible.

## Validation Commands

Run focused tests first:

```bash
cd frontend && npm test -- --runInBand \
  ../tests/frontend/ChatMessageSender.test.tsx \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts \
  ../tests/frontend/SdkDisplayChatMessageProjection.test.ts \
  ../tests/frontend/RendererChatRuntimeBoundary.test.ts \
  ../tests/frontend/ResponseOverlayViewContract.test.ts \
  ../tests/frontend/ChatTurnPresentationState.test.js \
  ../tests/frontend/MessagePresentationPipeline.test.js \
  ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs
```

Then run broader impacted checks:

```bash
cd frontend && npm test -- --runInBand \
  ../tests/frontend/ChatInterfaceWiring.test.jsx \
  ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx \
  ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx \
  ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts \
  ../tests/frontend/DesktopBackendTransport.test.ts \
  ../tests/frontend/IpcMainBridge.query.test.cjs \
  ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs
```

Run static and docs checks:

```bash
cd frontend && npm run typecheck
cd packages/windie-sdk-js && npm run build
bin/windie docs list
git diff --check
```

If UI timing remains suspicious after tests, run the desktop dev path and
manually verify:

```bash
bin/windie start desktop
```

Manual checks:

- A sent user message appears once and does not visually reload when SDK rows
  arrive.
- Typing appears immediately after send.
- Thinking text clears typing and starts the response overlay.
- Tool calls and tool outputs do not hide the response overlay.
- A second send starts a fresh turn, clears old overlay content, shows typing,
  and then starts a new overlay when visible content arrives.

## Assumptions

- The product priority is immediate visible feedback without renderer-owned
  transcript rows or renderer-owned live-turn semantics.
- SDK event storage remains append-only; if a user-message metadata event is
  needed, projection merging is preferred over mutating existing stored events.
- Renderer-local failure rows are allowed only before a valid SDK turn exists.
- The unrelated `scratch/` worktree entry is not part of this plan.

## Approval Gate

Do not implement this plan until the user approves it. After approval, create
the matching report and begin with SDK tests for immediate user-row emission and
SDK-owned live-turn presentation.
