---
summary: "Deep reference for chat-stream SDK conversation-event ingress orchestration: projection/turn-map/transcript-sync ordering, best-effort failure isolation, and dispatch-continuation guarantees."
read_when:
  - When changing `desktopChatStreamIngressRuntime` behavior or `useChatStream` listener ingress ordering.
  - When debugging dropped stream side effects after projection/turn-map/transcript sync exceptions.
title: "Conversation Event Ingress Fail-Safe and Dispatch Order Reference"
---

# Conversation Event Ingress Fail-Safe and Dispatch Order Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`

## Ingress Ownership Boundary

`DesktopChatStreamIngressRuntime.handleConversationEventIngress(...)` owns renderer pre-dispatch orchestration
for SDK `ConversationEvent` payloads received on `windie:conversation-event`:

- non-empty conversation identity validation
- active conversation projection sync
- `turnRef -> conversationRef` registration
- transcript session sync
- final SDK conversation-event dispatch

Backend-wire event validation and SDK conversation-event normalization happen
upstream before renderer chat hooks receive the event. This helper must not
import backend-wire event contracts or repeat backend normalization rules.

It does not:

- resolve event type handlers
- enforce stale-turn gating
- mutate chat rows directly

Those responsibilities stay in `useChatStream` handler wrappers and per-event handler modules.

## Dispatch Order Contract

Input:

- SDK `ConversationEvent`
- `HandleConversationEventIngressDeps` callbacks

Execution order:

1. reject null/non-object events and events without `conversationRef`
2. apply active conversation projection from the SDK event (best-effort)
3. `registerTurnConversationRef(turnRef, conversationRef)` when both
   runtime-resolved values exist (best-effort)
4. transcript session sync when `enableTranscript=true`:
  - `conversationRef` must be resolved before ingress dispatch
  - `updateTranscriptSession(...)` receives the active transcript conversation
    preference plus the runtime-resolved event user id (best-effort)
5. `dispatchConversationEvent(event, conversationRef)` (required)

## Fail-Safe Isolation Rules

Each pre-dispatch step is wrapped in local `try/catch` with intentional swallow behavior:

- projection-sync exceptions do not block later steps
- turn-map registration exceptions do not block transcript sync or dispatch
- transcript sync exceptions do not block dispatch

`dispatchConversationEvent(event, conversationRef)` is always attempted after a
valid conversation identity resolves and is not wrapped by ingress helper
catches.

Result: side-channel failures (projection/registration/transcript bookkeeping)
cannot suppress the primary conversation event.

## Transcript Session Contract

When transcript sync is enabled:

- ingress requires a resolved `conversationRef`
- transcript sync receives the resolved `conversationRef` and SDK `userId`
  payload value through `DesktopChatStreamEventPayloadRuntime`

When transcript sync is disabled:

- `updateTranscriptSession(...)` is not called

## `useChatStream` Integration Point

Listener flow:

1. receive SDK-normalized `windie:conversation-event`
2. call `DesktopChatStreamIngressRuntime.handleConversationEventIngress(...)`
   with store and handler callbacks
3. app runtime validates conversation identity and runs ingress bookkeeping
4. ingress dispatches the SDK-normalized conversation event for the
   resolved conversation/turn

This keeps listener-level pre-dispatch behavior deterministic while keeping
backend-wire event contracts out of chat hook modules.
Conversation selection and transcript user-binding helper rules are routed
through `DesktopConversationSessionRuntimeClient`, so ingress orchestration
does not import chat session internals directly.
Conversation and turn identity are resolved through
`DesktopChatStreamEventRuntime`; transcript user binding is resolved through
`DesktopChatStreamEventPayloadRuntime`, so ingress orchestration does not read
raw `event.conversationRef`, `event.turnRef`, or `event.payload` fields
directly.

## Test-Backed Invariants

`tests/frontend/DesktopChatStreamIngressRuntime.test.ts` verifies:

- normal path ordering: projection sync -> turn map -> transcript update -> dispatch
- missing conversation identity is rejected before projection, transcript sync, or dispatch
- turn-map registration skipped when runtime-resolved turn or conversation ref
  is missing
- projection-sync throw still dispatches event
- turn-map throw still updates transcript and dispatches
- transcript disabled skips transcript updates
- transcript update throw still dispatches event
- SDK conversation events are dispatched only after non-empty conversation
  identity resolves

## Drift Hotspots

1. Removing fail-safe catches can allow transcript/projection errors to black-hole stream events.
2. Reordering ingress steps can break turn-map availability for downstream events with missing `conversation_ref`.
3. Dropping active transcript conversation precedence can desync transcript session routing during background conversation event ingress.
4. Reintroducing backend event imports in chat hooks splits backend-wire event ownership between feature code and SDK/main local-runtime dispatch plus SDK projection.
5. Reintroducing direct `desktopConversationSessionRuntime` imports in ingress or
   transcript clients bypasses the app-runtime facade that owns shared session
   helper routing.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
