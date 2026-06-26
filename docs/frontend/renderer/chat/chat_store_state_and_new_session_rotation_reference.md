---
summary: "Deep reference for chat store and session-rotation behavior: per-conversation workspace state, workspace-only chat reads, stream-tracking reset rules, new-chat lifecycle, and conversation-ref synchronization paths."
read_when:
  - When changing `chatStore`, `startNewChatSession`, or conversation-resume/new-chat state transitions.
  - When debugging stale stream phases, unexpected `isSending` state, pending-turn stop behavior, or conversation-ref mismatch after new/continued sessions.
title: "Chat Store State and New Session Rotation Reference"
---

# Chat Store State and New Session Rotation Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/stores/chatStoreAdapters.ts`
- `frontend/src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatInterfacePresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatRevisionActionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatWorkspaceStateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationViewWorkspaceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopPendingTurnBridgeRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatWorkspaceMessageRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatTurnConversationRefRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopStopTurnRuntime.js`
- `frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopActiveChatSessionRuntime.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntime.ts`
- `tests/frontend/ChatStore.test.ts`

## Chat Store Contract

Primary `ChatWorkspaceState` fields:

- `messages`
- `isSending`
- `thinkingStatus`
- `thinkingSourceEventType`
- `compactionDebugInfo`
- `tokenCounts`
- `streamTracking`
- `sdkLiveTurn`
- `conversationView`
- `pendingTurn`

Conversation workspace state:

- `activeConversationRef`
- `workspaces: Record<workspaceRef, ChatWorkspaceState>`

Turn-scoped event routing state:

- `desktopChatTurnConversationRefRuntime.ts` owns the renderer
  `turnRef -> conversationRef` registry.
- `chatStore.ts` does not expose turn-ref registry actions. Store message
  mutations may record turn refs through injected app-runtime dependencies, and
  stream ingress calls the app-runtime registry directly.

The default workspace key is private to
`desktopChatWorkspaceStateRuntime.ts`. Store
initialization uses `createInitialWorkspaceRecord()` so `chatStore.ts` and
feature callers do not import the raw sentinel string.

All mutating actions accept optional `conversationRef` and write into that workspace. The workspace record is the read authority. `chatStore.ts` no longer mirrors workspace fields such as `messages`, `isSending`, `sdkLiveTurn`, `conversationView`, or `pendingTurn` onto the store root; production callers use selectors or `getWorkspaceState(...)` instead.
`chatStore.ts` is the Zustand state/selector module. Workspace mutation
adapter functions live in `chatStoreAdapters.ts`, which imports the runtime
mutation helpers and applies their returned state updates through
`useChatStore.setState(...)`. Hooks that need active conversation, workspace,
projected read-model, or send read-model snapshots use named
`chatStoreAdapters.ts` getters instead of calling `useChatStore.getState()`
directly.
Dashboard conversation-open reset code receives
`getWorkspaceStateFromChatStore` from the adapter layer rather than a raw
Zustand `getWorkspaceState` method from `DashboardShell`.
Stream compaction handlers persist SDK replay replacement snapshots through
`DesktopChatStreamCompactionRuntime`; React handlers should not call the
conversation continuity service directly.

Message attachment fields used by current renderer message paths:

- `attachments[]`: SDK typed display descriptors for visible image, screenshot
  request, pending, and failed attachment states.

Whole-message screenshot aliases such as `screenshot`, `screenshotRef`,
`screenshotUrl`, and `screenshots[]` are not part of the renderer
`ChatMessage` contract. Legacy screenshot metadata remains confined to SDK
replay/store compatibility adapters and low-level artifact helpers.
SDK current-turn and display-row projection both read typed visual attachments
through `DesktopSdkDisplayAttachmentProjection.readSdkDisplayAttachments(...)`;
current-turn projection does not keep a separate attachment descriptor
validator. Artifact image rendering also receives normalized SDK image source
fields from `DesktopSdkDisplayAttachmentProjection.readSdkImageAttachmentSource(...)`
instead of validating attachment lifecycle fields in the React hook.
SDK current-turn tool detail rows sanitize attachment, model-facing, raw payload,
and screenshot compatibility fields through
`DesktopSdkToolDetailProjection.sanitizeSdkToolDetailRecord(...)`, keeping
current-turn row construction on typed SDK presentation fields.

