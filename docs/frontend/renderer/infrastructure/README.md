---
summary: "Frontend renderer infrastructure docs hub for audio playback queue runtime, `RuntimeEndpointStore` capture/artifact URL behavior, SDK-backed transcript access, removed localConversationStore/displaySelection routing, incoming text normalization contracts, and chat markdown rendering owner routing."
read_when:
  - When changing `frontend/src/renderer/infrastructure/services/*` renderer-side services.
  - When changing `frontend/src/renderer/infrastructure/audio/*` playback queue or cleanup behavior.
  - When debugging screenshot capture/artifact URL drift, `RuntimeEndpointStore` routing, display projection drift, malformed renderer-side service payloads, or chat markdown rendering owner routing.
  - When searching for removed renderer infrastructure modules such as `localConversationStore.ts`, `displaySelection.ts`, or `ToolExecutionInvoker.ts`.
title: "Frontend Renderer Infrastructure Docs Hub"
---

# Frontend Renderer Infrastructure Docs Hub

## Deep Pages

- [Audio Docs Hub](audio/README.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](audio/player_service_queue_generation_and_error_recovery_reference.md)
- [Capture, Artifact URL, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)
- [Incoming Text Normalization Contract Reference](incoming_text_normalization_mojibake_and_lone_surrogate_contract_reference.md)
- [Conversation Transcript Loader and Display-Bounds Storage Reference](conversation_transcript_loader_and_display_bounds_storage_reference.md)
- [Tool Call/Output and Transparency Section Rendering Reference](../chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md) for renderer markdown parse/sanitize, math rendering, and thread-find highlight behavior.

## Code Scope

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/infrastructure/services/RuntimeEndpointStore.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/main/sidecar/local_runtime_display_bounds.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `tests/frontend/PlayerService.test.ts`
