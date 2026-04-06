---
summary: "Deep reference for chat store and session-rotation behavior: per-conversation workspace state, active-workspace projection, stream-tracking reset rules, new-chat lifecycle, and conversation-ref synchronization paths."
read_when:
  - When changing `chatStore`, `startNewChatSession`, or conversation-resume/new-chat state transitions.
  - When debugging stale stream phases, unexpected `isSending` state, or conversation-ref mismatch after new/continued sessions.
title: "Chat Store State and New Session Rotation Reference"
---

# Chat Store State and New Session Rotation Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/utils/session/newChatSession.ts`
- `frontend/src/renderer/features/chat/utils/session/conversationRef.ts`
- `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatStore.test.ts`

## Chat Store Contract

Primary projected state slices (active workspace projection):

- `messages`
- `isSending`
- `thinkingStatus`
- `tokenCounts`
- `streamTracking`

Conversation workspace state:

- `activeConversationRef`
- `workspaces: Record<workspaceRef, ChatWorkspaceState>`
- `turnConversationRefs: Record<turnRef, conversationRef>`

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
- `setMessages` no-op when array reference unchanged
- `setIsSending`, `setThinkingStatus`, `setTokenCounts` no-op when value/reference unchanged
- `updateStreamTracking` always applies updater output
- `clearMessages` clears messages and resets `streamTracking` to initial idle shape
- `setActiveConversationRef` switches the projected top-level state to that workspace snapshot
- `registerTurnConversationRef` / `resolveConversationRefForTurn` maintain turn->conversation routing for events that omit `conversation_ref`

No-op guards reduce unnecessary re-renders on high-frequency stream paths.

## Selector Boundary

`selectChatInterfaceState` exposes active-workspace projection:

- `messages`, `isSending`, `thinkingStatus`, `tokenCounts`
- derived `streamPhase` from `streamTracking.phase`

`selectChatBoxState` exposes only active-workspace overlay-needed fields:

- `messages`, `isSending`, `thinkingStatus`

This keeps overlay and full interface subscriptions scoped to their rendering needs.

## New Chat Session Lifecycle

`startNewChatSession(...)` order:

1. optional `stopActiveQuery()` callback
2. `clearMessages()`
3. set `isSending=false`
4. set `thinkingStatus=null`
5. set `tokenCounts=null`
6. create new `conversationRef` via `createConversationRef()`
7. snapshot the currently selected workspace into the conversation binding map
8. persist through `setActiveConversationRef(nextConversationRef)`
8. return new conversation ref

`createConversationRef()` format is deterministic prefix: `conv_${crypto.randomUUID()}`.

Workspace-binding invariant:

- one chat belongs to exactly one workspace binding
- multiple chats may share the same workspace binding
- changing the selected workspace creates a fresh chat instead of mutating the existing chat's binding
- opening an older chat restores its bound workspace back into the active Electron workspace selection before more sends/tool calls happen

## Main-Window Call-Site (`ChatInterface`)

`handleNewChat` passes `stopActiveQuery` only when stream phase is active. Stop callback does:

- `stopPlayback()`
- `ApiClient.stopQuery()`

So new-chat resets local store regardless, while active backend loop receives stop signal when applicable.

## Resume Conversation Call-Site (Dashboard)

`ChatGptDashboardShell.handleOpenConversation(...)` flow:

1. load transcript rows for the target conversation
2. recover the conversation's stored workspace binding from transcript/list metadata
3. push that binding back into Electron's active workspace selection
4. call `setActiveConversationRef(conversationRef)`
5. call `updateTranscriptSession(conversationRef, sessionInfo.userId || null)`
6. replace chat store messages with resumed transcript projection
7. clear sending/thinking flags
8. close dashboard overlays and keep chat surface active

This path intentionally does not call `startNewChatSession`; it restores an existing conversation ref.

During active loops, dashboard history switching is allowed. In-flight events continue writing to their originating workspace, while the shell renders whichever conversation is currently active.

## Transcript Session Synchronization

`TranscriptWriter` session state is the source for active transcript identity:

- `setActiveConversationRef(...)` updates cached session info and emits session update event when changed
- pending transcript queues flush only when both `conversationRef` and `userId` are available

Chat store reset and transcript-session ref updates are separate concerns; new-chat path updates both through `startNewChatSession` + transcript writer.

## Test-Backed Invariants

`tests/frontend/ChatStore.test.ts` verifies:

- append/update behavior
- missing-id update no-op
- same-reference no-op behavior for `setMessages` and scalar setters
- `clearMessages` leaves empty messages and reset state
- stream tracking updater semantics

`tests/frontend/ChatMessageSender.test.tsx` indirectly verifies conversation-ref reuse and generation behavior around send-path creation.

## Drift Hotspots

1. removing `clearMessages` stream-tracking reset causes stale phases across conversations.
2. changing no-op guards can increase render churn in streaming-heavy paths.
3. changing conversation ref format/prefix can break downstream expectations for `conv_` ids.
4. diverging dashboard resume ref updates from transcript session updates can desync UI and transcript writes.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
