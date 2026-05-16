---
summary: "Sidecar and local tool channel guide covering SDK main-runtime execution, sidecar daemon tools, display-only renderer events, and backend tool-result ingress."
read_when:
  - When changing local tool execution, sidecar daemon routing, renderer tool-call display behavior, shell/filesystem/browser/computer actions, or local memory calls.
  - When debugging a tool call that is visible in backend streaming but fails before, during, or after local sidecar execution.
title: "Sidecar and Tool Channels"
---

# Sidecar and Tool Channels

Local tools cross every WindieOS runtime boundary. The backend decides what the model can ask for, but the frontend and sidecar execute local machine actions.

## End-to-End Tool Channel

```mermaid
sequenceDiagram
    participant Backend as Backend agent loop
    participant SDK as SDK main runtime
    participant Main as Electron main
    participant Renderer as Renderer display surfaces
    participant Sidecar as Python sidecar daemon

    Backend->>SDK: /ws tool-call
    SDK->>Sidecar: HTTP /execute-tool
    Sidecar-->>SDK: tool result
    SDK->>Backend: /ws tool-result
    SDK->>Main: display-only backend event
    Main->>Renderer: from-backend tool-call (display-only)
```

## Ownership Split

| Layer | Owns | Code roots |
| --- | --- | --- |
| Backend | model-facing tool schema, policy filtering, parser validation, tool-call events, result waiting, history commit | `backend/src/tools`, `backend/src/agent/tools`, `backend/src/api/processing/formatters/actions`, `backend/src/api/handlers/tool_results.py` |
| SDK main runtime | backend websocket ownership, local tool-call routing, `tool-result` / `tool-bundle-result` return | `frontend/src/main/windie_sdk_runtime.cjs`, `frontend/src/main/ipc/ipc_sdk_tool_router.cjs` |
| Renderer | tool-call display, transcript/chat state, stale-turn display guards; no default local execution for SDK-owned backend tool events | `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`, `frontend/src/renderer/infrastructure/services/ToolExecution*.ts` |
| Electron main | renderer IPC, sidecar daemon bridge, screenshot artifact upload, system-state bridge, display-only backend event fan-out | `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/sidecar_daemon_manager.cjs`, `frontend/src/main/ipc.cjs` |
| Python sidecar daemon | executable tool implementations and dynamic tool registry | `frontend/src/main/python/sidecar_daemon.py`, `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/tools/**`, `frontend/src/main/python/memory/**` |

## Main IPC Channels

Sidecar-facing IPC channels are documented in [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md).

Common local channels:

- `execute-tool`: run a sidecar executable tool
- `get-system-state`: collect local OS/window/runtime state
- `search-memory`: query local memory
- `search-conversations`: query transcript conversation index
- `store-memory`, `store-transcript`, and list/delete memory channels

Renderer code should call the typed IPC bridge instead of raw Electron APIs.

## Sidecar Daemon Boundary

The canonical local executor is the token-auth sidecar daemon. Electron main starts or reuses it through `sidecar_daemon_manager.cjs`, then local execution uses daemon HTTP endpoints such as `/execute-tool`.

The older line-oriented JSON-RPC process remains for local memory/service IPC while those services are being carried behind the daemon boundary. It is intentionally separate from hosted backend HTTP/WebSocket contracts.

Sidecar method families:

- computer tools: mouse, keyboard, screenshot, scroll, window operations
- browser tools: dedicated browser launch/control/snapshot/file helpers
- filesystem tools: read/replace/path handling
- shell/process tools: command execution and process sessions
- system tools: waits, windows, system stats
- memory tools: local transcript/episodic/semantic storage and search
- wakeword service: separate subprocess protocol, not the generic JSON-RPC tool channel

Read next:

- [Frontend Sidecar Docs Hub](../frontend/sidecar/README.md)
- [Local-Backend Process Lifecycle Change Workflow](../frontend/main/local_backend/process_lifecycle_change_workflow.md)
- [Local Backend JSON-RPC Change Workflow](../frontend/sidecar/local_backend_jsonrpc_change_workflow.md)
- [Frontend Sidecar Tools Docs Hub](../frontend/sidecar/tools/README.md)
- [Python Sidecar Runtime and Memory](../frontend/sidecar/python_sidecar_and_memory.md)
- [Sidecar JSON-RPC Protocol Reference](../frontend/sidecar/core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)

## Tool Result Return Path

After sidecar execution, the SDK main runtime returns results to the backend using the normal `/ws` tool-result path. The renderer receives display-only tool-call events for chat/transcript/overlay state and should not execute events marked `metadata.skip_frontend_execution`.

The desktop `ChatProvider` does not mount renderer-side local execution by
default. `useToolRunner` remains as an explicit legacy/test harness for
non-SDK-owned events, not the normal desktop execution path.

Result path rules:

- use `tool-result` for single calls.
- use `tool-bundle-result` for bundled/atomic tool execution.
- preserve request ids and tool-call ids expected by backend waiting/history code.
- preserve screenshot/artifact refs when tool output includes images.
- normalize local failures into model-visible tool outputs rather than silently dropping the call.

Read next:

- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Backend Tool Result Ingress Reference](../backend/tools/tool_result_ingress_and_storage_reference.md)
- [Frontend Tool Execution Service and Hook Runtime Reference](../frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md)

## Common Failure Routing

| Symptom | Owner to inspect |
| --- | --- |
| model never sees tool | backend tool schema/policy |
| backend emits tool-call but no local action happens | SDK tool router or sidecar daemon bridge |
| renderer executes a backend tool-call twice | missing `skip_frontend_execution` display-only marker |
| sidecar returns error before action | sidecar tool validation/runtime |
| action succeeds but model does not continue | tool-result ingress, request id, or history commit path |
| screenshot path exists but image missing in chat | artifact upload/materialization path |

## Validation

Use the narrowest test set for the changed boundary:

- backend schema/policy/formatter/tool-result tests for model-facing changes
- SDK/IPC tool-router tests for backend tool-call routing/result projection changes
- renderer tool-runner tests for display-only event behavior
- main-process IPC/local-backend bridge tests for channel mapping changes
- sidecar pytest tests for executable tool behavior
- parity tests when backend schema and sidecar executable payloads must stay aligned

Run `./bin/docs-list` after docs updates.
