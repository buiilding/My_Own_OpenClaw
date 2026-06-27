---
summary: "Detailed frontend capability-to-file matrix across Electron main, preload, renderer, local-runtime Python, and landing modules."
read_when:
  - When implementing frontend changes and choosing exact ownership files.
  - When tracing regressions across renderer/main/local-runtime boundaries.
title: "Frontend Capability to File Matrix Reference"
---

# Frontend Capability to File Matrix Reference

This matrix maps frontend capabilities to implementation files.

## Coverage Snapshot (2026-03-05)

- Main process files: `58`
- Local-runtime Python files: `156`
- Renderer files: `202`
- Landing files: `13`
- Preload files: `1`
- Total covered frontend files: `430`

## 1) Main Process Runtime

| Capability | Primary files | Notes |
| --- | --- | --- |
| Electron app bootstrap + window creation | `frontend/src/main/index.cjs`, `frontend/src/main/surfaces/main_window_runtime.cjs` | Creates dashboard and overlay windows; wires runtime deps. |
| App lifecycle and global shortcut policy | `frontend/src/main/app/main_process_lifecycle_runtime.cjs` | Startup/activate/quit behavior and wakeword hotkey toggling. |
| Split main-process IPC registrars | `frontend/src/main/surfaces/{overlay_phase_ipc_runtime,window_controls_ipc_runtime}.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs`, `frontend/src/main/surfaces/overlay_*_handler.cjs`, `frontend/src/main/surfaces/main_window_controls_handler.cjs` | Phase-owned overlay shell channels, dashboard/display controls, and permission handlers. |
| Overlay visibility and side-channel signaling | `frontend/src/main/surfaces/overlay_signal_runtime.cjs`, `frontend/src/main/surfaces/response_overlay_phase_handler.cjs` | Broadcasts overlay visibility + wakeword toggle/STT triggers. |
| Overlay bounds and top-most helper runtime | `frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs`, `frontend/src/main/surfaces/overlay_bounds.cjs` | Positioning, fallback bounds, and always-on-top helpers. |
| Main/chat visibility transitions | `frontend/src/main/surfaces/window_visibility_runtime.cjs`, `frontend/src/main/surfaces/overlay_visibility_handler.cjs` | Focus/hide/show policy across chat, response overlay, and main window. |
| Overlay query-capture blur prep | `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/ipc.cjs` | Blurs desktop app windows and waits briefly before capture without restoring another app to foreground. |

## 2) Main IPC, Backend Relay, and Local-Runtime Bridge

| Capability | Primary files | Notes |
| --- | --- | --- |
| Backend websocket handshake + relay | `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `frontend/src/main/ipc.cjs`, `frontend/src/main/app/backend_endpoints.cjs` | SDK-managed `/ws` session and renderer-safe stream fan-out. |
| First-query settings ACK gate | `frontend/src/main/ipc/ipc_settings_sync.cjs`, `frontend/src/main/ipc.cjs` | Runs timeout-bound settings ACK before first query send. |
| IPC helper module split | `frontend/src/main/ipc/ipc_runtime_helpers.cjs`, `frontend/src/main/ipc/ipc_renderer_windows.cjs`, `frontend/src/main/ipc/ipc_query_broadcast.cjs`, `frontend/src/main/ipc/ipc_query_events.cjs` | Shared helper boundaries for relay/send/failure semantics. |
| Query payload construction | `frontend/src/main/ipc/ipc_query_runtime.cjs` | Adds system/memory context and query metadata before send. |
| Desktop UI config load/save | `frontend/src/main/ipc/ipc_desktop_ui_config.cjs` | Disk + in-memory config snapshot ownership. |
| Local-runtime Python daemon lifecycle | `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_supervisor.cjs`, `frontend/src/main/app/runtime_paths.cjs` | SDK-owned daemon startup/reuse, desktop launch options, readiness/status snapshots, and shutdown. |
| Local-runtime scoped host bridge | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_utils.cjs`, `frontend/src/main/sidecar/local_runtime_window_visibility.cjs` | SDK local runtime RPC routing for host-only helpers plus host window/screenshot wrapper behavior. |
| Wakeword subprocess bridge | `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs` | Binary framing for wakeword audio input/output messages, plus helper-owned stderr status parsing and payload normalization. |

## 3) Preload Trust Boundary

| Capability | Primary files | Notes |
| --- | --- | --- |
| Allowlisted renderer bridge API | `frontend/src/preload.js` | Exposes channel-scoped `send`, `invoke`, `on`, `once`. |
| Context isolation + API hard boundary | `frontend/src/preload.js` | Blocks direct electron/node access from renderer surface. |

## 4) Renderer App and Routing

| Capability | Primary files | Notes |
| --- | --- | --- |
| Entry view router | `frontend/src/renderer/app/main.jsx`, `frontend/src/renderer/app/runtime/desktopStartupRuntimeClient.ts` | Chooses root component by runtime-owned root-element lookup and `?view=` parsing (`App`, `minimal-chat-pill`, `minimal-response-overlay`, debug). |
| Main app provider composition | `frontend/src/renderer/app/App.jsx`, `frontend/src/renderer/app/providers/*` | Mounts app/chat providers and permission bootstrap gate. |
| Overlay-focused app roots | `frontend/src/renderer/app/{MinimalChatPillApp,MinimalResponseOverlayApp}.jsx` | Overlay-specific renderer shells. |
| Tool ghost debug entry | `frontend/src/renderer/app/ToolGhostDebugApp.jsx` | Debug-only animation harness for tool ghost timing. |

## 5) Renderer Chat, Stream, and Tool Runtime