`streamTracking` fields capture turn identity, phase, counters, and timestamps per workspace:

- phases: `idle | awaiting-first-chunk | streaming | tool-call | tool-output | complete | error`
- active turn ref and last event metadata are scoped by conversation workspace for stop/cancel/tool guards

## Action Semantics and No-Op Guards

`chatStoreAdapters` action behavior:

- Message writes enter through the module-level
  `addMessageToChatStore(...)`, `updateMessageInChatStore(...)`,
  `updateStreamTargetMessageInChatStore(...)`, and
  `setMessagesInChatStore(...)` adapters instead of Zustand actions.
  `addMessageToChatStore(...)` appends immutably through
  `DesktopChatWorkspaceMessageRuntime.buildAddMessageStateUpdate(...)`.
- `updateMessageInChatStore(...)` updates by id through
  `DesktopChatWorkspaceMessageRuntime.buildUpdateMessageStateUpdate(...)` and
  returns original state when id missing.
- `updateStreamTargetMessageInChatStore(...)` applies stream metadata updates to named
  app-runtime targets such as the last sender row or last assistant LLM-text
  row. Target lookup lives in
  `DesktopChatWorkspaceMessageRuntime.buildUpdateStreamTargetMessageStateUpdate(...)`
  so chat-stream hooks pass target intent instead of reading workspace
  `messages` to choose row ids.
- `setMessagesInChatStore(...)` no-ops when array reference is unchanged; when hydrating a concrete
  conversation workspace, it records message `turnRef` values through the
  app-runtime turn-routing registry so later turn-scoped stream events can
  route even when `conversation_ref` is absent. Turn-ref normalization and map
  merge rules live in `desktopChatTurnConversationRefRuntime.ts`; message array
  replacement, duplicate id replacement, missing-id no-op handling, and
  workspace update assembly live in `desktopChatWorkspaceMessageRuntime.ts`.
  The adapter module only passes message intent plus workspace and registry
  dependency adapters.
  Once a workspace has a `ConversationView`, raw message add/set/stream-target
  writes no-op because SDK display rows are authoritative. Direct id updates
  under a view are narrowed to renderer-local feedback, stored only so
  `rendererAnnotations` can merge them back onto SDK rows.
- Scalar workspace-field writes enter through the module-level
  `setIsSendingInChatStore(...)`, `setThinkingStatusInChatStore(...)`,
  `setThinkingSourceEventTypeInChatStore(...)`,
  `setCompactionDebugInfoInChatStore(...)`, and
  `setTokenCountsInChatStore(...)` adapters instead of Zustand actions. The
  adapters apply simple workspace field updates through
  `DesktopChatWorkspaceFieldRuntime.buildSetWorkspaceFieldStateUpdate(...)`.
  Workspace resolution, equality no-op handling, and workspace update assembly
  live in that app runtime; the adapter module only passes field intent plus
  workspace dependency adapters.
- Stream-tracking updates enter through the module-level
  `updateStreamTrackingInChatStore(...)` adapter instead of a Zustand action.
  The adapter applies updater output through
  `DesktopChatStreamTrackingRuntime.buildUpdateStreamTrackingStateUpdate(...)`.
  Workspace resolution, stream-tracking reference no-op handling, and workspace
  update assembly live in that app runtime; the adapter module only passes
  updater intent plus workspace dependency adapters.
