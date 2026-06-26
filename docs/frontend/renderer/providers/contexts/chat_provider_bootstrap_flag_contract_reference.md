---
summary: "Deep reference for ChatProvider bootstrap ownership, enable flag semantics across surfaces, and the deleted empty ChatContext compatibility wrapper."
read_when:
  - When changing `ChatProvider` hook invocation order or enable flag wiring.
  - When updating overlay/main provider stacks that rely on ChatProvider stream and session setup.
title: "Chat Provider Bootstrap Flag Contract Reference"
---

# Chat Provider Bootstrap Flag Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/ChatProvider.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- `docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md`
- `tests/frontend/ChatProvider.test.jsx`

## Deleted Empty Context Wrapper

`ChatProvider` no longer wraps children in an empty `ChatContext.Provider`.
The old `ChatContext.jsx` and `EMPTY_CHAT_CONTEXT` exports had no consumers
and acted only as a boundary marker. Keeping that marker would preserve a
passive compatibility layer where future chat state could drift away from the
chat store, session projection, and visible lifecycle runtimes.

`ChatProvider` now returns `children` directly after mounting its setup hooks.
Do not reintroduce an empty context wrapper or passive chat-provider context.
Chat state should stay in the chat store and renderer app-runtime projections.

## ChatProvider Bootstrap Contract

`ChatProvider({ enableTranscript = true })`:

1. bootstraps transcript/session metadata
2. projects transcript-session `conversationRef` into chat-store `activeConversationRef` (`DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo`) only when conversation ref is non-empty
3. mounts `useConversationRuntimeProjectionStream()`
4. calls `useChatStream(enableTranscript)`
5. returns `children` directly

Ownership model:

- side effects live inside hooks (event listeners and transcript wiring)
- provider is the single owner of transcript->chat-store active-conversation projection; leaf UIs should not duplicate this sync
- null/empty transcript snapshots are ignored so transient startup/session sync races do not clobber active chat workspace identity
- live-surface trace workspace snapshots carry identity/message evidence, not raw lifecycle latches such as `isSending`, `thinkingStatus`, or `streamTracking.phase`
- trace workspace snapshots run through
  `DesktopChatWorkspaceStateRuntime.projectWorkspaceReadModelState(...)` before
  deriving counts or last-message identity, so trace code does not reopen the
  raw workspace as a competing chat read model
- when a workspace has `ConversationView`, live-surface trace snapshots use the
  view live-turn/display-row identity before falling back to raw stream
  tracking and workspace messages

## Surface Flag Semantics

Entrypoint wrappers use different flags:

- main app: `enableTranscript=true`
- overlay surfaces: `enableTranscript=false`

Contract outcome:

- overlays still participate in shared chat state display
- renderer surfaces do not mount local tool execution; Agent SDK runtime owns local tool execution and sends display-only tool events to renderer
- overlays avoid transcript write side effects

## Ordering Assumption

Current provider invokes `useChatStream` after transcript-session bootstrap,
active-conversation projection setup, and runtime projection stream setup. Tool
execution is not a renderer provider concern.

## Coverage Notes

- direct `ChatProvider` coverage exists in `tests/frontend/ChatProvider.test.jsx` for flag wiring and transcript-session conversation sync
- boundary coverage rejects `ChatContext.jsx`, `EMPTY_CHAT_CONTEXT`, and raw lifecycle fields in provider trace snapshots

## Drift Hotspots

1. Reintroducing an empty `ChatContext` can become a second passive chat state surface.
2. Enabling execution/transcript side-effect flags in overlays can duplicate execution or transcript writes.
3. Adding raw lifecycle latches to provider trace snapshots can make debug payloads look like lifecycle authorities again.

## Related Pages

- [Renderer Provider Contexts Docs Hub](README.md)
- [Entrypoint View Routing and Provider Stack Reference](../entrypoint_view_routing_and_provider_stack_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
