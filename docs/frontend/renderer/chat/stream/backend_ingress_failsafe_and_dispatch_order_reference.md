---
summary: "Deep reference for chat-stream backend ingress orchestration: projection/turn-map/transcript-sync ordering, best-effort failure isolation, and dispatch-continuation guarantees."
read_when:
  - When changing `chatStreamBackendIngress` behavior or `useChatStream` listener ingress ordering.
  - When debugging dropped stream side effects after projection/turn-map/transcript sync exceptions.
title: "Backend Ingress Fail-Safe and Dispatch Order Reference"
---

# Backend Ingress Fail-Safe and Dispatch Order Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamBackendIngress.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatStreamBackendIngress.test.ts`

## Ingress Ownership Boundary

`ingestBackendEvent(...)` centralizes pre-dispatch orchestration for each validated backend event:

- active conversation projection sync
- turn-to-conversation registration
- transcript session sync
- final event handler dispatch

It does not:

- resolve event type handlers
- enforce stale-turn gating
- mutate chat rows directly

Those responsibilities stay in `useChatStream` handler wrappers and per-event handler modules.

## Dispatch Order Contract

Input:

- `event`
- resolved `conversationRef`
- `IngressDeps` callbacks

Execution order:

1. `syncActiveConversationProjection(event, conversationRef)` (best-effort)
2. `registerTurnConversationRef(event.turn_ref, conversationRef)` when both values exist (best-effort)
3. transcript session sync when `enableTranscript=true`:
  - `activeConversationRef = getActiveConversationRef()`
  - `updateTranscriptSession(activeConversationRef || conversationRef || undefined, event.user_id)` (best-effort)
4. `dispatchEvent(event)` (required)

## Fail-Safe Isolation Rules

Each pre-dispatch step is wrapped in local `try/catch` with intentional swallow behavior:

- projection-sync exceptions do not block later steps
- turn-map registration exceptions do not block transcript sync or dispatch
- transcript sync exceptions do not block dispatch

`dispatchEvent(event)` is always attempted and is not wrapped by ingress helper catches.

Result: side-channel failures (projection/registration/transcript bookkeeping) cannot suppress the primary stream event.

## Transcript Session Fallback Contract

When transcript sync is enabled:

- prefers current transcript active conversation from `TranscriptWriter`
- falls back to ingress `conversationRef` when active transcript conversation is not set
- allows `undefined` conversation ref when neither is available (still passes user id)

When transcript sync is disabled:

- `updateTranscriptSession(...)` is not called

## `useChatStream` Integration Point

Listener flow:

1. validate envelope with `isBackendEvent(...)`
2. compute `conversationRef` via runtime conversation gate
3. call `ingestBackendEvent(...)`
4. ingress callback dispatch selects handler from `buildChatStreamHandlerMap(...)`

This keeps listener-level pre-dispatch behavior deterministic and shared across all backend event types.

## Test-Backed Invariants

`tests/frontend/ChatStreamBackendIngress.test.ts` verifies:

- normal path ordering: projection sync -> turn map -> transcript update -> dispatch
- active transcript conversation precedence over ingress fallback conversation
- turn-map registration skipped when turn or conversation ref is missing
- projection-sync throw still dispatches event
- turn-map throw still updates transcript and dispatches
- transcript disabled skips transcript updates
- transcript update throw still dispatches event

## Drift Hotspots

1. Removing fail-safe catches can allow transcript/projection errors to black-hole stream events.
2. Reordering ingress steps can break turn-map availability for downstream events with missing `conversation_ref`.
3. Dropping active transcript conversation precedence can desync transcript session routing during background conversation event ingress.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
