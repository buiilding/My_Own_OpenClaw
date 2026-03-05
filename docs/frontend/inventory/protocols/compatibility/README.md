---
summary: "Frontend protocol compatibility sub-hub for endpoint/env fallbacks, IPC payload key normalization, legacy transcript session storage support, and tolerant renderer stream/conversation event handling."
read_when:
  - When changing main-process endpoint resolution or IPC-to-local-backend parameter mapping behavior.
  - When changing renderer transcript session persistence format, thought payload fallback handling, or conversation-gate compatibility guards.
title: "Frontend Protocol Compatibility Hub"
---

# Frontend Protocol Compatibility Hub

## Deep Pages

- [Frontend Protocol Backward Compatibility and Normalization Reference](frontend_protocol_backward_compatibility_and_normalization_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/TranscriptStorage.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`
