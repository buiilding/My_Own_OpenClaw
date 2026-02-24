---
summary: "Local backend JSON-RPC reference for Electron main <-> Python sidecar: request envelope, registered methods, renderer IPC mapping, and timeout/error semantics."
read_when:
  - When adding/changing sidecar JSON-RPC methods or bridge payload mappers.
  - When debugging execute-tool/search-memory/transcript persistence failures between Electron and Python sidecar.
title: "Local Backend JSON-RPC Reference"
---

# Local Backend JSON-RPC Reference

## Core Modules

- Electron bridge: `frontend/src/main/local_backend_bridge.cjs`
- IPC->method mappers: `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- Sidecar service: `frontend/src/main/python/local_backend.py`
- JSON-RPC protocol implementation: `frontend/src/main/python/core/ipc_protocol.py`

## Transport Model

Process topology:

- main process spawns `local_backend.py` via resolved Python runtime path.
- IPC over sidecar stdin/stdout, one JSON object per line.
- main bridge tracks pending requests by UUID and resolves/rejects with timeout.

Request envelope from main:

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "<method_name>",
  "params": { ... }
}
```

Response envelope from sidecar:

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "result": { ... }
}
```

or

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "error": { "code": -32603, "message": "..." }
}
```

## Sidecar Method Registry (`LocalBackend._initialize_methods`)

Registered methods:

- `ping`
- `get_status`
- `execute_tool`
- `get_system_state`
- `search_memory`
- `store_memory`
- `list_conversations`
- `get_conversation`
- `list_semantic_memories`
- `delete_conversation`
- `delete_semantic_memory`
- `store_transcript`

Method validation behavior:

- JSON-RPC protocol validates `jsonrpc == "2.0"`, method exists, and params bind to handler signature.
- invalid method or params return JSON-RPC errors (`METHOD_NOT_FOUND`, `INVALID_PARAMS`, etc.).

## Renderer IPC -> JSON-RPC Mapping

### Direct handlers

`local_backend_bridge.cjs` direct mappings:

- `execute-tool` -> `execute_tool`
- `get-system-state` -> `get_system_state`
- `search-memory` -> `search_memory`

Special behavior:

- `execute-tool` timeout is `120000ms` for `browser`, else `30000ms`.
- Linux screenshot path hides overlay windows during screenshot tool call to avoid self-capture artifacts.

### Mapped handlers (`COMPILED_RPC_HANDLER_DEFINITIONS`)

From `local_backend_bridge_rpc_mappers.cjs`:

- `list-conversations` -> `list_conversations`
- `get-conversation` -> `get_conversation`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-conversation` -> `delete_conversation`
- `delete-semantic-memory` -> `delete_semantic_memory`
- `store-memory` -> `store_memory`
- `store-transcript` -> `store_transcript`

Mapper details:

- camelCase renderer keys are converted to snake_case sidecar params.
- fallback key resolution is used where both naming styles can arrive.
- payloads are normalized to plain objects before sending.

## Memory-specific Method Semantics

### `search_memory`

Params:

- `query`
- `user_id` (default `default_user` if caller omits)
- `limit` (default `5`)
- `memory_type` (optional filter)
- `exclude_conversation_id` (optional)

Returns:

- `{ success: true, data: { memories: { episodic:[], semantic:[] } } }` on success

### `store_transcript`

Key params:

- `content`, `user_id`, `conversation_ref`
- `role`, `message_type`, `tool_name`, `correlation_id`
- `message_index`, `model_id`, `model_provider`
- `screenshot`, `timestamp`

Behavior:

- writes transcript record to local memory store as episodic `record_kind="transcript"`
- selectively skips embedding for non-semantic-candidate rows
- increments summarization pending count only for assistant terminal turns

## Tool Execution Semantics (`execute_tool`)

Sidecar path:

1. `LocalBackend._handle_execute_tool` delegates to `ToolRegistry.execute_tool(tool_name, args)`.
2. registry dispatches sync/async tool functions and normalizes legacy dict outputs to `ToolResult`.
3. response payload is serialized as standardized `{ success, data?, error? }`.

Failure handling:

- unknown tool -> `ToolResult.error_result("Tool not found: ...")`
- invalid args type -> error result
- runtime exceptions -> error result with logged traceback

## Bridge Timeout and Disconnect Behavior

Main bridge defaults:

- request timeout: `30000ms` (or per-request override)
- on timeout: pending entry removed and promise rejected
- on subprocess exit/error: all pending requests rejected, ready state reset

Readiness flow:

- bridge sends repeated `ping` checks on startup
- success marks `isPythonReady=true`
- max retry exhaustion still marks ready in fallback mode to avoid deadlock, with warnings logged

## Status and Health Diagnostics

`get_status` method includes:

- sidecar running flags
- memory store init status
- tool registry status and registered tool list

Main process emits local backend status events:

- `local-backend-status { ready, error? }`

(Used primarily for diagnostics and startup observability in main process.)
