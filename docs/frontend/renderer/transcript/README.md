---
summary: "Frontend renderer transcript docs sub-hub for SDK-backed desktop conversation storage, display projection, session identity state updates, and session-event contracts."
read_when:
  - When changing `frontend/src/renderer/infrastructure/transcript/*` modules or SDK display/rehydrate behavior.
  - When debugging visible transcript projection, session identity drift, or `transcript-session-update` event delivery.
title: "Frontend Renderer Transcript Docs Hub"
---

# Frontend Renderer Transcript Docs Hub

## Deep Pages

- [Screenshot Message State and SDK Projection Reference](screenshot_message_state_and_sdk_projection_reference.md)
- [Transcript Replay Change Workflow](../../../memory/transcript_replay_change_workflow.md)
- [Transcript Contracts Docs Hub](contracts/README.md)
- [Transcript Type Contract Reference](contracts/transcript_entry_type_contract_reference.md)

## Code Scope

- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/types.ts`
- `tests/frontend/DesktopConversationContinuityService.test.ts`
- `tests/frontend/DesktopConversationStore.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/RendererAppRuntimeBoundary.test.ts`
- `tests/frontend/TranscriptSessionState.test.ts`
- `tests/frontend/TranscriptStorage.test.ts`
