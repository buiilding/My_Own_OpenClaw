---
summary: "Matrix view of frontend runtime surfaces and end-to-end paths across Electron main, preload boundary, renderer, sidecar services, and landing app."
read_when:
  - When tracing frontend behavior across process boundaries.
  - When validating where new frontend functionality should be implemented.
title: "Frontend Runtime Surface Matrix Reference"
---

# Frontend Runtime Surface Matrix Reference

This matrix maps runtime behavior to exact modules in `frontend/src`.

## Coverage Snapshot (2026-03-05)

- Main process files: `58`
- Sidecar python files: `156`
- Renderer files: `201`
- Landing files: `13`
- Preload files: `1`
- Total covered frontend files: `429`

## Runtime Surface Ownership

| Surface | Primary entry modules | Core orchestrators | Exit/response paths |
| --- | --- | --- | --- |
| Electron app runtime | `frontend/src/main/index.cjs`, `frontend/src/main/main_window_runtime.cjs`, `frontend/src/main/main_process_lifecycle_runtime.cjs` | Window/tray setup, lifecycle listeners, bridge initializers | Renderer windows + process shutdown |
| Main overlay/window runtime | `frontend/src/main/{overlay_phase_ipc_runtime,window_controls_ipc_runtime,permission_ipc_runtime}.cjs`, `frontend/src/main/window_visibility_runtime.cjs`, `frontend/src/main/overlay_signal_runtime.cjs`, `frontend/src/main/overlay_window_helpers_runtime.cjs` | Split IPC registration, chat/main visibility transitions, overlay side-channel signals, positioning/top-most helpers | Overlay + main window state transitions |
| Main process backend bridge | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_runtime_helpers.cjs`, `frontend/src/main/ipc/ipc_renderer_windows.cjs`, `frontend/src/main/ipc/ipc_query_broadcast.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs` | WebSocket session, settings ACK gate, relay fan-out | IPC events to renderer |
| Main process sidecar bridge | `frontend/src/main/local_backend_bridge.cjs` | Python subprocess lifecycle, JSON-RPC correlation | Tool/system/memory responses |
| Main process wakeword bridge | `frontend/src/main/wakeword_bridge.cjs`, `frontend/src/main/wakeword_bridge_runtime.cjs` | Wakeword subprocess lifecycle + binary framing with helper-owned status/error parsing + payload normalization | Wakeword events to renderer/main IPC |
| Main VM worker bridge | `frontend/src/main/{runtime_mode,vm_worker_runtime}.cjs` | Hosted `/api/runs/*` heartbeat polling, run dispatch, stream relay, control-command application | Websocket `stop-query` + `/api/runs/*` event/control updates |
| Preload trust boundary | `frontend/src/preload.js` | Allowlisted IPC exposure only | `window.ipc` bridge methods |
| Renderer app shell | `frontend/src/renderer/app/App.jsx` | Provider stack, main layout routing | Chat/dashboard surfaces |
| Renderer chat runtime | `frontend/src/renderer/features/chat/hooks/useChatStream.ts` | Stream event handling, state transitions | Message list + overlay updates |
| Renderer tool runtime | `frontend/src/renderer/features/chat/hooks/useToolRunner.ts` | Tool execution service + callback wiring | `tool-result` / `tool-bundle-result` send path |
| Renderer voice runtime | `frontend/src/renderer/features/voice/hooks/*` | Wakeword capture + gateway audio stream | Transcription/voice status updates |
| Sidecar local backend | `frontend/src/main/python/local_backend.py` | JSON-RPC method routing + tool registry | JSON-RPC result envelopes |
| Sidecar memory-only service | `frontend/src/main/python/memory_service.py` | Search/store protocol loop | JSON line responses |
| Sidecar wakeword service | `frontend/src/main/python/wakeword_service.py` | Wakeword model bootstrap + detection loop | Length-prefixed detection frames |
| Landing app runtime | `frontend/src/landing/main.jsx` | Landing section composition | Static marketing UI |

## End-to-End Runtime Paths

### Query + Stream Path

| Phase | Module ownership |
| --- | --- |
| Query send from UI | `renderer/features/chat/hooks/useChatMessageSender.ts` |
| Renderer API call | `renderer/infrastructure/api/client.ts` |
| Main relay and gating | `main/ipc.cjs` |
| Backend websocket send | `main/ipc.cjs` -> backend `/ws` |
| Stream event return | backend `/ws` -> `main/ipc.cjs` -> renderer `ON_CHANNELS.FROM_BACKEND` |
| Renderer stream integration | `renderer/features/chat/hooks/useChatStream.ts` + `chatStore.ts` |

### Tool Execution Path

| Phase | Module ownership |
| --- | --- |
| Tool-call event detected | `renderer/features/chat/hooks/useToolRunner.ts` |
| Tool execution orchestration | `renderer/infrastructure/services/ToolExecutionService.ts` |
| IPC invoke to main | `renderer/infrastructure/ipc/bridge.ts` |
| Sidecar request dispatch | `main/local_backend_bridge.cjs` |
| Sidecar tool execution | `main/python/tools/registry.py` + domain tool modules |
| Result normalization + send | `ToolExecutionPayloads.ts` -> `main/ipc.cjs` -> backend `tool-result` |

### Voice + Wakeword Path

| Phase | Module ownership |
| --- | --- |
| Wakeword capture | `renderer/features/voice/hooks/useWakewordDetection.ts` |
| Binary audio relay | `main/wakeword_bridge.cjs`, `main/wakeword_bridge_runtime.cjs` |
| Wakeword inference | `main/python/wakeword_service.py` |
| Detection relay back | `wakeword_bridge.cjs` -> renderer + `ApiClient.wakewordDetected` |
| Voice gateway stream | `renderer/features/voice/hooks/useVoiceMode.ts` |

### Memory + Transcript Path

| Phase | Module ownership |
| --- | --- |
| Transcript buffering/session state | `renderer/infrastructure/transcript/*` |
| Store/search invoke | `renderer/infrastructure/api/client.ts` + IPC invoke |
| Sidecar memory handlers | `main/python/{local_backend.py,local_backend_memory_handlers.py}` + `memory/local_store.py` |
| Optional semantic summarization | `memory/summarizer.py` + `core/{remote_api_client_base,remote_semantic_client,remote_title_client}.py` |

## High-Risk Cross-Boundary Contracts

- IPC channel constants: `renderer/infrastructure/ipc/channels.ts` <-> `main/ipc.cjs` handlers.
- Backend event payload shape: `renderer/types/backendEvents.ts` <-> backend outgoing schemas.
- Tool schema parity: backend tool schemas <-> sidecar `tools/schemas.py`.
- Browser action compatibility: backend browser schema <-> sidecar browser adapter/runtime.
- Wakeword frame protocol: `main/wakeword_bridge.cjs` + `main/wakeword_bridge_runtime.cjs` <-> `main/python/wakeword_service.py`.

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Full Functionality Inventory Reference](frontend_full_functionality_inventory_reference.md)
- [Frontend Functionality Capability Catalog Reference](frontend_functionality_capability_catalog_reference.md)
- [Frontend Capability to File Matrix Reference](frontend_capability_to_file_matrix_reference.md)
- [Frontend Module File Index Reference](frontend_module_file_index_reference.md)
- [Frontend IPC and Sidecar Contract Touchpoints Reference](frontend_ipc_and_sidecar_contract_touchpoints_reference.md)
