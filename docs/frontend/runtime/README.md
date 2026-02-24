---
summary: "Frontend runtime docs sub-hub for stream state machine, tool streaming lifecycle, and settings/config synchronization behavior."
read_when:
  - When changing runtime event flow in renderer/main integration.
  - When debugging streaming state transitions, tool output sequencing, or settings sync timing.
title: "Frontend Runtime Docs Hub"
---

# Frontend Runtime Docs Hub

## Deep Pages

- [Tool Execution and Streaming](tool_execution_and_streaming.md)
- [Stream Event State Machine](stream_event_state_machine.md)
- [Config Sync and Settings Lifecycle Reference](config_sync_and_settings_lifecycle_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](audio_chunk_playback_and_stop_semantics_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/*`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`
