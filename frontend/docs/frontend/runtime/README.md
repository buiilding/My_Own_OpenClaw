---
summary: "Frontend runtime docs sub-hub for stream state machine, tool streaming lifecycle, and settings/config synchronization behavior."
read_when:
  - When changing runtime event flow in renderer/main integration.
  - When debugging streaming state transitions, tool output sequencing, or settings sync timing.
title: "Frontend Runtime Docs Hub"
---

# Frontend Runtime Docs Hub

## Deep Pages

- [Frontend Runtime Invariants and PR Checklist](frontend_runtime_invariants_checklist.md)
- [Renderer State Change Workflow](../renderer/renderer_state_change_workflow.md)
- [Query Send and Stream Relay Change Workflow](../main/query_send_and_stream_relay_change_workflow.md)
- [Overlay Phase and Surface Change Workflow](overlay_phase_and_surface_change_workflow.md)
- [Workspace Context Change Workflow](workspace_context_change_workflow.md)
- [Tool Execution and Streaming](tool_execution_and_streaming.md)
- [Stream Event State Machine](stream_event_state_machine.md)
- [Historical Surface Orchestration Refactor Design Package (2026-02-28)](surface_orchestration_refactor_design_package_2026-02-28.md)
- [Settings Sync Change Workflow](settings_sync_change_workflow.md)
- [Config Sync and Settings Lifecycle Reference](config_sync_and_settings_lifecycle_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](audio_chunk_playback_and_stop_semantics_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/*`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_state.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/shortcuts/agent_stop_shortcut_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`
- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/core/feature_pack_installer.py`

## Evidence Notes

- Runtime bugs should include the command surface, transport event, and local
  state transition that prove where ownership changed.
- When a desktop control appears to work in backend logs but not visually, check
  renderer terminalization against the active SDK projection.
