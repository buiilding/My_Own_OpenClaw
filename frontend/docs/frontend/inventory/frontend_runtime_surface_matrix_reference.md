---
summary: "Matrix view of frontend runtime surfaces and end-to-end paths across Electron main, preload boundary, renderer, local-runtime Python services, and landing app."
read_when:
  - When tracing frontend behavior across process boundaries.
  - When validating where new frontend functionality should be implemented.
title: "Frontend Runtime Surface Matrix Reference"
---

# Frontend Runtime Surface Matrix Reference

This matrix maps runtime behavior to exact modules in `frontend/src`.

## Coverage Snapshot (2026-03-05)

- Main process files: `58`
- Local-runtime Python files: `156`
- Renderer files: `202`
- Landing files: `13`
- Preload files: `1`
- Total covered frontend files: `430`

## Runtime Surface Ownership

| Surface | Primary entry modules | Core orchestrators | Exit/response paths |
| --- | --- | --- | --- |
| Electron app runtime | `frontend/src/main/index.cjs`, `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/app/main_process_lifecycle_runtime.cjs` | Window/tray setup, lifecycle listeners, bridge initializers | Renderer windows + process shutdown |
| Main overlay/window runtime | `frontend/src/main/surfaces/{overlay_phase_ipc_runtime,window_controls_ipc_runtime}.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs`, `frontend/src/main/surfaces/window_visibility_runtime.cjs`, `frontend/src/main/surfaces/overlay_signal_runtime.cjs`, `frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs` | Split IPC registration, chat/main visibility transitions, overlay side-channel signals, positioning/top-most helpers | Overlay + main window state transitions |
| Electron agent host | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_runtime_helpers.cjs`, `frontend/src/main/ipc/ipc_renderer_windows.cjs`, `frontend/src/main/ipc/ipc_query_broadcast.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` | SDK-managed WebSocket session, settings ACK gate, typed SDK/backend-event fan-out | IPC events to renderer |
| Main process local-runtime bridge | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/sidecar/local_runtime_supervisor.cjs`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts` | SDK-owned daemon launch/reuse, renderer-visible status, and Electron host helper routing | Tool/system/memory responses |
| Main process wakeword bridge | `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs` | Wakeword subprocess lifecycle + binary framing with helper-owned status/error parsing + payload normalization | Wakeword events to renderer/main IPC |
| Preload trust boundary | `frontend/src/preload.js` | Allowlisted IPC exposure only | `window.ipc` bridge methods |
| Renderer app shell | `frontend/src/renderer/app/App.jsx` | Provider stack, main layout routing | Chat/dashboard surfaces |
| Renderer chat runtime | `frontend/src/renderer/features/chat/hooks/useChatStream.ts`, `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts` | SDK-normalized conversation-event handling, state transitions, and current-turn projection consumption | Message list + overlay updates |
| SDK tool runtime | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` | SDK local-runtime coordination and result delivery | `tool-result` / `tool-bundle-result` send path |
| Renderer voice runtime | `frontend/src/renderer/features/voice/hooks/*` | Wakeword capture + gateway audio stream | Transcription/voice status updates |
| Local-runtime Python service | `frontend/src/main/python/local_backend.py` | JSON-RPC method routing + tool registry behind the local-runtime boundary | JSON-RPC result envelopes |
| Local-runtime wakeword service | `frontend/src/main/python/wakeword_service.py` | Wakeword model bootstrap + detection loop behind the local-runtime wakeword boundary | Length-prefixed detection frames |
| Landing app runtime | `frontend/src/landing/main.jsx` | Landing section composition | Static marketing UI |

## End-to-End Runtime Paths

### Query + Stream Path

| Phase | Module ownership |
| --- | --- |
| Query send from UI | `renderer/features/chat/hooks/useChatMessageSender.ts` |
| Renderer runtime call | `renderer/app/runtime/desktopLiveTurnRuntimeClient.ts` |
| Main relay and gating | `main/ipc.cjs`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` |
| Backend websocket send | SDK managed hosted session -> backend `/ws` |
| Stream event return | backend `/ws` -> SDK conversation runtime -> renderer `windie:conversation-event` + `windie:current-turn` |
| Renderer stream integration | `renderer/features/chat/hooks/useChatStream.ts` + `chatStore.ts` |

### Tool Execution Path

| Phase | Module ownership |
| --- | --- |
| Tool-call event detected | SDK managed hosted session |
| Tool execution orchestration | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` |
| SDK local runtime | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts` |
| Local-runtime request dispatch | SDK local runtime provider plus `main/sidecar/local_runtime_bridge.cjs` RPC mappers |
| Local-runtime tool execution | `main/python/tools/registry.py` + domain tool modules |
| Result normalization + send | SDK tool coordinator -> managed hosted session -> backend `tool-result` |

### Voice + Wakeword Path

| Phase | Module ownership |
| --- | --- |
| Wakeword capture | `renderer/features/voice/hooks/useWakewordDetection.ts` |
| Binary audio relay | `main/wakeword_bridge.cjs`, `main/wakeword_bridge_runtime.cjs` |
| Wakeword inference | `main/python/wakeword_service.py` |
| Detection relay back | `wakeword_bridge.cjs` -> renderer + `DesktopVoiceRuntimeClient.wakewordDetected` |
| Voice gateway stream | `renderer/features/voice/hooks/useVoiceMode.ts` |

### Memory + Transcript Path

| Phase | Module ownership |
| --- | --- |
| Transcript projection/session state | SDK conversation runtime plus renderer transcript/session facades |
| Store/search invoke | SDK `LocalRuntimeConversationStore` and SDK-shaped renderer commands |
| Local-runtime memory handlers | `main/python/{local_backend.py,local_backend_memory_handlers.py}` + `memory/local_store.py` |
| Optional semantic summarization | `memory/summarizer.py` + `core/{remote_api_client_base,remote_semantic_client}.py` |

## High-Risk Cross-Boundary Contracts

- IPC channel constants: `renderer/infrastructure/ipc/channels.ts` <-> `main/ipc.cjs` handlers.
- SDK conversation event/current-turn payload shape: SDK event contracts <-> renderer projection consumers.
- Tool schema parity: backend tool schemas <-> local-runtime executable schemas.
- Browser action compatibility: backend browser schema <-> local-runtime browser adapter/runtime.
- Wakeword frame protocol: `main/wakeword_bridge.cjs` + `main/wakeword_bridge_runtime.cjs` <-> `main/python/wakeword_service.py`.

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Full Functionality Inventory Reference](frontend_full_functionality_inventory_reference.md)
- [Frontend Functionality Capability Catalog Reference](frontend_functionality_capability_catalog_reference.md)
- [Frontend Capability to File Matrix Reference](frontend_capability_to_file_matrix_reference.md)
- [Frontend Module File Index Reference](frontend_module_file_index_reference.md)
- [Frontend IPC and Local-Runtime Contract Touchpoints Reference](frontend_ipc_and_sidecar_contract_touchpoints_reference.md)
