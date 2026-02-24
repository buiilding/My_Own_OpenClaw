---
summary: "Frontend renderer infrastructure docs hub for tool execution orchestration, audio playback queue runtime, capture/artifact upload behavior, and backend payload normalization boundaries."
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
- [Capture, Artifact Upload, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerMessages.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionBundleRunner.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionInvoker.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
- `frontend/src/renderer/infrastructure/services/SystemCapture.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`
- `tests/frontend/ToolExecutionService.test.ts`
- `tests/frontend/ToolExecutionBundleRunner.test.ts`
- `tests/frontend/ToolExecutionCapture.test.ts`
- `tests/frontend/ToolExecutionPayloads.test.ts`
- `tests/frontend/ToolRunnerHook.events.test.ts`
- `tests/frontend/ToolRunnerHook.callbacks.test.ts`
- `tests/frontend/PlayerService.test.ts`
