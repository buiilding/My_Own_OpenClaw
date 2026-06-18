---
summary: "Frontend protocol state sub-hub for main-process websocket bridge state, conversation-ref fallback handling, SDK transcript-session synchronization, and renderer config to local-runtime RPC argument propagation."
read_when:
  - When changing `frontend/src/main/ipc.cjs` state fields that track connection/session/user/conversation identity.
  - When changing renderer-side event gating or SDK transcript session update behavior driven by backend context fields.
title: "Frontend Protocol State Hub"
---

# Frontend Protocol State Hub

## Deep Pages

- [Frontend Protocol Session and Conversation-State Propagation Reference](frontend_protocol_session_and_conversation_state_propagation_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Observability Hub](../observability/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`
- `tests/frontend/TranscriptSessionState.test.ts`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`
- `tests/frontend/IpcTranscriptSessionSync.test.cjs`
- `tests/frontend/DashboardShell.test.jsx`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
