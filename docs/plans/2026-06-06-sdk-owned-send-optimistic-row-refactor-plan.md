---
summary: "Pre-flight refactor plan for moving immediate send-time user-row display from renderer-local optimistic state into the SDK conversation runtime."
read_when:
  - When changing the renderer chat send path, SDK ConversationRuntime send timing, SDK display rows, or send-time user-message flicker behavior.
  - When debugging a sent user message that appears immediately and then visually reloads when SDK display rows arrive.
title: "SDK-Owned Send Optimistic Row Refactor Plan"
---

# SDK-Owned Send Optimistic Row Refactor Plan

Status: awaiting approval.

## User Intent

The user saw that sending a chat message first renders a local user message,
then the dashboard visually refreshes when SDK `displayRows` arrive. They want
the first-class architecture:

```text
renderer expresses send intent
SDK immediately emits the local user_message display row
renderer renders SDK rows only
SDK/desktop runtime completes enrichment and backend dispatch
```

This plan is for removing the renderer-owned optimistic transcript row, not for
papering over the flicker with row-id compatibility.

## Current Behavior

Current send path:

1. `useChatMessageSender(...)` gets renderer store actions including
   `addMessage`, `updateMessage`, `setIsSending`, and `setThinkingStatus`.
2. `prepareDesktopChatSend(...)` normalizes input, ensures conversation identity,
   reads selected readable-file attachments, builds a `turnId`, then calls
   `dependencies.addMessage(...)` with `sourceEventType: "renderer-compose"`.
3. The same preparation function sets sending state and later calls
   `dependencies.updateMessage(turnId, ...)` after screenshot capture/upload.
4. `dispatchPreparedDesktopChatTurn(...)` finally calls
   `DesktopLiveTurnRuntimeClient.sendQuery(...)`.
5. Main handles `conversation.send`, calls `agent.run(...)`, and the SDK runtime
   emits canonical `turn_started` / `user_message` events.
6. Main forwards SDK `snapshot.displayRows` over `windie:rows`.
7. Renderer maps `windie:rows` to `ChatMessage[]` and calls `setMessages(...)`,
   replacing the message list.

The ownership violation is not durable persistence anymore. The June 5/6
cleanup already moved durable live transcript writes and display history into
the SDK. The remaining violation is a renderer-owned visible transcript row
during send preparation.

## Recent Context Inspected

- `0f3bec959 fix(frontend-chat): remove synthetic query send projection`
  removed Electron's old synthetic local-user backend event path and made SDK
  send failure propagate.
- `2b425324a refactor(frontend): make sdk live transcript writer` removed
  renderer durable transcript writes for user/assistant/tool rows.
- `92e9417f1 refactor(frontend): render chat history from sdk display rows`
  made dashboard live/history transcript rendering consume SDK `displayRows`.
- `docs/sdk/conversation_runtime.md` says `snapshot.displayRows` is the
  canonical live and historical transcript state.
- `docs/architecture/frontend_architecture.md` still contains a stale statement
  that renderer hooks may keep pending visible messages; this refactor should
  update that wording.

## Target Ownership

| Surface | Owner | Rule |
| --- | --- | --- |
| Send intent and composer UX | Renderer | Normalize input enough to call the desktop runtime; no transcript-row writes. |
| Immediate user display row | SDK runtime | Emit from normalized `user_message` before backend transport. |
| Send-time enrichment | SDK/desktop runtime boundary | Memory retrieval, readable-file context, screenshots, workspace context, and model selection must flow through SDK-owned send lifecycle or explicit runtime hooks. |
| User-message attachment metadata | SDK events/projection | Persist/project through SDK conversation events, not renderer `updateMessage(...)`. |
| Backend dispatch | SDK runtime + Electron transport | Renderer should not know backend websocket details. |
| Renderer transcript list | SDK `displayRows` projection | Renderer maps SDK rows to visual components and may preserve visual annotations by id only. |
| Failure messages | SDK/runtime events where transcript-visible | Renderer-local error rows are allowed only for errors that happen before a valid SDK turn exists, and those must be classified. |

## Required Architectural Change

Move send preparation from this shape:

```text
renderer prepare
  -> renderer addMessage(user)
  -> renderer capture/upload
  -> renderer updateMessage(user)
  -> SDK send
  -> SDK displayRows replace renderer messages
```

to this shape:

```text
renderer prepare minimal send intent
  -> SDK send starts
  -> SDK emits user_message/displayRows immediately
  -> SDK-owned enrichment/capture hooks complete
  -> SDK appends metadata/update event if display metadata changes
  -> SDK transport sends enriched backend query
  -> renderer keeps rendering SDK displayRows
```

The refactor should avoid an adapter layer that only renames and forwards
payloads. Any new hook must enforce an actual boundary, such as desktop-only
enrichment, local authority, or send lifecycle sequencing.

## In Scope

- Delete renderer-local optimistic user row creation from
  `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`.
- Delete or repurpose `buildPendingUserMessage(...)` if no remaining non-test
  user-row caller exists.