- SDK live-turn updates enter through the module-level
  `setNoViewSdkLiveTurnInChatStore(...)` adapter instead of a Zustand action. It
  updates the target workspace and clears a matching `pendingTurn` only after
  the SDK live-turn projection for that conversation/turn has visible
  replacement content or terminal lifecycle. Awaiting-only and flag-only SDK
  projections may drive typing/busy state, but they must not clear the pending
  bridge because the pending bridge owns the only visible dashboard user row
  until SDK display rows or `ConversationView` arrive. Raw
  no-view SDK live-turn storage is read, written, and reset through
  `DesktopChatWorkspaceStateRuntime` helpers; pending-turn replacement and
  no-op guards live in `desktopCurrentTurnWorkspaceRuntime.ts`. The store
  module delegates SDK live-turn intent plus workspace dependency adapters.
- SDK `ConversationView` writes enter through the module-level
  `setConversationViewInChatStore(...)` adapter instead of a Zustand action.
  The conversation-view workspace state update lives in
  `desktopConversationViewWorkspaceRuntime.ts`; the adapter module delegates
  conversation-view intent plus workspace dependency adapters. A same-turn SDK
  `ConversationView` clears the renderer-local pending bridge only after the
  view has a visible replacement for that pending send: a same-turn SDK user
  display row, live entries, or terminal lifecycle. Awaiting-only or busy-only
  view snapshots may drive surface state, but they do not erase the pending
  bridge because that bridge owns the only visible dashboard user row and
  typing anchor before SDK rows arrive.
- `acceptPendingTurnInChatStore(...)` stores the renderer-local pending turn
  before the SDK live turn opens, so dashboard/pill surfaces can
  show awaiting state and stop can target the real outgoing `turnRef`; an
  echoed pending-turn broadcast for the same conversation/user/turn/text is a
  no-op so renderer IPC fan-out cannot repaint the existing user bubble.
  Pending turns preserve only identity, text, and timestamp; visible filename
  and attachment descriptors belong to SDK display rows. Accept-pending
  preserves the raw workspace `messages` list and stores only `pendingTurn`,
  because presentation projects the short bridge from `pendingTurn` directly
  for both no-view and `ConversationView` rendering. The pending user-row shape
  and SDK live-turn workspace mutation are built by app-runtime helpers. The
  pending row builder rejects partial pending objects that do not match the
  normalized bridge payload, so projection adapters cannot recover a user row
  from incomplete renderer state.
  The accept-pending and clear decisions also live in
  `desktopChatPendingTurnStateRuntime.ts`; `chatStoreAdapters.ts` supplies
  workspace read/write dependencies and applies the returned update through the
  store. Pending-turn IPC broadcasts use
  `applyPendingTurnBroadcastToChatStore(...)` instead of a Zustand action, so
  React components do not select broadcast handling from store state.
- Replay/edit/retry commands do not use the renderer pending-turn bridge.
  `desktopConversationReplayRuntime` passes only row ids/text, workspace path,
  model selection, and session identity to SDK command APIs; SDK runtime owns
  target-row lookup, child display revision cuts, supersession, replacement
  display rows, and display-row `attachments[]`. The legacy replay-pending
  reducer and renderer superseded-turn ledger have been removed; renderer
  pending state is now only the normal post-send bridge.
  `useConversationReplayActions(...)` passes replay intent plus renderer config
  into `executeReplayActionFromChatStore(...)`; the chat-store adapter supplies
  the store bridge and the replay runtime derives the deferred SDK model
  selection before dispatching SDK commands. Replay requires an existing
  conversation ref from the transcript session or chat-store active workspace;
  it must not create a fresh conversation for a row id the SDK cannot resolve.
- `clearPendingTurnInChatStore(...)` clears only a pending turn matching the provided
  `conversationRef`/`turnRef`; missing filters clear the active pending turn.
  Pending-turn clear matching, broadcast action branching, and workspace
  mutation live in
  `desktopChatPendingTurnStateRuntime.ts`, including the pending-turn broadcast
  clear path.
- Revision menu loading, checkout, and fork execution route through
  `DesktopChatRevisionActionRuntime`; `ChatInterface` owns menu state and
  applying returned SDK views, but it does not call continuity-service revision
  commands directly.
- Terminal stream handoff during `idle`, `complete`, or `error` phases uses
  the explicit `pendingTurn` bridge identity only; it does not scan raw
  workspace message tails for optimistic user rows or assistant placeholders.
