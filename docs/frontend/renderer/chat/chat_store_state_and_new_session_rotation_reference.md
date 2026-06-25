---
summary: "Deep reference for chat store and session-rotation behavior: per-conversation workspace state, active-workspace projection, stream-tracking reset rules, new-chat lifecycle, and conversation-ref synchronization paths."
read_when:
  - When changing `chatStore`, `startNewChatSession`, or conversation-resume/new-chat state transitions.
  - When debugging stale stream phases, unexpected `isSending` state, pending-turn stop behavior, or conversation-ref mismatch after new/continued sessions.
title: "Chat Store State and New Session Rotation Reference"
---

# Chat Store State and New Session Rotation Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatInterfacePresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatRevisionActionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationViewWorkspaceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopPendingTurnBridgeRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime.ts`
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

Primary projected state slices (active workspace projection):

- `messages`
- `isSending`
- `thinkingStatus`
- `tokenCounts`
- `streamTracking`
- `currentTurnProjection`
- `pendingTurn`

Conversation workspace state:

- `activeConversationRef`
- `workspaces: Record<workspaceRef, ChatWorkspaceState>`
- `turnConversationRefs: Record<turnRef, conversationRef>`
- `latestConversationView`

The default workspace key is private to `chatWorkspaceState.ts`. Store
initialization uses `createInitialWorkspaceRecord()` so `chatStore.ts` and
feature callers do not import the raw sentinel string.

All mutating actions accept optional `conversationRef` and write into that workspace. The projected top-level fields above always mirror the currently active workspace so existing selectors/components stay stable.

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

- `addMessage` appends immutably
- `updateMessage` updates by id; returns original state when id missing
- `setMessages` no-op when array reference unchanged; when hydrating a concrete
  conversation workspace, it indexes message `turnRef` values into
  `turnConversationRefs` so later turn-scoped stream events can route even when
  `conversation_ref` is absent. Turn-ref normalization and map merge rules live
  in `desktopChatTurnConversationRefRuntime.ts`; the store only binds the
  resulting map update.
- `setIsSending`, `setThinkingStatus`, `setTokenCounts` no-op when value/reference unchanged
- `updateStreamTracking` always applies updater output
- `setCurrentTurnProjection` updates the target workspace and clears a matching
  `pendingTurn` only after the SDK current-turn projection for that
  conversation/turn arrives. The current-turn workspace mutation and
  pending-turn replacement no-op guard live in
  `desktopCurrentTurnWorkspaceRuntime.ts`; the store only applies the returned
  workspace.
- `setConversationView` updates the target workspace and refreshes
  `latestConversationView` only when the target is the active workspace. The
  conversation-view workspace/latest-view state update lives in
  `desktopConversationViewWorkspaceRuntime.ts`; the store delegates
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
  store-level accept-pending, replay-pending, clear, and broadcast update
  decisions also live in `desktopChatPendingTurnStateRuntime.ts`; `chatStore.ts`
  only supplies workspace read/write dependencies and applies the returned
  update.
- `acceptReplayPendingTurn` stores the retained replay prefix and
  renderer-local pending turn in one workspace mutation before awaiting the SDK
  retry/edit command, so edit/resend never publishes a prefix-only frame before
  the edited user row appears. Replay pending rows use the SDK replacement
  display-row id and leave display-row `attachments[]` to the later
  `sdk:display-rows` projection, so visual preservation stays on the SDK
  target-row path. Replay and normal sends use
  `DesktopPendingTurnBridgeRuntime` for pending-turn bridge payload
  construction, then the same app-runtime pending workspace mutation helper for
  store application.
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
  `streamTracking` to initial idle shape
- `setActiveConversationRef` switches the projected top-level state to that
  workspace snapshot through
  `chatWorkspaceState.buildActiveConversationWorkspaceUpdate(...)`.
- active-workspace projected field mirroring, generic workspace update assembly,
  and workspace mutation target resolution live in `chatWorkspaceState.ts`;
  `chatStore.ts` calls those helpers instead of defining the boilerplate.
- `registerTurnConversationRef` / `resolveConversationRefForTurn` bind
  app-runtime turn->conversation routing helpers for events that omit
  `conversation_ref`.
- response-overlay dismissal state is persisted by the store, but normalized
  conversation/turn/entry dismissal-key construction lives in
  `DesktopResponseOverlayViewRuntime.buildResponseOverlayDismissalKey(...)`.

No-op guards reduce unnecessary re-renders on high-frequency stream paths.

## Selector Boundary

`DesktopChatSurfaceSelectorRuntime` owns the pure projection rules for the full
chat interface and live minimal surfaces. `chatStore.ts` binds those projection
methods to `selectActiveWorkspaceState(...)` so the app-runtime helper does not
import chat feature store internals.

`selectChatInterfaceState` exposes active-workspace projection:

- `messages`, `thinkingStatus`, `tokenCounts`
- `streamTracking` for diagnostics and focused runtime tests

Minimal chat pill and response overlay state now route through the live-turn
presentation/view-model helpers instead of a separate chat-box selector. The
dashboard selector remains scoped to fields rendered by the full interface, so
raw `isSending` stays store/diagnostic state rather than dashboard surface
authority.

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
and passes only renderer annotation records selected from `chatStore.messages`
for feedback, transparency metadata, and token counts. The pending bridge is
projected from `pendingTurn` directly, so a view-time render does not receive
the full raw `chatStore.messages` transcript as a competing read model.
The component consumes that view model and does not choose between raw
messages, current-turn rows, and `ConversationView` action metadata inline.
When checkout/fork commands return a `ConversationView`, `ChatInterface` stores
only that SDK view for the target conversation; it does not project
`displayRows` back into `chatStore.messages`.
Replay actions follow the same read-model rule: the hook passes the active
`ConversationView` and explicit `replayFallbackMessages` to
`DesktopConversationReplayRuntime`, which derives edit and retry targets from
`ConversationView.displayRows`. `ChatInterface` empties the fallback while a
`ConversationView` exists, so `chatStore.messages` remains only the no-view
fallback bridge.

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
   `displayRows` into `chatStore.messages`
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
