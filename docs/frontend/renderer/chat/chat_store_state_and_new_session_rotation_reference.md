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
- `frontend/src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatInterfacePresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatRevisionActionRuntime.js`
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
- `currentTurnProjection`
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

The default workspace key is private to `chatWorkspaceState.ts`. Store
initialization uses `createInitialWorkspaceRecord()` so `chatStore.ts` and
feature callers do not import the raw sentinel string.

All mutating actions accept optional `conversationRef` and write into that workspace. The workspace record is the read authority. `chatStore.ts` no longer mirrors workspace fields such as `messages`, `isSending`, `currentTurnProjection`, `conversationView`, or `pendingTurn` onto the store root; production callers use selectors or `getWorkspaceState(...)` instead.

Message attachment fields used by current renderer message paths:

- `attachments[]`: SDK typed display descriptors for visible image, screenshot
  request, pending, and failed attachment states.
- `attachmentFilenames[]`: filename metadata for the short pending bridge and
  diagnostics only; it is not a visible attachment fallback.

Whole-message screenshot aliases such as `screenshot`, `screenshotRef`,
`screenshotUrl`, and `screenshots[]` are not part of the renderer
`ChatMessage` contract. Legacy screenshot metadata remains confined to SDK
replay/store compatibility adapters and low-level artifact helpers.

`streamTracking` fields capture turn identity, phase, counters, and timestamps per workspace:

- phases: `idle | awaiting-first-chunk | streaming | tool-call | tool-output | complete | error`
- active turn ref and last event metadata are scoped by conversation workspace for stop/cancel/tool guards

## Action Semantics and No-Op Guards

`chatStore` action behavior:

- `addMessage` appends immutably through
  `DesktopChatWorkspaceMessageRuntime.buildAddMessageStateUpdate(...)`.
- `updateMessage` updates by id through
  `DesktopChatWorkspaceMessageRuntime.buildUpdateMessageStateUpdate(...)` and
  returns original state when id missing.
- `updateStreamTargetMessage` applies stream metadata updates to named
  app-runtime targets such as the last sender row or last assistant LLM-text
  row. Target lookup lives in
  `DesktopChatWorkspaceMessageRuntime.buildUpdateStreamTargetMessageStateUpdate(...)`
  so chat-stream hooks pass target intent instead of reading workspace
  `messages` to choose row ids.
- `setMessages` no-op when array reference unchanged; when hydrating a concrete
  conversation workspace, it records message `turnRef` values through the
  app-runtime turn-routing registry so later turn-scoped stream events can
  route even when `conversation_ref` is absent. Turn-ref normalization and map
  merge rules live in `desktopChatTurnConversationRefRuntime.ts`; message array
  replacement, duplicate id replacement, missing-id no-op handling, and
  workspace update assembly live in `desktopChatWorkspaceMessageRuntime.ts`.
  The store only passes message intent plus workspace and registry dependency
  adapters.
- `setIsSending`, `setThinkingStatus`, `setThinkingSourceEventType`,
  `setCompactionDebugInfo`, and `setTokenCounts` apply simple workspace field
  updates through
  `DesktopChatWorkspaceFieldRuntime.buildSetWorkspaceFieldStateUpdate(...)`.
  Workspace resolution, equality no-op handling, and workspace update assembly
  live in that app runtime; the store only passes field intent plus workspace
  dependency adapters.
- `updateStreamTracking` applies updater output through
  `DesktopChatStreamTrackingRuntime.buildUpdateStreamTrackingStateUpdate(...)`.
  Workspace resolution, stream-tracking reference no-op handling, and workspace
  update assembly live in that app runtime; the store only passes updater intent
  plus workspace dependency adapters.
- SDK current-turn projection updates enter through the module-level
  `setCurrentTurnProjectionInChatStore(...)` adapter instead of a Zustand
  action. It updates the target workspace and clears a matching `pendingTurn`
  only after the SDK current-turn projection for that conversation/turn
  arrives. The current-turn workspace state update, pending-turn replacement,
  and no-op guard live in `desktopCurrentTurnWorkspaceRuntime.ts`; the store
  module delegates current-turn projection intent plus workspace dependency
  adapters.
- SDK `ConversationView` writes enter through the module-level
  `setConversationViewInChatStore(...)` adapter instead of a Zustand action.
  The conversation-view workspace state update lives in
  `desktopConversationViewWorkspaceRuntime.ts`; the store module delegates
  conversation-view intent plus workspace dependency adapters. A same-turn
  authoritative SDK `ConversationView.liveTurn` also clears the renderer-local
  pending bridge there, so `chatStore.ts` does not keep a competing pending
  state after SDK view authority exists.
- `acceptPendingTurn` stores the renderer-local pending turn before the SDK
  current-turn projection opens, so dashboard/pill surfaces can show awaiting
  state and stop can target the real outgoing `turnRef`; an echoed pending-turn
  broadcast for the same conversation/user/turn/text is a no-op so renderer
  IPC fan-out cannot repaint the existing user bubble. Pending turns preserve
  only identity, text, timestamp, and filename chips; visual attachment
  descriptors belong to SDK display rows. The pending user-row shape and
  workspace mutation projection are built by app-runtime helpers. The
  store-level accept-pending and clear decisions also live in
  `desktopChatPendingTurnStateRuntime.ts`; `chatStore.ts` only supplies
  workspace read/write dependencies and applies the returned update.
  Pending-turn IPC broadcasts use the module-level
  `applyPendingTurnBroadcastToChatStore(...)` adapter instead of a Zustand
  action, so React components do not select broadcast handling from store state.
