---
summary: "Detailed frontend capability-to-file matrix across Electron main, preload, renderer, sidecar, and landing modules."
read_when:
  - When implementing frontend changes and choosing exact ownership files.
  - When tracing regressions across renderer/main/sidecar boundaries.
title: "Frontend Capability to File Matrix Reference"
---

# Frontend Capability to File Matrix Reference

This matrix maps frontend capabilities to implementation files.

## Coverage Snapshot (2026-03-05)

- Main process files: `58`
- Sidecar python files: `156`
- Renderer files: `201`
- Landing files: `13`
- Preload files: `1`
- Total covered frontend files: `429`

## 1) Main Process Runtime

| Capability | Primary files | Notes |
| --- | --- | --- |
| Electron app bootstrap + window creation | `frontend/src/main/index.cjs`, `frontend/src/main/main_window_runtime.cjs` | Creates dashboard and overlay windows; wires runtime deps. |
| App lifecycle and global shortcut policy | `frontend/src/main/main_process_lifecycle_runtime.cjs` | Startup/activate/quit behavior and wakeword hotkey toggling. |
| Split main-process IPC registrars | `frontend/src/main/{overlay_phase_ipc_runtime,window_controls_ipc_runtime,permission_ipc_runtime}.cjs`, `frontend/src/main/overlay_*_handler.cjs`, `frontend/src/main/main_window_controls_handler.cjs` | Phase-owned overlay shell channels, dashboard/display controls, and permission/sudo handlers. |
| Overlay visibility and side-channel signaling | `frontend/src/main/overlay_signal_runtime.cjs`, `frontend/src/main/response_overlay_phase_handler.cjs` | Broadcasts overlay visibility + wakeword toggle/STT triggers. |
| Overlay bounds and top-most helper runtime | `frontend/src/main/overlay_window_helpers_runtime.cjs`, `frontend/src/main/overlay_bounds.cjs` | Positioning, fallback bounds, always-on-top helpers, context-label sync. |
| VM mode + worker bridge runtime | `frontend/src/main/runtime_mode.cjs`, `frontend/src/main/vm_worker_runtime.cjs` | Env-gated VM worker lifecycle, `/api/runs/*` heartbeat/dispatch/event relay, control command application. |
| Main/chat visibility transitions | `frontend/src/main/window_visibility_runtime.cjs`, `frontend/src/main/overlay_visibility_handler.cjs` | Focus/hide/show policy across chat, response overlay, and main window. |
| Overlay query-capture blur prep | `frontend/src/main/main_window_runtime.cjs`, `frontend/src/main/ipc.cjs` | Blurs WindieOS windows and waits briefly before capture without restoring another app to foreground. |

## 2) Main IPC, Backend Relay, and Sidecar Bridge

| Capability | Primary files | Notes |
| --- | --- | --- |
| Backend websocket handshake + relay | `frontend/src/main/ipc.cjs`, `frontend/src/main/backend_endpoints.cjs` | Manages `/ws` session and relays stream events to renderer. |
| First-query settings ACK gate | `frontend/src/main/ipc/ipc_settings_sync.cjs`, `frontend/src/main/ipc.cjs` | Runs timeout-bound settings ACK before first query send. |
| IPC helper module split | `frontend/src/main/ipc/ipc_runtime_helpers.cjs`, `frontend/src/main/ipc/ipc_renderer_windows.cjs`, `frontend/src/main/ipc/ipc_query_broadcast.cjs`, `frontend/src/main/ipc/ipc_query_events.cjs` | Shared helper boundaries for relay/send/failure semantics. |
| Query payload construction | `frontend/src/main/query_payload_builder.cjs` | Adds system/memory context and query metadata before send. |
| Frontend config load/save | `frontend/src/main/ipc/ipc_frontend_config.cjs` | Disk + in-memory config snapshot ownership. |
| OpenAI Codex OAuth IPC flow | `frontend/src/main/openai_codex_oauth.cjs`, `frontend/src/main/ipc.cjs` | PKCE login + local callback server and logout response envelopes for non-UI callers; renderer settings do not currently expose OAuth controls. |
| Local sidecar process lifecycle | `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/runtime_paths.cjs` | Spawns local backend python process and manages readiness. |
| Sidecar RPC request mapping | `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`, `frontend/src/main/local_backend_bridge_utils.cjs`, `frontend/src/main/local_backend_bridge_window_visibility.cjs` | JSON-RPC request correlation, timeout, and window/screenshot visibility runtime wrapper behavior. |
| Wakeword subprocess bridge | `frontend/src/main/wakeword_bridge.cjs`, `frontend/src/main/wakeword_bridge_runtime.cjs` | Binary framing for wakeword audio input/output messages, plus helper-owned stderr status parsing and payload normalization. |
| Permission + sudo system bridges | `frontend/src/main/permission_service.cjs`, `frontend/src/main/agent_sudo_access_handler.cjs` | OS permission probe/request and Linux sudo grant/revoke flows. |

## 3) Preload Trust Boundary

| Capability | Primary files | Notes |
| --- | --- | --- |
| Allowlisted renderer bridge API | `frontend/src/preload.js` | Exposes channel-scoped `send`, `invoke`, `on`, `once`. |
| Context isolation + API hard boundary | `frontend/src/preload.js` | Blocks direct electron/node access from renderer surface. |

## 4) Renderer App and Routing