- `acceptStoppedTurnInChatStore(...)` immediately clears local busy/thinking
  state, clears a matching pending turn, patches stream tracking to terminal
  `complete`, and terminalizes the matching SDK live turn while preserving any
  already visible assistant content. Stopped SDK live turns strip SDK
  `typingVisible` and `overlayVisible` compatibility fields; visible lifecycle
  derives busy/typing state from terminal phase plus visible entries. Stopped
  workspace mutation, current-turn identity matching, stop-target normalization,
  and workspace update application live in `desktopStopTurnRuntime.js`, not
  hard-coded in the store.
  React stop handlers and stopped-turn callers pass only target identity from
  SDK `ConversationView` or the renderer pending bridge into that runtime; raw
  `currentTurnProjection` is not accepted as caller-supplied stop state.
  `DesktopStopTurnRuntime.executeStopTurnExecutionPlan(...)` owns
  pending-bridge cleanup classification and stop-plan field handling, so React
  handlers wire UI dependencies into the runtime instead of consuming
  `conversationRef`, `turnRef`, `canStop`, or `shouldClearPendingBridge` plan
  values directly.
  When a workspace already has a `ConversationView`, stopped-turn mutation
  ignores the raw no-view live-turn fallback, clears it to `null`, and only
  applies renderer-local cleanup for a matching pending bridge.
- `clearMessagesInChatStore(...)` clears messages, clears raw send cleanup
  state, and resets `streamTracking` to initial idle shape through
  `DesktopChatClearMessagesRuntime.buildClearMessagesStateUpdate(...)`. The
  clear-message reset field list and workspace update assembly live in that app
  runtime; the adapter module only passes clear intent plus workspace
  dependency adapters.
- `setActiveConversationRef` switches only the active workspace ref and ensures
  the workspace record exists through
  `DesktopChatWorkspaceStateRuntime.buildActiveConversationWorkspaceUpdate(...)`.
- Dashboard conversation open uses
  `DesktopDashboardConversationLoadRuntime.applyDashboardConversationOpenWorkspaceReset(...)`
  to decide whether raw no-view workspace cleanup is needed before the SDK
  `ConversationView` load resolves. The dashboard hook passes callback
  dependencies only; it does not inspect workspace `messages` or
  `conversationView` to decide whether to clear renderer-owned chat state.
- generic workspace update assembly, workspace-record reads, and workspace
  mutation target resolution live in
  `desktopChatWorkspaceStateRuntime.ts`; `chatStore.ts` calls those helpers
  instead of defining the boilerplate. `readWorkspaceState(...)` never
  reconstructs an active workspace from stale top-level mirror fields, and
  `buildWorkspaceUpdate(...)` never projects workspace fields back onto the
  store root.
- Turn-ref registration and lookup for events that omit `conversation_ref` live
  in `desktopChatTurnConversationRefRuntime.ts`. The store must not expose
  registry adapter methods or add a second Zustand-owned copy; it only injects
  registry dependencies into message mutation helpers that need to index
  hydrated message rows.
- response-overlay dismissal state is persisted by the store, but normalized
  conversation/turn/entry dismissal-key construction plus state update/read
  helpers live in `DesktopResponseOverlayViewRuntime`; the store only binds
  those helpers to Zustand, and response-overlay view models ask the runtime
  for the dismissed response id instead of reading dismissal keys directly.

No-op guards reduce unnecessary re-renders on high-frequency stream paths.

## Selector Boundary

`DesktopChatInterfaceSelectorRuntime` owns the composed selector view model for
the full chat interface and live minimal surfaces. It applies
`DesktopChatSurfaceSelectorRuntime`, `DesktopChatInterfacePresentationRuntime`,
and stop-target selection while keeping stable nested selector objects.
Repeated selector reads for the same pending-turn, surface, and presentation
inputs must reuse the same `chatSurfaceState` and `renderedMessages`
references, because React/Zustand treats fresh derived snapshots during
dashboard mount as an infinite subscription update loop.
`chatStore.ts` only binds those projection methods to
`selectActiveWorkspaceReadModelState(...)` so the app-runtime helper does not
import chat feature store internals.