| Capability | Primary files | Notes |
| --- | --- | --- |
| Message send and capture path | `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`, `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`, `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts` | Sends message, emits typed SDK resources for screenshots/files/images, and lets SDK/main resolve capture and upload before backend dispatch. |
| SDK conversation event handling | `frontend/src/renderer/features/chat/hooks/useChatStream.ts`, `frontend/src/renderer/features/chat/hooks/chatStream/*`, `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts` | Consumes SDK-normalized conversation events and current-turn projections; backend-wire stream normalization stays behind SDK/main local-runtime dispatch and SDK projection. |
| Tool call execution and stale-turn cancel | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts` | Executes tool/tool-bundle through the SDK local-runtime client and sends explicit failure results for stale or failed waits. |
| Tool display projection | `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`, `frontend/src/renderer/infrastructure/transcript/{toolCallMessageState.js,toolOutputChatMessageState.ts}` | Renders tool-call/tool-output cards from SDK/main fan-out without executing local tools in the renderer. |
| Chat state store and selectors | `frontend/src/renderer/app/runtime/desktopChatMessageTypes.ts`, `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`, `frontend/src/renderer/features/chat/stores/chatStore.ts` | Shared chat-message/token-count contract plus message list, stream phase, token, and turn tracking state. |
| Transcript persistence and display projection | `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`, `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`, `frontend/src/renderer/app/runtime/desktopPresentationSourceChannels.js`, `frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts`, `desktopConversationStore.ts`, `sessionInfo*.ts` | SDK-facing store/projection runtime owns session tracking, durable events, display rows, and presentation source-channel labels. |
| IPC channel constants and typed bridge | `frontend/src/renderer/infrastructure/ipc/{channels,bridge}.ts` | Canonical channel names and runtime bridge wrappers. |

## 6) Renderer Dashboard, Settings, Permissions, Voice

| Capability | Primary files | Notes |
| --- | --- | --- |
| Dashboard shell + navigation | `frontend/src/renderer/features/dashboard/components/{DashboardShell,DashboardSidebar,SearchChatsModal}.jsx` | Section routing, search modal, conversation navigation controls. |
| Dashboard section runtime | `frontend/src/renderer/features/dashboard/components/sections/*`, `frontend/src/renderer/app/runtime/desktopMemoryRuntimeClient.ts`, `frontend/src/renderer/app/runtime/desktopMemoryRetrievalPreferenceRuntime.js` | Memory/models/settings/usage behavior; memory list/delete/clear actions use SDK-shaped commands and SDK-owned invalidation events, and memory retrieval injection preference persistence lives behind the app-runtime facade. |
| Dashboard conversation data hooks | `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`, `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js` | Conversation polling/grouping plus app-runtime active transcript session subscription. |
| Settings event runtime client | `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts` | Renderer model-list event handling and settings provider event boundaries. |
| Permission onboarding + controls | `frontend/src/renderer/features/permissions/components/*`, `stores/permissionStore.js`, `utils/permission*.js` | Install-time gate and ongoing permission status controls. |
| Voice capture + wakeword | `frontend/src/renderer/features/voice/hooks/*`, `utils/*`, `components/VoiceStatus.jsx` | Mic capture, wakeword streaming, voice mode websocket runtime. |

## 7) Local-Runtime Python Implementation Domains

| Capability | Primary files | Notes |
| --- | --- | --- |
| JSON-RPC local-runtime entrypoint | `frontend/src/main/python/local_backend.py` | Primary Python implementation behind local-runtime tool/memory/transcript/system RPC. |
| Wakeword sidecar entrypoint | `frontend/src/main/python/wakeword_service.py` | Wakeword model load + framed output loop. |
| Core protocol and lifecycle | `frontend/src/main/python/core/{ipc_protocol,stdout_json,thread_pool}.py`, `frontend/src/main/python/sidecar_daemon.py` | Request framing, response writes, executor lifecycle, and daemon shutdown behavior. |
| Local-runtime hosted helper clients | `frontend/src/main/python/core/{remote_api_client_base,remote_semantic_client}.py` | Shared retry/error policy wrappers for semantic backend calls. |
| Platform state and metrics | `frontend/src/main/python/core/{system_state,system_metrics}.py`, `core/platform/*.py` | OS-specific probes and normalized runtime metrics payloads. |
| Memory persistence and semantic pipeline | `frontend/src/main/python/memory/{local_store,sqlite_store,faiss_index,summarizer,operations,watermark_state,conversation_titles}.py` | Transcript store/search and semantic indexing/summarization. |
| Tool registry and schemas | `frontend/src/main/python/tools/{registry,schemas,result,base}.py` | Local-runtime tool catalog implementation and standardized result structures. |
| Computer/filesystem/system tools | `frontend/src/main/python/tools/{computer,filesystem,system}/*` | Direct machine control, file operations, and shell/process actions. |
| Browser runtime + Browser Use CLI adapter | `frontend/src/main/python/tools/browser/*`, `frontend/src/main/python/windie_shared/browser_contract*.py` | Browser action schemas, Chrome/CDP launch policy, Browser Use CLI dispatch, and result normalization. |

## 8) Landing Runtime

| Capability | Primary files | Notes |
| --- | --- | --- |
| Landing app entry + composition | `frontend/src/landing/{main,LandingPage}.jsx` | Standalone marketing entrypoint and section composition. |
| Landing components | `frontend/src/landing/components/*` | Hero/how/available/roadmap/etc runtime section components. |
| Landing style tokens/layout | `frontend/src/landing/styles/*` | Shared visual tokens and layout/animation styling. |

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Functionality Capability Catalog Reference](frontend_functionality_capability_catalog_reference.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
- [Frontend Module File Index Reference](frontend_module_file_index_reference.md)
