---
summary: "Frontend domain ownership matrix mapping responsibilities to main, preload, renderer, local-runtime Python, and landing modules with integration boundaries."
read_when:
  - When assigning ownership for frontend architecture changes.
  - When splitting work across renderer/main/local-runtime boundaries.
title: "Frontend Domain Ownership Matrix Reference"
---

# Frontend Domain Ownership Matrix Reference

## Ownership Matrix

| Domain | Primary ownership modules | Secondary integration modules | Non-owners (avoid primary edits) |
| --- | --- | --- | --- |
| Electron window/runtime orchestration | `frontend/src/main/index.cjs`, `frontend/src/main/surfaces/main_window_runtime.cjs`, `main/main_process_lifecycle_runtime.cjs`, overlay handlers | `main/response_overlay_phase_handler.cjs`, `main/window_visibility_runtime.cjs` | renderer feature hooks |
| Main overlay/window IPC + visibility runtime | `main/{overlay_phase_ipc_runtime,window_controls_ipc_runtime,permission_ipc_runtime}.cjs`, `main/window_visibility_runtime.cjs` | overlay/window handler modules + permission/visibility delegates | renderer feature hooks |
| Main SDK runtime host + settings gate | `frontend/src/main/ipc.cjs`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `main/ipc_runtime_helpers.cjs`, `main/ipc_renderer_windows.cjs`, `main/ipc_query_broadcast.cjs` | `main/backend_endpoints.cjs`, `main/ipc_query_events.cjs`, `main/ipc_query_runtime.cjs` | local-runtime tool implementation modules |
| SDK local-runtime bridge | `frontend/src/main/sidecar/local_runtime*.cjs` | `main/runtime_paths.cjs`, mapper/util modules | renderer store logic |
| Preload boundary | `frontend/src/preload.js` | renderer IPC bridge wrapper | main business logic edits |
| Renderer app/provider composition | `renderer/app/**`, `renderer/components/**` | `renderer/infrastructure/ipc/*` | local-runtime protocol files |
| Renderer chat/tool UX runtime | `renderer/features/chat/**` | SDK conversation-event normalization, `renderer/app/runtime/desktopChatStreamIngressRuntime.ts` | main overlay bounds logic |
| Renderer dashboard/settings/voice | `renderer/features/{dashboard,settings,voice}/**` | provider contexts + transcript infra | local execution logic |
| Renderer infra services | `renderer/infrastructure/{api,ipc,audio,services,transcript}/**` | main IPC handlers + local-runtime RPC contracts | landing page modules |
| Local-runtime Python service core | `main/python/{local_backend,wakeword_service}.py`, `main/python/core/**` | `main/local_runtime_bridge.cjs`, wakeword bridge | renderer UI components |
| Local-runtime Python tool implementations | `main/python/tools/**` | backend tool schemas + SDK/main tool router | main window/tray modules |
| Local-runtime memory runtime | `main/python/memory/**` | SDK-provided embeddings, remote semantic client, and renderer dashboard memory views | renderer chat presentation |
| Landing page runtime | `frontend/src/landing/**` | none (isolated app surface) | main/renderer runtime modules |

## Responsibility Boundaries

- `main/**` owns process lifecycle, OS windowing, SDK-runtime adaptation, and local-runtime host context/status.
- `preload.js` owns only safe channel exposure.
- `renderer/**` owns UI state, event consumption, tool execution display state, and user intent.
- `main/python/**` implements executable tool/memory/system behavior and local runtime protocols behind the local-runtime boundary.
- `landing/**` owns standalone marketing surface only.

## Red-Flag Ownership Violations

- Patching renderer UI to compensate for malformed backend events instead of fixing main/backend contracts.
- Patching main IPC logic for local-runtime tool argument shape issues that belong in local-runtime executable schemas.
- Patching local-runtime Python service logic for renderer state race conditions that belong in hooks/providers.
- Editing preload allowlists to "fix" missing main handlers.

## Fast Triage Map

- Query not reaching backend: start with the renderer app-runtime send facade plus the Electron main agent host (`main/ipc.cjs`).
- Event visible in main but not UI: start with SDK backend-event normalization, then `renderer/app/runtime/desktopChatStreamIngressRuntime.ts` and `useChatStream.ts` conversation-event dispatch.
- Tool call issued but no result: start `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` + `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` + `main/python/tools/registry.py`.
- Wakeword detected inconsistently: start `renderer/useWakewordDetection.ts` + `main/wakeword_bridge.cjs` + `main/python/wakeword_service.py`.
- Memory search/summary drift: start `main/python/memory/local_store.py`, SDK embedding pipeline, remote semantic client, and dashboard memory hooks.

## Related Docs

- [Frontend Inventory Domains Hub](README.md)
- [Frontend Change Path Playbook Reference](frontend_change_path_playbook_reference.md)
- [Frontend Runtime Surface Matrix Reference](../frontend_runtime_surface_matrix_reference.md)
