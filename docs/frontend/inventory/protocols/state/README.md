---
summary: "Frontend protocol state sub-hub for main-process websocket bridge state, conversation-ref fallback handling, renderer transcript-session synchronization, and frontend-config to sidecar RPC argument propagation."
read_when:
  - When changing `frontend/src/main/ipc.cjs` state fields that track connection/session/user/conversation identity.
  - When changing renderer-side event gating or transcript session update behavior driven by backend context fields.
title: "Frontend Protocol State Hub"
---

# Frontend Protocol State Hub

## Deep Pages

- [Frontend Protocol Session and Conversation-State Propagation Reference](frontend_protocol_session_and_conversation_state_propagation_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Compatibility Hub](../compatibility/README.md)
- [Frontend Protocol Observability Hub](../observability/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`
- `tests/frontend/TranscriptWriter.session.test.ts`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
