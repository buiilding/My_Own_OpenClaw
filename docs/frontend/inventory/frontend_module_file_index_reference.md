---
summary: "Frontend module/file ownership index across Electron main, preload, renderer feature slices, sidecar Python services, browser stack, and landing surface."
read_when:
  - When onboarding to frontend code and needing quick file-level entry points.
  - When planning a cross-process frontend change and choosing exact files to inspect.
title: "Frontend Module File Index Reference"
---

# Frontend Module File Index Reference

This index maps frontend functionality to file ownership.

## Surface File Counts

| Surface | Files |
| --- | ---: |
| Main process (`frontend/src/main`, `.cjs`/`.js`) | 22 |
| Sidecar Python (`frontend/src/main/python`, `.py`) | 135 |
| Renderer runtime (`frontend/src/renderer`, TS/JS) | 114 |
| Landing (`frontend/src/landing`, `.jsx`/`.css`) | 13 |
| Preload bridge (`frontend/src/preload.js`) | 1 |

## Main Process File Index

Core runtime:

- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/runtime_paths.cjs`

Overlay/window control helpers:

- `frontend/src/main/overlay_visibility_handler.cjs`
- `frontend/src/main/overlay_mouse_handler.cjs`
- `frontend/src/main/overlay_chatbox_handler.cjs`
- `frontend/src/main/overlay_responsebox_handler.cjs`
- `frontend/src/main/overlay_renderer_registration.cjs`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/main_window_controls_handler.cjs`
- `frontend/src/main/display_query_handler.cjs`
- `frontend/src/main/external_focus_tracker.cjs`

Bridge/support modules:

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`
- `frontend/src/main/test_shell.cjs`

## Renderer File Index

App + providers:

- `frontend/src/renderer/app/*.jsx`
- `frontend/src/renderer/app/providers/*`

Shared components:

- `frontend/src/renderer/components/{MainLayout,ErrorBoundary}.jsx`

Feature slices:

- Chat:
- `frontend/src/renderer/features/chat/components/*`
- `frontend/src/renderer/features/chat/hooks/*`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/utils/*`
- `frontend/src/renderer/features/chat/policies/*`
- `frontend/src/renderer/features/chat/constants/*`
- Dashboard:
- `frontend/src/renderer/features/dashboard/components/*`
- `frontend/src/renderer/features/dashboard/hooks/*`
- `frontend/src/renderer/features/dashboard/utils/*`
- Settings:
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- Voice:
- `frontend/src/renderer/features/voice/components/*`
- `frontend/src/renderer/features/voice/hooks/*`
- `frontend/src/renderer/features/voice/utils/*`

Infrastructure:

- IPC bridge/channels: `frontend/src/renderer/infrastructure/ipc/*`
- API client: `frontend/src/renderer/infrastructure/api/client.ts`
- Tool runtime services: `frontend/src/renderer/infrastructure/services/*`
- Audio player: `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- Transcript runtime: `frontend/src/renderer/infrastructure/transcript/*`
- Utility: `frontend/src/renderer/infrastructure/markdown.ts`

Types and general utilities:

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/utils/{configFilter,configStorage,displaySelection}.*`

## Sidecar Python File Index

Service entrypoints:

- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/wakeword_service.py`

Core infrastructure:

- `frontend/src/main/python/core/{ipc_protocol,backend_config,runtime_shutdown,stdout_json,thread_pool,system_state,system_metrics,remote_embedding_client,remote_semantic_client}.py`
- Platform adapters: `frontend/src/main/python/core/platform/{base,windows,macos,linux}.py`

Memory subsystem:

- `frontend/src/main/python/memory/{local_store,sqlite_store,faiss_index,summarizer,operations,watermark_state}.py`

Tool runtime:

- Registry/contracts: `frontend/src/main/python/tools/{registry,schemas,result,base}.py`
- Computer tools: `frontend/src/main/python/tools/computer/*`
- Filesystem tools: `frontend/src/main/python/tools/filesystem/*`
- System/process tools: `frontend/src/main/python/tools/system/*`
- Memory tool: `frontend/src/main/python/tools/memory/memory_tool.py`
- Browser tools:
- `frontend/src/main/python/tools/browser/{controller,browser_tool,browser_runtime,browser_adapter,enhanced_cdp_pipeline,chrome_detection,chrome_launcher,schemas,role_snapshot,ref_registry,openclaw_compat_schema}.py`
- Browser Use vendored stack:
- `frontend/src/main/python/tools/browser/browser_use/**`

## Landing + Preload Index

Landing:

- Entry: `frontend/src/landing/main.jsx`
- Composition: `frontend/src/landing/LandingPage.jsx`
- Sections/components: `frontend/src/landing/components/*`
- Styles: `frontend/src/landing/styles/*`

Preload:

- `frontend/src/preload.js`

## Fast Navigation Queries

Useful local queries:

- Main process handlers: `rg --files frontend/src/main | rg 'handler|bridge|ipc|overlay'`
- Renderer chat runtime: `rg --files frontend/src/renderer/features/chat`
- Sidecar tool modules: `rg --files frontend/src/main/python/tools`
- Sidecar browser stack: `rg --files frontend/src/main/python/tools/browser`
- IPC channel usage: `rg -n "SEND_CHANNELS|INVOKE_CHANNELS|ON_CHANNELS|ipcMain|ipcRenderer" frontend/src`

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Full Functionality Inventory Reference](frontend_full_functionality_inventory_reference.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
