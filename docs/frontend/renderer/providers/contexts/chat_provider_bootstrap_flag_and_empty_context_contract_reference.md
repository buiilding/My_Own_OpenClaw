---
summary: "Deep reference for ChatProvider/ChatContext contracts: stream/tool hook bootstrap ownership, enable flag semantics across surfaces, and immutable empty context value identity."
read_when:
  - When changing `ChatProvider` hook invocation order or enable flag wiring.
  - When updating overlay/main provider stacks that rely on no-op context value identity semantics.
title: "Chat Provider Bootstrap Flag and Empty-Context Contract Reference"
---

# Chat Provider Bootstrap Flag and Empty-Context Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/ChatContext.jsx`
- `frontend/src/renderer/app/providers/ChatProvider.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/ChatBoxApp.jsx`
- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/app/ChatBoxContextLabelApp.jsx`
- `docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md`
- `tests/frontend/AppProvider.test.tsx`

## ChatContext Value Contract

`ChatContext` is created with default `undefined` and provider value is constant `EMPTY_CHAT_CONTEXT`.

`EMPTY_CHAT_CONTEXT`:

- `Object.freeze({})`
- stable identity across renders
- intentionally carries no data payload

Effect:

- context presence acts as boundary marker, not data transport layer.

## ChatProvider Bootstrap Contract

`ChatProvider({ enableToolRunner = true, enableTranscript = true })`:

1. calls `useChatStream(enableTranscript)`
2. calls `useToolRunner(enableToolRunner)`
3. projects transcript-session `conversationRef` into chat-store `activeConversationRef` (`useTranscriptSessionInfo`) only when conversation ref is non-empty
4. returns `ChatContext.Provider` with frozen empty object value

Ownership model:

- side effects live inside hooks (event listeners, transcript/tool execution wiring)
- provider is the single owner of transcript->chat-store active-conversation projection; leaf UIs should not duplicate this sync
- null/empty transcript snapshots are ignored so transient startup/session sync races do not clobber active chat workspace identity

## Surface Flag Semantics

Entrypoint wrappers use different flags:

- main app: `enableToolRunner=true`, `enableTranscript=true`
- overlay surfaces: `enableToolRunner=false`, `enableTranscript=false`

Contract outcome:

- overlays still participate in shared chat state display
- overlays avoid tool execution and transcript write side effects

## Ordering Assumption

Current provider invokes `useChatStream` before `useToolRunner`.

Even though both consume backend events, contract stability assumes this order remains explicit and intentional for readability/debugging consistency.

## Coverage Notes

- direct `ChatProvider` coverage now exists in `tests/frontend/ChatProvider.test.jsx` for flag wiring and transcript-session conversation sync.
- `ChatContext` value identity remains covered indirectly by app/provider and overlay integration behavior.

## Drift Hotspots

1. Replacing frozen empty context with mutable object can create avoidable rerenders on provider remounts.
2. Enabling tool runner/transcript flags in overlays can duplicate execution or transcript writes.
3. Adding state into `ChatContext` without strict ownership rules can split source of truth against chat store/hooks.

## Related Pages

- [Renderer Provider Contexts Docs Hub](README.md)
- [Entrypoint View Routing and Provider Stack Reference](../entrypoint_view_routing_and_provider_stack_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