`DesktopChatWorkspaceStateRuntime.selectActiveWorkspaceReadModelState(...)` is
the normal read entrypoint for chat UI selectors. It always returns a cached
selector read model rather than the raw workspace object. While no SDK
`ConversationView` exists, raw stored messages remain available and the
temporary live fallback is exposed as `sdkLiveTurn`.
Once `ConversationView` exists, raw `messages` are replaced by the
stable empty list and `sdkLiveTurn` is also `null`. The short `pendingTurn`
bridge remains available, and renderer-only feedback is carried separately as
`rendererAnnotations` for display-row annotation merge.

Surface, response-overlay, interface presentation, and send-read-model selector
adapters consume that read model as their input contract. They should not
rederive renderer annotations from raw messages or independently choose between
`messages`, `sdkLiveTurn`, and `ConversationView`; that choice belongs
to the workspace read-model runtime. Selected surface state passes through the
no-view live-turn fallback as `sdkLiveTurn`, so dashboard, pill, and
response-overlay consumers receive SDK live-turn intent without reopening raw
current-turn storage. When `ConversationView` exists,
`sdkLiveTurn` is `null` and raw messages have already been replaced by the
stable empty list before those adapters run; the surface selector also enforces
that blanking for direct app-runtime callers. The chat surface controller
repeats the guard before visible lifecycle projection, so direct controller
calls cannot combine `ConversationView` with raw messages or the no-view
`sdkLiveTurn` fallback. Response-overlay surface state applies the same guard
before resolving overlay entries and dismissal targets. The view plus pending
bridge own visible lifecycle and stop authority.
The interface presentation adapter also blanks the no-view `sdkLiveTurn`
fallback before invoking the thread presenter when a `ConversationView` exists,
so stale raw current-turn rows cannot re-enter through the presentation layer.
The thread presenter enforces the same read-model boundary for direct
app-runtime callers: with `ConversationView` present, its base rows must be
SDK display-row messages or the explicit renderer pending bridge. Untagged raw
chat-store rows are ignored before live-row insertion and duplicate checks.
The conversation projection-stream hook applies the same rule when it needs
workspace context for stale-turn checks and replay traces: it wraps raw store
workspace reads with `projectWorkspaceReadModelState(...)`, so projection-stream
diagnostics consume `sdkLiveTurn`.
Replay action diagnostics also route workspace snapshots through that read-model
runtime before calling `buildReplayProjectionTracePayload(...)`, so SDK replay
commands and their traces do not restore raw message/current-turn authority when
`ConversationView` exists.

When `ConversationView` exists, the shared interface projection returns the
stable empty message list plus narrow `rendererAnnotations`; it does not pass
the full raw workspace transcript into
`DesktopChatInterfacePresentationRuntime`. Raw messages remain available only
through raw workspace mutation/adapters and for no-view historical fallback
rendering; the pending-send bridge is carried separately as `pendingTurn`.
First-class `ConversationView` presentation still projects the pending bridge
while the view has not yet supplied a same-turn SDK user display row, so an
awaiting/busy view snapshot cannot render an empty transcript between user
send acceptance and the first display-row/live-entry projection.
Send-read-model helpers follow the same rule: once a `ConversationView` object
is present, first-user-message decisions read only `displayRows` and do not
fall back to raw chat-store messages, even if a direct app-runtime caller passes
a partial view shape.

`selectChatInterfaceState` exposes the active workspace selector model:

- `thinkingStatus`, `tokenCounts`
- `renderedMessages` and `activeRevisionId` from
  `DesktopChatInterfacePresentationRuntime`; edit/retry availability remains
  on each projected SDK row's `actions`
- revision menu rows from `DesktopChatRevisionActionRuntime`; React receives
  prepared checkout/fork action ids, active state, labels, and disabled state
  instead of deriving revision action availability in the header component
