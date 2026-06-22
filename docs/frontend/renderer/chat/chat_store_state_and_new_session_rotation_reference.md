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
- `latestCurrentTurnProjection`

The default workspace key is private to `chatWorkspaceState.ts`. Store
initialization uses `createInitialWorkspaceRecord()` so `chatStore.ts` and
feature callers do not import the raw sentinel string.

All mutating actions accept optional `conversationRef` and write into that workspace. The projected top-level fields above always mirror the currently active workspace so existing selectors/components stay stable.

Message attachment fields used by current send/runtime paths include:

- `screenshot`
- `screenshotContentType`
- `screenshotRef`
- `screenshotUrl`

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
  `conversation_ref` is absent
- `setIsSending`, `setThinkingStatus`, `setTokenCounts` no-op when value/reference unchanged
- `updateStreamTracking` always applies updater output
- `setCurrentTurnProjection` updates the target workspace and clears a matching
  `pendingTurn` only after the SDK current-turn projection for that
  conversation/turn arrives
- `acceptPendingTurn` stores the renderer-local pending turn before the SDK
  current-turn projection opens, so dashboard/pill surfaces can show awaiting
  state and stop can target the real outgoing `turnRef`
- `clearPendingTurn` clears only a pending turn matching the provided
  `conversationRef`/`turnRef`; missing filters clear the active pending turn
- `acceptStoppedTurn` immediately clears local busy/thinking state, clears a
  matching pending turn, patches stream tracking to terminal `complete`, and
  terminalizes the matching SDK current-turn projection while preserving any
  already visible assistant content. Stopped projections strip SDK
  `typingVisible` and `overlayVisible` compatibility fields; visible lifecycle
  derives busy/typing state from terminal phase plus visible entries.
- `clearMessages` clears messages, clears raw send cleanup state, and resets
  `streamTracking` to initial idle shape
- `setActiveConversationRef` switches the projected top-level state to that workspace snapshot
- `registerTurnConversationRef` / `resolveConversationRefForTurn` maintain turn->conversation routing for events that omit `conversation_ref`

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
7. replace chat store messages with resumed transcript projection
8. clear sending/thinking flags
9. clear the opening marker, close dashboard overlays, and keep chat surface active

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
