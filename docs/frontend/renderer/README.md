---
summary: "Frontend renderer docs sub-hub for provider ownership, feature modules, stream lifecycle, and chat/tool runtime behavior."
read_when:
  - When changing renderer state providers, chat hooks, or event-to-message rendering logic.
  - When debugging stream tracking, transcript writes, or stale-turn tool output handling.
title: "Frontend Renderer Docs Hub"
---

# Frontend Renderer Docs Hub

## Deep Pages

- [Renderer Runtime](renderer_runtime.md)
- [Renderer Infrastructure Docs Hub](infrastructure/README.md)
- [Feature Module Matrix](feature_module_matrix.md)
- [Dashboard Memory Management and Resume Reference](dashboard_memory_management_and_resume_reference.md)
- [Chat Stream and Tool Execution Reference](chat_stream_and_tool_execution_reference.md)
- [Transcript Session and Rehydrate Reference](transcript_session_and_rehydrate_reference.md)
- [Voice Capture and Wakeword Controller Reference](voice_capture_and_wakeword_controller_reference.md)
- [Tool Execution Service and Hook Runtime Reference](infrastructure/tool_execution_service_and_hook_runtime_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)

## Code Scope

- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/features/*`
- `frontend/src/renderer/infrastructure/*`