- `stopTurnTarget` from `DesktopStopTurnRuntime.resolveStopTurnTarget(...)`,
  selected from SDK `ConversationView` first and the renderer pending bridge
  second
- `chatSurfaceState`, a nested selected surface read model for
  `useChatSurfaceController(...)`; it carries `sdkLiveTurn` only for the
  no-view fallback path and never exposes raw `currentTurnProjection`

`selectChatSendReadModel` is the send-only read model for
`useChatMessageSender(...)`. It exposes only the resolved
`hasPriorUserMessages` predicate. The selector computes that predicate from SDK
`ConversationView.displayRows` when a view exists and from raw `messages` only
for the no-view first-message fallback, without passing either row source into
send preparation or adding those raw fields back to the React chat-interface
selector.

Minimal chat pill and response overlay state now route through the live-turn
presentation/view-model helpers instead of a separate chat-box selector. The
dashboard selector remains scoped to fields rendered by the full interface, so
raw workspace `isSending` stays store/diagnostic state rather than dashboard surface
authority. Response overlay view-model tracing must not subscribe to raw
workspace `streamTracking`; overlay diagnostics should use the selected
`chatSurfaceState`/visible lifecycle instead of reopening store runtime state
as a surface input.

## New Chat Session Lifecycle

Dashboard-to-chat new-chat requests use the renderer-only
`DesktopChatEventsRuntime.dispatchDesktopRuntimeNewChatEvent(...)` /
`DesktopChatEventsRuntime.subscribeDesktopRuntimeNewChatEvent(...)` methods so
dashboard components and chat hooks do not construct or subscribe to the custom
browser event directly.

`DesktopNewChatSessionRuntime.startNewChatSession(...)` order:

1. optional `stopActiveQuery()` callback
2. reset the previous active chat through
   `DesktopActiveChatSessionRuntime.resetActiveChatSession(...)`
3. create new `conversationRef` via `desktopConversationSessionRuntime.createConversationRef()`
4. snapshot the currently selected workspace into the conversation binding map
5. persist through `setActiveConversationRef(nextConversationRef)`
6. return new conversation ref

`DesktopActiveChatSessionRuntime.resetActiveChatSession(...)` owns the shared
renderer rule for clearing active transcript identity plus chat workspace
state. Chat new-session and dashboard delete/clear paths call that app-runtime
facade instead of keeping a chat-feature-only reset helper.

`desktopConversationSessionRuntime.createConversationRef()` format is deterministic prefix: `conv_${crypto.randomUUID()}`.

Workspace-binding invariant:

- one chat belongs to exactly one workspace binding
- multiple chats may share the same workspace binding
- changing the selected workspace creates a fresh chat instead of mutating the existing chat's binding
- opening an older chat restores its bound workspace back into the active Electron workspace selection before more sends/tool calls happen

## Main-Window Call-Site (`ChatInterface`)

`DesktopChatInterfacePresentationRuntime` owns the main chat thread
presentation view model. It combines SDK `ConversationView`, the no-view
current-turn bridge, stored messages, the local pending bridge, and
SDK display-row `actions` into `renderedMessages`, edit/retry availability, and
active revision id. When a view exists, it builds base thread messages from
`ConversationView.displayRows` through
`DesktopConversationDisplayProjection.buildConversationViewChatMessages(...)`
and passes only renderer annotation records selected by the surface/interface
selector boundary for feedback. The
pending bridge is projected from `pendingTurn` through
`DesktopConversationDisplayProjection.buildPendingBridgeChatMessages(...)` for
the no-view path and
`DesktopConversationDisplayProjection.buildConversationViewChatMessages(...)`
for the ConversationView path, so pending rendering does not write the
renderer-composed row into raw workspace `messages`. Raw `ROWS`/display-row stream events remain Electron IPC
compatibility plumbing only; the renderer chat projection hook does not
subscribe to them or write those rows into `ChatWorkspaceState.messages`. The
component consumes that view model and does not choose between raw messages,
current-turn rows, and `ConversationView` action metadata inline.
When checkout/fork commands return a `ConversationView`, `ChatInterface` stores
only that SDK view for the target conversation; it does not project
`displayRows` back into active workspace messages.
Replay actions do not consume selector row models. The hook passes only row
ids/text plus UI dependencies to `DesktopConversationReplayRuntime`, which
forwards intent to SDK command APIs. SDK runtime resolves display rows and
resources from its canonical `ConversationView`/display timeline state.

