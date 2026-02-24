---
summary: "Frontend documentation hub covering Electron main process, renderer runtime, tool execution services, and Python sidecar behavior."
read_when:
  - When changing frontend architecture across main/renderer/sidecar boundaries.
  - When tracing query/tool message flow from UI to backend and back.
title: "Frontend Functionality Map"
---

# Frontend Functionality Map

This hub documents WindieOS frontend implementation details across Electron main process, React renderer, and Python sidecar runtime.

## Deep Pages

### Main Process

- [Main Docs Hub](main/README.md)
- [Electron Main and IPC](main/ELECTRON_MAIN_AND_IPC.md)
- [Window and Overlay Lifecycle](main/WINDOW_AND_OVERLAY_LIFECYCLE.md)
- [Runtime Paths and Endpoints](main/RUNTIME_PATHS_AND_ENDPOINTS.md)
- [Query Payload and Relay Reference](main/QUERY_PAYLOAD_AND_RELAY_REFERENCE.md)

### Renderer

- [Renderer Docs Hub](renderer/README.md)
- [Renderer Runtime](renderer/RENDERER_RUNTIME.md)
- [Feature Module Matrix](renderer/FEATURE_MODULE_MATRIX.md)
- [Chat Stream and Tool Execution Reference](renderer/CHAT_STREAM_AND_TOOL_EXECUTION_REFERENCE.md)

### Runtime

- [Runtime Docs Hub](runtime/README.md)
- [Tool Execution and Streaming](runtime/TOOL_EXECUTION_AND_STREAMING.md)
- [Stream Event State Machine](runtime/STREAM_EVENT_STATE_MACHINE.md)
- [Config Sync and Settings Lifecycle Reference](runtime/CONFIG_SYNC_AND_SETTINGS_LIFECYCLE_REFERENCE.md)

### Sidecar

- [Sidecar Docs Hub](sidecar/README.md)
- [Python Sidecar and Memory](sidecar/PYTHON_SIDECAR_AND_MEMORY.md)
- [Sidecar Tool Catalog and Execution Model](sidecar/TOOL_CATALOG_AND_EXECUTION_MODEL.md)
- [Memory Pipeline and Summarization](sidecar/MEMORY_PIPELINE_AND_SUMMARIZATION.md)
- [Browser Automation Stack](sidecar/BROWSER_AUTOMATION_STACK.md)
- [Local Backend JSON-RPC Reference](sidecar/LOCAL_BACKEND_JSONRPC_REFERENCE.md)

### Contracts

- [Contracts Docs Hub](contracts/README.md)
- [IPC Channels and Event Contracts](contracts/IPC_CHANNELS_AND_EVENT_CONTRACTS.md)
- [IPC Channel and Handler Reference](contracts/IPC_CHANNEL_AND_HANDLER_REFERENCE.md)

## Frontend Code Layout

- `frontend/src/main`: Electron main process, backend/ws bridge, wakeword bridge, query payload enrichment
- `frontend/src/preload.js`: sandbox-safe IPC exposure to renderer
- `frontend/src/renderer`: React app, contexts, feature modules, infrastructure services
- `frontend/src/main/python`: local backend sidecar, memory service, wakeword subprocess, tool implementations
- `frontend/src/landing`: landing-page frontend variant

## End-to-End Runtime Path (Condensed)

1. Renderer sends query via typed IPC bridge.
2. Main process gates initial settings sync, enriches query with system context + memory search.
3. Main process forwards query over backend WebSocket.
4. Backend streams events back; main relays to renderer.
5. Renderer stream hook updates chat state and transcript.
6. Tool events trigger `ToolExecutionService`, which executes tools via local sidecar bridge.
7. Tool results (single or bundle) are posted back to backend for next loop iteration.