| Capability | Primary files | Notes |
| --- | --- | --- |
| Entry view router | `frontend/src/renderer/app/main.jsx` | Chooses root component by `?view=` (`App`, chatbox variants, debug). |
| Main app provider composition | `frontend/src/renderer/app/App.jsx`, `frontend/src/renderer/app/providers/*` | Mounts app/chat providers and permission bootstrap gate. |
| Overlay-focused app roots | `frontend/src/renderer/app/{ChatBoxApp,ChatBoxResponseApp,ChatBoxContextLabelApp}.jsx` | Overlay-specific renderer shells. |
| Tool ghost debug entry | `frontend/src/renderer/app/ToolGhostDebugApp.jsx` | Debug-only animation harness for tool ghost timing. |

## 5) Renderer Chat, Stream, and Tool Runtime

| Capability | Primary files | Notes |
| --- | --- | --- |
| Message send and capture path | `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`, `frontend/src/renderer/infrastructure/services/{ScreenshotAttachmentPipeline,SystemStateCapture,ArtifactUploader}.ts` | Sends message, captures screenshots and system state through separate services, uploads artifacts, dispatches query. |
| Backend stream event handling | `frontend/src/renderer/features/chat/hooks/useChatStream.ts`, `frontend/src/renderer/features/chat/utils/chatStream/chatStream*.ts` | Handles thought/chunk/complete/error/tool/context-compaction event classes. |
| Tool call execution and stale-turn cancel | `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`, `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerMessages.ts` | Executes tool/tool-bundle and sends cancellation results when turn is stale. |
| Tool execution orchestration service | `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`, `ToolExecution*.ts` helper modules | Formats payloads, capture orchestration, backend callback dispatch. |
| Chat state store and selectors | `frontend/src/renderer/features/chat/stores/chatStore.ts`, `frontend/src/renderer/features/chat/utils/chatSelectors.js` | Message list, stream phase, token and turn tracking state. |
| Transcript persistence and retry queues | `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`, `pending*Queue.ts`, `sessionInfo*.ts` | Session tracking plus queued retry when transcript write fails. |
| IPC channel constants and typed bridge | `frontend/src/renderer/infrastructure/ipc/{channels,bridge}.ts` | Canonical channel names and runtime bridge wrappers. |

## 6) Renderer Dashboard, Settings, Permissions, Voice

| Capability | Primary files | Notes |
| --- | --- | --- |
| Dashboard shell + navigation | `frontend/src/renderer/features/dashboard/components/{ChatGptDashboardShell,DashboardSidebar,SearchChatsModal}.jsx` | Section routing, search modal, conversation navigation controls. |
| Dashboard section runtime | `frontend/src/renderer/features/dashboard/components/sections/*` | Memory/models/settings/usage section behavior and UI contracts. |
| Dashboard conversation data hooks | `frontend/src/renderer/features/dashboard/hooks/{useDashboardConversations,useTranscriptSessionInfo}.js` | Conversation polling/grouping and active transcript session logic. |
| Settings management hook | `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts` | Renderer config update orchestration and persistence boundaries. |
| Permission onboarding + controls | `frontend/src/renderer/features/permissions/components/*`, `stores/permissionStore.js`, `utils/permission*.js` | Install-time gate and ongoing permission status controls. |
| Voice capture + wakeword | `frontend/src/renderer/features/voice/hooks/*`, `utils/*`, `components/VoiceStatus.jsx` | Mic capture, wakeword streaming, voice mode websocket runtime. |

## 7) Sidecar Runtime and Tool Domains

| Capability | Primary files | Notes |
| --- | --- | --- |
| JSON-RPC local backend entrypoint | `frontend/src/main/python/local_backend.py` | Primary sidecar service process for tool/memory/transcript/system RPC. |
| Memory-only service entrypoint | `frontend/src/main/python/memory_service.py` | Dedicated memory service runtime mode. |
| Wakeword sidecar entrypoint | `frontend/src/main/python/wakeword_service.py` | Wakeword model load + framed output loop. |
| Core protocol and lifecycle | `frontend/src/main/python/core/{ipc_protocol,stdout_json,runtime_shutdown,thread_pool}.py` | Request framing, response writes, graceful shutdown behavior. |
| Sidecar backend HTTP clients | `frontend/src/main/python/core/{remote_api_client_base,remote_embedding_client,remote_semantic_client,remote_title_client}.py` | Shared retry/error policy wrappers for semantic/title/embedding backend calls. |
| Platform state and metrics | `frontend/src/main/python/core/{system_state,system_metrics}.py`, `core/platform/*.py` | OS-specific probes and normalized runtime metrics payloads. |
| Memory persistence and semantic pipeline | `frontend/src/main/python/memory/{local_store,sqlite_store,faiss_index,summarizer,operations,watermark_state,conversation_titles}.py` | Transcript store/search and semantic indexing/summarization. |
| Tool registry and schemas | `frontend/src/main/python/tools/{registry,schemas,result,base}.py` | Sidecar tool catalog and standardized result structures. |
| Computer/filesystem/system/memory tools | `frontend/src/main/python/tools/{computer,filesystem,system,memory}/*` | Direct machine control, file operations, shell/process, memory actions. |
| Browser runtime + compatibility + browser_use | `frontend/src/main/python/tools/browser/*`, `frontend/src/main/python/tools/browser/browser_use/**` | Browser action schemas, native runtime adapters, vendored Browser Use stack. |

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
