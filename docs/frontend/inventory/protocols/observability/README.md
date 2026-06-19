---
summary: "Frontend protocol observability sub-hub for websocket bridge status/phase broadcasts, settings-ACK diagnostics, renderer stream-tracking metrics, and token-count signal consumption contracts."
read_when:
  - When changing `ipc-status` or `response-overlay-phase` broadcast behavior in Electron main.
  - When changing renderer stream-tracking counters/timestamps, settings-ACK timeout diagnostics, or token-count event handling.
title: "Frontend Protocol Observability Hub"
---

# Frontend Protocol Observability Hub

## Deep Pages

- [Frontend Protocol Status, Phase, and Stream-Telemetry Signal Reference](frontend_protocol_status_phase_and_stream_telemetry_signal_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/DesktopChatStreamTrackingRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