`DesktopChatRevisionActionRuntime` owns checkout/fork command input shaping for
the revision menu: revision id normalization, action ids, default user id, and
active row marking after checkout. `ChatInterface` calls the SDK command facade
with those prepared inputs instead of constructing revision command payloads or
comparing revision ids inline.

`handleNewChat` passes `stopActiveQuery` only when stream phase is active. Stop callback does:

- `stopPlayback()`
- `DesktopLiveTurnRuntimeClient.stop()`

So new-chat resets local store regardless, while active backend loop receives stop signal when applicable.

## Resume Conversation Call-Site (Dashboard)

`DashboardShell.handleOpenConversation(...)` flow:

1. mark the target `conversationRef` as opening so an empty selected workspace
   renders a loading state instead of the new-chat welcome state
2. load transcript rows for the target conversation
3. recover the conversation's stored workspace binding from transcript/list metadata
4. push that binding back into Electron's active workspace selection
5. call `setActiveConversationRef(conversationRef)`
6. call `updateTranscriptSession(conversationRef, sessionInfo.userId || null)`
7. clear the no-view fallback state only when no cached `ConversationView`
   already exists for the target conversation
8. load and store the SDK `ConversationView` without projecting
   `displayRows` into active workspace messages
9. clear sending/thinking flags
10. clear the opening marker, close dashboard overlays, and keep chat surface active

Conversation-view display row to component-message projection is performed by
`DesktopConversationDisplayProjection.buildConversationViewChatMessages(...)`.
No-view pending user-row projection is performed by
`DesktopConversationDisplayProjection.buildPendingBridgeChatMessages(...)`.
Feature components should pass the SDK view, stored messages, and the local
pending bridge state to those app-runtime helpers instead of rebuilding
display-row merge rules.

This path intentionally does not call `startNewChatSession`; it restores an existing conversation ref.

During active loops, dashboard history switching is allowed. In-flight events continue writing to their originating workspace, while the shell renders whichever conversation is currently active.

## Transcript Session Synchronization

The desktop transcript session runtime is the source for active transcript identity:

- `setActiveConversationRef(...)` updates cached session info and emits session update event when changed
- pending transcript queues flush only when both `conversationRef` and `userId` are available
- current renderer session-info projection combines transcript identity with
  active chat-store conversation refs through
  `desktopConversationSessionRuntime.resolveCurrentRendererConversationSessionInfo(...)`;
  feature hooks should not carry their own empty session snapshot constants

Chat store reset and transcript-session ref updates are separate concerns; new-chat path updates both through `DesktopNewChatSessionRuntime.startNewChatSession(...)` + the desktop transcript session runtime.

## Test-Backed Invariants

`tests/frontend/ChatStore.test.ts` verifies:

- append/update behavior
- missing-id update no-op
- same-reference no-op behavior for `setMessages` and scalar setters
- `clearMessages` leaves empty messages, cleared send cleanup state, and reset
  stream state
- stream tracking updater semantics
- pending-turn acceptance/clearing and stopped-turn terminalization semantics

`tests/frontend/ChatMessageSender.test.tsx` indirectly verifies conversation-ref reuse and generation behavior around send-path creation.

## Drift Hotspots

1. removing `clearMessages` stream-tracking reset causes stale phases across conversations.
2. changing no-op guards can increase render churn in streaming-heavy paths.
3. changing conversation ref format/prefix can break downstream expectations for `conv_` ids.
4. diverging dashboard resume ref updates from transcript session updates can desync UI and transcript writes.
5. clearing pending turns without matching `conversationRef`/`turnRef` can hide
   the awaiting state for a newer turn or send a turnless stop for a pending
   query.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
