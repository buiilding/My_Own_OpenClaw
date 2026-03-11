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
- [Tool Execution and Streaming](tool_execution_and_streaming.md)
- [Stream Event State Machine](stream_event_state_machine.md)
- [Frontend Runtime Surface: Main, Renderer, Sidecar, and VM Worker](frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md)
- [Surface Orchestration Refactor Design Package (2026-02-28)](surface_orchestration_refactor_design_package_2026-02-28.md)
- [Config Sync and Settings Lifecycle Reference](config_sync_and_settings_lifecycle_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](audio_chunk_playback_and_stop_semantics_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/*`
- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_state.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/agent_stop_shortcut_runtime.cjs`
- `frontend/src/main/runtime_mode.cjs`
- `frontend/src/main/vm_worker_runtime.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/core/feature_pack_installer.py`