- Replay/edit/retry commands do not use the renderer pending-turn bridge.
  `desktopConversationReplayRuntime` passes only row ids/text, workspace path,
  model selection, and session identity to SDK command APIs; SDK runtime owns
  target-row lookup, child display revision cuts, supersession, replacement
  display rows, and display-row `attachments[]`. The legacy replay-pending
  reducer and renderer superseded-turn ledger have been removed; renderer
  pending state is now only the normal post-send bridge.
- `clearPendingTurn` clears only a pending turn matching the provided
  `conversationRef`/`turnRef`; missing filters clear the active pending turn.
  Pending-turn clear matching, broadcast action branching, and workspace
  mutation live in
  `desktopChatPendingTurnStateRuntime.ts`, including the pending-turn broadcast
  clear path.
- `acceptStoppedTurn` immediately clears local busy/thinking state, clears a
  matching pending turn, patches stream tracking to terminal `complete`, and
  terminalizes the matching SDK current-turn projection while preserving any
  already visible assistant content. Stopped projections strip SDK
  `typingVisible` and `overlayVisible` compatibility fields; visible lifecycle
  derives busy/typing state from terminal phase plus visible entries. Stopped
  workspace mutation, current-turn identity matching, stop-target normalization,
  and workspace update application live in `desktopStopTurnRuntime.js`, not
  hard-coded in the store.
  React stop handlers and `acceptStoppedTurn` callers pass only target identity
  from SDK `ConversationView` or the renderer pending bridge into that runtime;
  raw `currentTurnProjection` is not accepted as caller-supplied stop state.
- `clearMessages` clears messages, clears raw send cleanup state, and resets
  `streamTracking` to initial idle shape through
  `DesktopChatClearMessagesRuntime.buildClearMessagesStateUpdate(...)`. The
  clear-message reset field list and workspace update assembly live in that app
  runtime; the store only passes clear intent plus workspace dependency
  adapters.
- `setActiveConversationRef` switches only the active workspace ref and ensures
  the workspace record exists through
  `chatWorkspaceState.buildActiveConversationWorkspaceUpdate(...)`.
- generic workspace update assembly, workspace-record reads, and workspace
  mutation target resolution live in
  `chatWorkspaceState.ts`; `chatStore.ts` calls those helpers instead of
  defining the boilerplate. `readWorkspaceState(...)` never reconstructs an
  active workspace from stale top-level mirror fields, and
  `buildWorkspaceUpdate(...)` never projects workspace fields back onto the
  store root.
- Turn-ref registration and lookup for events that omit `conversation_ref` live
  in `desktopChatTurnConversationRefRuntime.ts`. The store must not expose
  registry adapter methods or add a second Zustand-owned copy; it only injects
  registry dependencies into message mutation helpers that need to index
  hydrated message rows.
- response-overlay dismissal state is persisted by the store, but normalized
  conversation/turn/entry dismissal-key construction lives in
  `DesktopResponseOverlayViewRuntime.buildResponseOverlayDismissalKey(...)`.

No-op guards reduce unnecessary re-renders on high-frequency stream paths.

## Selector Boundary

`DesktopChatInterfaceSelectorRuntime` owns the composed selector view model for
the full chat interface and live minimal surfaces. It applies
`DesktopChatSurfaceSelectorRuntime`, `DesktopChatInterfacePresentationRuntime`,
and stop-target selection while keeping stable nested selector objects.
`chatStore.ts` only binds those projection methods to
`selectActiveWorkspaceState(...)` so the app-runtime helper does not import chat
feature store internals.

When `ConversationView` exists, the shared interface projection returns the
stable empty message list plus narrow `rendererAnnotations`; it does not pass
the full raw workspace transcript into
`DesktopChatInterfacePresentationRuntime`. Raw messages remain available only
for no-view fallback rendering and the send read model described below.

`selectChatInterfaceState` exposes the active workspace selector model:

- `thinkingStatus`, `tokenCounts`
- `renderedMessages`, `canEditMessages`, `canRetryMessages`, and
  `activeRevisionId` from
  `DesktopChatInterfacePresentationRuntime`
- `stopTurnTarget` from `DesktopStopTurnRuntime.resolveStopTurnTarget(...)`,
  selected from SDK `ConversationView` first and the renderer pending bridge
  second
- `chatSurfaceState`, a nested selected surface read model for
  `useChatSurfaceController(...)`

`selectChatSendReadModel` is the send-only read model for
`useChatMessageSender(...)`. It exposes SDK `ConversationView` plus raw
`messages` only for the no-view first-message fallback without adding those raw
fields back to the React chat-interface selector. Once `ConversationView`
exists, the send read model returns an empty raw message list so send
preparation cannot accidentally use active workspace messages as competing
history authority beside SDK display rows.

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
`ConversationView.actions` into `renderedMessages`, edit/retry availability,
and active revision id. When a view exists, it builds base thread messages from
`ConversationView.displayRows` through
`DesktopConversationDisplayProjection.buildConversationViewChatMessages(...)`
and passes only renderer annotation records selected by the surface/interface
selector boundary for feedback, transparency metadata, and token counts. The
pending bridge is projected from `pendingTurn` directly, so a view-time render
does not receive the full raw active workspace message transcript as a
competing read model. Raw `ROWS`/display-row stream events remain Electron IPC
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
temporary fork conversation refs required by the current SDK fork command
contract. `ChatInterface` calls the SDK command facade with those prepared
inputs instead of constructing revision command payloads inline.

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
Feature components should pass the SDK view and the local pending bridge state
to that app-runtime helper instead of rebuilding display-row merge rules.

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
