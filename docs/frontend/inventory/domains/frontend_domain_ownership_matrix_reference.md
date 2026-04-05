---
summary: "Frontend domain ownership matrix mapping responsibilities to main, preload, renderer, sidecar, and landing modules with integration boundaries."
read_when:
  - When assigning ownership for frontend architecture changes.
  - When splitting work across renderer/main/sidecar boundaries.
title: "Frontend Domain Ownership Matrix Reference"
---

# Frontend Domain Ownership Matrix Reference

## Ownership Matrix

| Domain | Primary ownership modules | Secondary integration modules | Non-owners (avoid primary edits) |
| --- | --- | --- | --- |
| Electron window/runtime orchestration | `frontend/src/main/index.cjs`, `frontend/src/main/main_window_runtime.cjs`, `main/main_process_lifecycle_runtime.cjs`, overlay handlers | `main/response_overlay_phase_handler.cjs`, `main/window_visibility_runtime.cjs` | renderer feature hooks |
| Main overlay/window IPC + visibility runtime | `main/{overlay_phase_ipc_runtime,window_controls_ipc_runtime,permission_ipc_runtime}.cjs`, `main/window_visibility_runtime.cjs` | overlay/window handler modules + permission/visibility delegates | renderer feature hooks |
| Main websocket relay + settings gate | `frontend/src/main/ipc.cjs`, `main/ipc_runtime_helpers.cjs`, `main/ipc_renderer_windows.cjs`, `main/ipc_query_broadcast.cjs` | `main/backend_endpoints.cjs`, `main/ipc_query_events.cjs`, `main/query_payload_builder.cjs` | sidecar tool modules |
| Local sidecar subprocess bridge | `frontend/src/main/local_backend_bridge*.cjs` | `main/runtime_paths.cjs`, mapper/util modules | renderer store logic |
| Preload boundary | `frontend/src/preload.js` | renderer IPC bridge wrapper | main business logic edits |
| Renderer app/provider composition | `renderer/app/**`, `renderer/components/**` | `renderer/infrastructure/ipc/*` | sidecar protocol files |
| Renderer chat/tool UX runtime | `renderer/features/chat/**` | `renderer/infrastructure/services/*`, `renderer/types/backendEvents.ts` | main overlay bounds logic |
| Renderer dashboard/settings/voice | `renderer/features/{dashboard,settings,voice}/**` | provider contexts + transcript infra | sidecar execution logic |
| Renderer infra services | `renderer/infrastructure/{api,ipc,audio,services,transcript}/**` | main IPC handlers + sidecar method contracts | landing page modules |
| Sidecar runtime core | `main/python/{local_backend,memory_service,wakeword_service}.py`, `main/python/core/**` | `main/local_backend_bridge.cjs`, wakeword bridge | renderer UI components |
| Sidecar tool runtime | `main/python/tools/**` | backend tool schemas + renderer tool runner | main window/tray modules |
| Sidecar memory runtime | `main/python/memory/**` | remote embedding/semantic clients + renderer dashboard memory views | renderer chat presentation |
| Main permission/privilege runtime | `main/permission_service.cjs`, `main/agent_sudo_access_handler.cjs` | renderer permission store + settings data controls | sidecar tool modules |
| Landing page runtime | `frontend/src/landing/**` | none (isolated app surface) | main/renderer runtime modules |

## Responsibility Boundaries

- `main/**` owns process lifecycle, OS windowing, websocket relay, sidecar subprocess lifecycle.
- `preload.js` owns only safe channel exposure.
- `renderer/**` owns UI state, event consumption, tool execution orchestration from UI.
- `main/python/**` owns executable tool/memory/system behavior and local runtime protocols.
- `landing/**` owns standalone marketing surface only.

## Red-Flag Ownership Violations

- Patching renderer UI to compensate for malformed backend events instead of fixing main/backend contracts.
- Patching main IPC logic for sidecar tool argument shape issues that belong in sidecar schemas.
- Patching sidecar service logic for renderer state race conditions that belong in hooks/providers.
- Editing preload allowlists to “fix” missing main handlers.

## Fast Triage Map

- Query not reaching backend: start `main/ipc.cjs` + renderer API client.
- Event visible in main but not UI: start `renderer/types/backendEvents.ts` + `useChatStream.ts`.
- Tool call issued but no result: start `renderer/useToolRunner.ts` + `main/local_backend_bridge.cjs` + `main/python/tools/registry.py`.
- Wakeword detected inconsistently: start `renderer/useWakewordDetection.ts` + `main/wakeword_bridge.cjs` + `main/python/wakeword_service.py`.
- Memory search/summary drift: start `main/python/memory/local_store.py` + remote memory clients + dashboard memory hooks.

## Related Docs

- [Frontend Inventory Domains Hub](README.md)
- [Frontend Change Path Playbook Reference](frontend_change_path_playbook_reference.md)
- [Frontend Runtime Surface Matrix Reference](../frontend_runtime_surface_matrix_reference.md)
