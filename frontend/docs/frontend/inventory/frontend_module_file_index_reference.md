---
summary: "Frontend module/file ownership index across Electron main, preload, renderer feature slices, local-runtime Python services, browser stack, and landing surface."
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
| Main process (`frontend/src/main`, `.cjs`/`.js`) | 58 |
| Local-runtime Python (`frontend/src/main/python`, `.py`) | 156 |
| Renderer runtime (`frontend/src/renderer`, TS/JS) | 202 |
| Landing (`frontend/src/landing`, `.jsx`/`.css`) | 13 |
| Preload bridge (`frontend/src/preload.js`) | 1 |

## Main Process File Index

Core runtime:

- `frontend/src/main/index.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/app/runtime_mode.cjs`
- `frontend/src/main/app/vm_worker_runtime.cjs`

Overlay/window control helpers:

- `frontend/src/main/surfaces/overlay_visibility_handler.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/overlay_chatbox_handler.cjs`
- `frontend/src/main/surfaces/overlay_responsebox_handler.cjs`
- `frontend/src/main/surfaces/overlay_bounds.cjs`
- `frontend/src/main/surfaces/overlay_renderer_registration.cjs`
- `frontend/src/main/surfaces/overlay_signal_runtime.cjs`
- `frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs`
- `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`
- `frontend/src/main/surfaces/main_window_controls_handler.cjs`
- `frontend/src/main/surfaces/display_query_handler.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`

Bridge/support modules:

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_utils.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`

## Renderer File Index

App + providers:

- `frontend/src/renderer/app/*.jsx`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/app/runtime/desktopChatMessageTypes.ts`
- `frontend/src/renderer/app/runtime/desktopPresentationSourceChannels.js`
- Includes view-routed app roots: `App`, `MinimalChatPillApp`, `MinimalResponseOverlayApp`, `ToolGhostDebugApp`

Shared components:

- `frontend/src/renderer/components/ErrorBoundary.jsx`
- `frontend/src/renderer/components/ErrorBoundary.jsx`

Feature slices:

- Chat:
- `frontend/src/renderer/features/chat/components/*`
- `frontend/src/renderer/features/chat/hooks/*`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/runtime/desktopChat*.ts`
- `frontend/src/renderer/app/runtime/desktopMessage*.js`
- `frontend/src/renderer/features/chat/policies/*`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`
- Dashboard:
- `frontend/src/renderer/features/dashboard/components/*`
- `frontend/src/renderer/features/dashboard/hooks/*`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`
- Settings:
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- Voice:
- `frontend/src/renderer/features/voice/components/*`
- `frontend/src/renderer/features/voice/hooks/*`
- `frontend/src/renderer/app/runtime/desktopVoiceAudio*Runtime.ts`
- `frontend/src/renderer/app/runtime/desktopWakeword*Runtime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- Permissions:
- `frontend/src/renderer/features/permissions/components/*`
- `frontend/src/renderer/features/permissions/stores/*`
- `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`

Infrastructure:

- IPC bridge/channels: `frontend/src/renderer/infrastructure/ipc/*`
- SDK desktop transport adapter: `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- Renderer artifact/display helpers: `frontend/src/renderer/infrastructure/services/*`
- Audio player: `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- Transcript runtime: `frontend/src/renderer/infrastructure/transcript/*`
- Utility: `frontend/src/renderer/infrastructure/markdown.ts`
- Incoming text normalization: `frontend/src/renderer/infrastructure/text/incomingTextNormalization.ts`

Types and general utilities:

- `packages/windie-sdk-js/src/events/backendEvents.ts`
- `frontend/src/renderer/app/runtime/{desktopRendererConfigFilterRuntime,desktopRendererConfigStorageRuntime}.js`
- `frontend/src/renderer/utils/normalizeNonEmptyString.ts`

## Local-Runtime Python File Index

Service entrypoints:

- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/wakeword_service.py`
- `frontend/src/main/python/dev_seed_mock_memory.py` (developer seed utility)

Core infrastructure:

- `frontend/src/main/python/core/{ipc_protocol,backend_config,stdout_json,thread_pool,system_state,system_metrics,remote_semantic_client}.py`
- Includes additional backend HTTP client module: `remote_api_client_base.py`
- Platform adapters: `frontend/src/main/python/core/platform/{base,windows,macos,linux}.py`

Memory subsystem:

- `frontend/src/main/python/memory/{local_store,sqlite_store,faiss_index,summarizer,operations,watermark_state,conversation_titles}.py`

Tool runtime:

- Registry/contracts: `frontend/src/main/python/tools/{registry,schemas,result,base}.py`
- Computer tools: `frontend/src/main/python/tools/computer/*`
- Filesystem tools: `frontend/src/main/python/tools/filesystem/*`
- System/process tools: `frontend/src/main/python/tools/system/*`
- Memory RPC handlers: `frontend/src/main/python/local_backend_memory_handlers.py`
- Browser tools:
- `frontend/src/main/python/tools/browser/{browser_tool,browser_use_engine,chrome_detection,chrome_launcher,content_extraction,file_store}.py`
- `frontend/src/main/python/windie_shared/browser_contract*.py`

Browser Use runtime ownership:

- Hosted backend owns model-facing browser policy and schema exposure.
- SDK/main local-runtime dispatch owns the local transport handoff.
- The local-runtime Python browser adapter owns Chrome/CDP launch policy,
  browser-local files, and Browser Use result normalization.
- Browser Use owns browser/session mechanics.

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
- Local-runtime Python tool modules: `rg --files frontend/src/main/python/tools`
- Local-runtime Python browser stack: `rg --files frontend/src/main/python/tools/browser`
- IPC channel usage: `rg -n "SEND_CHANNELS|INVOKE_CHANNELS|ON_CHANNELS|ipcMain|ipcRenderer" frontend/src`

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Full Functionality Inventory Reference](frontend_full_functionality_inventory_reference.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
