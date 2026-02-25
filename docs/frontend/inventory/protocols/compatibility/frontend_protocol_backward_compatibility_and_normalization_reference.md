---
summary: "Deep frontend compatibility reference for backend endpoint fallback rules, local-backend RPC payload normalization (camelCase/snake_case), legacy transcript storage field support, and tolerant chat stream event handling."
read_when:
  - When changing frontend-to-backend endpoint configuration env handling or local-backend bridge parameter mappers.
  - When changing transcript session storage format or renderer backend-event compatibility behavior.
title: "Frontend Protocol Backward Compatibility and Normalization Reference"
---

# Frontend Protocol Backward Compatibility and Normalization Reference

## Scope and Sources

Primary runtime sources:

- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`

Primary test sources:

- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/TranscriptStorage.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Compatibility Contract Matrix

| Compatibility Surface | Runtime Owner | Guarantee | Key Tests |
|---|---|---|---|
| endpoint env fallback and derivation | `backend_endpoints.cjs` | supports explicit `BACKEND_WS_URL`/`BACKEND_HTTP_URL` or host/port fallback, deriving missing counterpart URL | `IpcMainBridge.lifecycle.test.cjs` endpoint tests |
| mixed payload key support for IPC RPC mapping | `local_backend_bridge_rpc_mappers.cjs` | accepts camelCase and snake_case variants where needed; tolerates non-object payloads | `LocalBackendBridge.rpc.test.cjs` |
| legacy transcript storage field fallback | `sessionInfoStorage.ts` | reads old `sessionId` as conversation identity when `conversationRef` absent | `TranscriptStorage.test.ts` |
| tolerant stream event interpretation | `useChatStream.ts` + gate utils | accepts alternative thought payload field shape and allows events with missing conversation refs for compatibility | `ChatStreamThinkingStatus.state/transcript` + `ChatStreamConversationGate` tests |

## Endpoint Compatibility Rules (`backend_endpoints.cjs`)

Resolution order:

1. explicit URL envs:
   - `BACKEND_HTTP_URL`
   - `BACKEND_WS_URL`
2. host/port fallback:
   - `BACKEND_HOST` + `BACKEND_PORT`
   - defaults `127.0.0.1:8765`

Derivation behavior:

- explicit HTTP only -> derive WS (`/ws`, protocol swap http->ws, https->wss)
- explicit WS only -> derive HTTP (strip `/ws` when present, protocol swap ws->http/wss->https)

Normalization behavior:

- invalid protocols rejected
- trailing slashes normalized
- query/hash stripped for stable base endpoints

Covered by `tests/frontend/IpcMainBridge.lifecycle.test.cjs`.

## RPC Payload Key Compatibility (`local_backend_bridge_rpc_mappers.cjs`)

Mapper compiler supports three mapping modes:

- direct key map
- function map
- fallback key list

Key compatibility case:

- `search-memory` maps `exclude_conversation_id` from either:
  - `excludeConversationId`
  - `exclude_conversation_id`

Defensive behavior:

- non-object payloads normalized to `{}` via `getPayloadObject(...)`
- mappers still execute without throw

Covered by `tests/frontend/LocalBackendBridge.rpc.test.cjs`:

- snake_case + camelCase acceptance
- safe behavior for invalid non-object payloads

## Transcript Session Storage Backward Compatibility

`readSessionInfoFromStorage()` accepts both:

- current field: `conversationRef`
- legacy field: `sessionId` (fallback when `conversationRef` missing)

Invalid JSON or invalid types degrade to null fields.

This allows migration from older storage schema without dropping user transcript continuity.

Covered by `tests/frontend/TranscriptStorage.test.ts`.

## Stream/Event Compatibility in Renderer

### Thought payload field tolerance

`useChatStream` thought handler accepts:

- `payload.status` (preferred)
- `payload.content` fallback

So alternate upstream event formats still update thinking status.

Covered by `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`.

### Conversation ref omission tolerance

`shouldIgnoreEventForActiveConversation(...)` logic:

- mismatch events are ignored only during active non-terminal turns
- events with no conversation ref are not ignored (compatibility path)
- local-user-message mismatch events are never ignored

Covered by:

- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

This preserves older backend payloads that omitted conversation correlation fields.

## Drift Checks

When changing compatibility behavior, keep aligned:

- endpoint derivation rules and `get-client-user-id` metadata expectations
- RPC mapper fallback keys for mixed casing contracts
- transcript storage legacy field fallback (`sessionId` -> `conversationRef`)
- renderer conversation gate behavior for missing conversation refs

## Related Pages

- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)