- Remove `addMessage` and `updateMessage` dependencies from the normal send
  path in `useChatMessageSender(...)`.
- Move immediate visible user-row emission into `SdkConversationRuntime.send()`
  by changing send order so `turn_started` / base `user_message` happen before
  slow enrichment or backend dispatch.
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
    screenshots/attachments, because that keeps the same visible row ownership
    problem under a different name.
- Keep display row identity stable for the sent user row across base
  `user_message`, metadata updates, backend metadata events, completion, and
  reload.
- Update SDK projection tests so user-message metadata changes do not create a
  second visible user row.
- Update renderer tests so send does not call `addMessage` / `updateMessage`
  for the successful user row path.
- Update docs that still allow renderer pending visible messages.

## Out of Scope

- Redesigning chat UI layout, MessageList visuals, or composer controls.
- Changing backend provider history ownership.
- Changing sidecar storage schema unless the chosen SDK metadata event requires
  a migration; the preferred path is append-only event compatibility with no
  database schema migration.
- Rewriting edit/resend/retry beyond preserving their current behavior through
  the new SDK-owned send row lifecycle.
- Removing renderer-local error display for failures that happen before a
  valid conversation/turn can be created; those must be classified, not blindly
  deleted.

## Inspection Workflow

Before implementation, reread these anchors:

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/queryScreenshotPipeline.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/main/ipc/ipc_chat_query_handlers.cjs`
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/conversation/types.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/WindieSdkConversationRuntime.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/RendererChatRuntimeBoundary.test.ts`

Then run this inspection loop until no in-scope violations remain:

1. Search for renderer send-time message writes:
   `rg -n "buildPendingUserMessage|renderer-compose|dependencies\\.addMessage|dependencies\\.updateMessage|updateMessage\\(turnId|appendSendFailureMessage|sourceEventType: 'renderer-compose'|sourceEventType: \"renderer-compose\"" frontend/src/renderer tests/frontend`.
2. Classify every hit as deleted, pre-SDK-turn error-only, or out of scope with
   a reason.
3. Search for SDK display row sources and user-message metadata merging:
   `rg -n "user_message_metadata|user_message_updated|buildDisplayRows|displayRows|user_message" packages/windie-sdk-js/src tests/frontend`.
4. Reread the changed send flow and projection code after each slice.
5. Verify no renderer code reintroduces transcript-row interpretation to hide
   the migration.

## Implementation Checklist

- [ ] Create a matching execution report under `docs/plans/` before code
      changes, and keep it current through the refactor.
- [ ] Add SDK tests that prove `ConversationRuntime.send()` emits
      `turn_started` and a visible `user_message` snapshot before slow
      enrichment/transport resolves.
- [ ] Add SDK tests for user-message metadata/update projection:
      one user row, stable id, merged screenshot/attachment metadata, no second
      visible row.
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
- [ ] Keep `setIsSending` / `setThinkingStatus` only if they remain UI control
      state; prefer SDK current-turn projection if those become redundant.
- [ ] Preserve readable attachment failure behavior, but classify whether it is
      pre-SDK-turn local validation or should become a SDK/runtime error event.
- [ ] Preserve backend send failure behavior as SDK/runtime terminal state, not
      renderer-local transcript append.
- [ ] Update renderer boundary tests to fail if successful send writes
      transcript rows locally.
- [ ] Update docs in `docs/sdk/conversation_runtime.md` and
      `docs/architecture/frontend_architecture.md`.
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
- Historical replay uses the same SDK projection as live display.
- Send failure and readable-file failure behavior remains visible and
  deterministic.
- No new Electron-only bridge or adapter exists only to rename payloads.
- No storage migration is needed, or a no-migration note explains why the
  append-only event strategy is compatible.

## Validation Commands

Run focused tests first:

```bash
cd frontend && npm test -- --runInBand \
  ../tests/frontend/ChatMessageSender.test.tsx \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts \
  ../tests/frontend/SdkDisplayChatMessageProjection.test.ts \
  ../tests/frontend/RendererChatRuntimeBoundary.test.ts
```

Then run broader impacted checks:

```bash
cd frontend && npm test -- --runInBand \
  ../tests/frontend/ChatInterfaceWiring.test.jsx \
  ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx \
  ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx \
  ../tests/frontend/MessagePresentationPipeline.test.js \
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
manually verify that a sent user message appears once and does not visually
reload when SDK rows arrive:

```bash
bin/windie start desktop
```

## Assumptions

- The product priority is immediate visible feedback without renderer-owned
  transcript rows.
- SDK event storage remains append-only; if a user-message metadata event is
  needed, projection merging is preferred over mutating existing stored events.
- Renderer-local failure rows are allowed only before a valid SDK turn exists.
- The unrelated `scratch/` worktree entry is not part of this plan.

## Approval Gate

Do not implement this plan until the user approves it. After approval, create
the matching report and begin with the SDK tests that prove immediate row
emission before enrichment/transport.
