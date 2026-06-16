---
summary: "Frontend renderer infrastructure docs hub for audio playback queue runtime, `BackendEndpointStore` capture/artifact URL behavior, display projection boundaries, incoming text normalization contracts, and chat markdown rendering owner routing."
read_when:
  - When changing `frontend/src/renderer/infrastructure/services/*` renderer-side services.
  - When changing `frontend/src/renderer/infrastructure/audio/*` playback queue or cleanup behavior.
  - When debugging screenshot capture/artifact URL drift, `BackendEndpointStore` routing, display projection drift, malformed renderer-side service payloads, or chat markdown rendering owner routing.
title: "Frontend Renderer Infrastructure Docs Hub"
---

# Frontend Renderer Infrastructure Docs Hub

## Deep Pages

- [Audio Docs Hub](audio/README.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](audio/player_service_queue_generation_and_error_recovery_reference.md)
- [Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference](tool_computer_use_catalog_surface_mode_and_capture_policy_reference.md)
- [Capture, Artifact URL, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)
- [Incoming Text Normalization Contract Reference](incoming_text_normalization_mojibake_and_lone_surrogate_contract_reference.md)
- [Conversation Transcript Loader and Display-Bounds Storage Reference](conversation_transcript_loader_and_display_bounds_storage_reference.md)
- [Tool Call/Output and Transparency Section Rendering Reference](../chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md) for renderer markdown parse/sanitize, math rendering, and thread-find highlight behavior.

## Code Scope

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/utils/displaySelection.ts`
- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
- `frontend/src/renderer/infrastructure/services/BackendEndpointStore.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/mode.ts`
- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
- `tests/frontend/ToolComputerUseCatalog.test.ts`
- `tests/frontend/SystemStateCapture.test.ts`
- `tests/frontend/PlayerService.test.ts`
