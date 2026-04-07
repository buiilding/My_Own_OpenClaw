---
summary: "Frontend renderer infrastructure docs hub for tool execution orchestration, audio playback queue runtime, capture/artifact upload behavior, backend payload normalization boundaries, and incoming text sanitization contracts."
read_when:
  - When changing `frontend/src/renderer/infrastructure/services/*` tool execution pipeline behavior.
  - When changing `frontend/src/renderer/infrastructure/audio/*` playback queue or cleanup behavior.
  - When debugging stale-turn tool cancellation, screenshot capture/upload drift, or malformed `tool-result`/`tool-bundle-result` payloads.
title: "Frontend Renderer Infrastructure Docs Hub"
---

# Frontend Renderer Infrastructure Docs Hub

## Deep Pages

- [Audio Docs Hub](audio/README.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](audio/player_service_queue_generation_and_error_recovery_reference.md)
- [Tool Execution Service and Hook Runtime Reference](tool_execution_service_and_hook_runtime_reference.md)
- [Tool Execution Backend Envelope Builder and Payload-Gating Reference](tool_execution_backend_envelope_builder_and_payload_gating_reference.md)
- [Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference](tool_computer_use_catalog_surface_mode_and_capture_policy_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)
- [Incoming Text Normalization Contract Reference](incoming_text_normalization_mojibake_and_lone_surrogate_contract_reference.md)
- [Conversation Transcript Loader and Display-Bounds Storage Reference](conversation_transcript_loader_and_display_bounds_storage_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerMessages.ts`
- `frontend/src/renderer/utils/displaySelection.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionBundleRunner.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionBackendPayload.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionInvoker.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/mode.ts`
- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
- `tests/frontend/ToolExecutionService.test.ts`
- `tests/frontend/ToolExecutionBundleRunner.test.ts`
- `tests/frontend/ToolExecutionInvoker.test.ts`
- `tests/frontend/ToolExecutionCapture.test.ts`
- `tests/frontend/ToolExecutionBackendPayload.test.ts`
- `tests/frontend/ToolExecutionPayloads.test.ts`
- `tests/frontend/ToolComputerUseCatalog.test.ts`
- `tests/frontend/ToolRunnerHook.events.test.ts`
- `tests/frontend/ToolRunnerSurface.test.ts`
- `tests/frontend/ToolRunnerHook.callbacks.test.ts`
- `tests/frontend/ScreenshotAttachmentPipeline.test.ts`
- `tests/frontend/SystemStateCapture.test.ts`
- `tests/frontend/PlayerService.test.ts`
