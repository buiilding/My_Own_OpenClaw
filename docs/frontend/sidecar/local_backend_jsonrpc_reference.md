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
- Request transport: `frontend/src/main/local_backend_bridge_request_transport.cjs`
- Execute-tool runtime: `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`
- Timeout policy: `frontend/src/main/local_backend_bridge_timeout_policy.cjs`
- IPC->method mappers: `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- Sidecar service: `frontend/src/main/python/local_backend.py`
- Sidecar memory handler mixin: `frontend/src/main/python/local_backend_memory_handlers.py`
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
- `list_episodic_memories`
- `get_conversation`
- `list_semantic_memories`
- `delete_episodic_memory`
- `delete_conversation`
- `delete_semantic_memory`
- `store_transcript`

Method validation behavior:

- JSON-RPC protocol validates `jsonrpc == "2.0"`, method exists, and params bind to handler signature.
- invalid method or params return JSON-RPC errors (`METHOD_NOT_FOUND`, `INVALID_PARAMS`, etc.).
- memory method implementations are provided via `LocalBackendMemoryHandlersMixin` to keep runtime loop/lifecycle and memory RPC concerns separated.

## Renderer IPC -> JSON-RPC Mapping

### Direct handlers

`local_backend_bridge.cjs` direct mappings:

- `execute-tool` -> `execute_tool`
- `get-system-state` -> `get_system_state`
- `search-memory` -> `search_memory`

Special behavior:

- `execute-tool` timeout is resolved by `local_backend_bridge_timeout_policy.cjs`: `120000ms` for `browser`, else `60000ms`.
- screenshot tool path is wrapped by platform screenshot visibility runtime; current main-process runtime behavior is pass-through and Linux hide/show ownership lives in renderer capture orchestration.

### Mapped handlers (`COMPILED_RPC_HANDLER_DEFINITIONS`)

From `local_backend_bridge_rpc_mappers.cjs`:

- `list-conversations` -> `list_conversations`
- `list-episodic-memories` -> `list_episodic_memories`
- `get-conversation` -> `get_conversation`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-episodic-memory` -> `delete_episodic_memory`
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
- `episodic_limit` (optional prompt-injection episodic budget)
- `semantic_limit` (optional prompt-injection semantic budget)
- `semantic_min_score` (optional semantic similarity floor, `0..1`)

Validation behavior:

- requires non-empty string `query` (trimmed)
- validates optional `memory_type` as case-insensitive `episodic|semantic`
- rejects non-string `memory_type`
- validates optional `limit` / `episodic_limit` / `semantic_limit` as positive integers
- validates optional `semantic_min_score` as numeric `0..1`

Returns:

- `{ success: true, data: { memories: { episodic:[], semantic:[] } } }` on success
- episodic retrieval detail:
  - default handler pipeline is ordered: `memory_store.search(...)` -> `exclude_conversation_results(...)` -> `group_memory_texts(...)`.
  - when balanced retrieval params are supplied without an explicit `memory_type`, handler runs separate episodic and semantic searches, applies active-conversation exclusion to episodic, applies `semantic_min_score` to semantic, then groups the merged result buckets.
  - `LocalMemoryStore.search(...)` enriches transcript user hits with companion assistant replies (primary DB lookup by conversation + `message_index`, fallback to top-k assistant candidates).
  - `group_memory_texts(...)` then prefers explicit interaction-style rows, else synthesizes transcript user+assistant pairs, else falls back to raw episodic text.
  - net effect: prompt episodic injection prefers full `User + Assistant` entries and keeps result count stable (rewrites row text without appending rows).

### `store_transcript`

Key params:

- `content`, `user_id`, `conversation_ref`
- `role`, `message_type`, `tool_name`, `correlation_id`
- `message_index`, `model_id`, `model_provider`
- `screenshot`, `timestamp`

Behavior:

- writes transcript record to local memory store as episodic `record_kind="transcript"`
- selectively skips embedding for non-semantic-candidate rows
- does not mutate semantic-summarizer pending counters (run gating is DB interaction-row based)

### `store_memory`

Required params:

- `user_query`
- `assistant_response`

Optional params:

- `memory_type` (`episodic` default; allowlist: `episodic|semantic`)
- `user_id` (`default_user` default)
- `session_id`

Validation behavior:

- rejects non-string `user_query` / `assistant_response`
- rejects non-string `memory_type` when provided
- trims accepted string fields and rejects blank query/response payloads

Behavior:

- delegates interaction writes to shared `memory.operations.store_interaction_memory(...)`
- helper persists combined interaction text as `record_kind="interaction"` rows (semantic summarizer source rows)

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

- request timeout: `60000ms` (or per-request override)
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

## Related Pages

- [Sidecar Core Docs Hub](core/README.md)
- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Memory Search Grouping and Transcript Pair Synthesis Contract Reference](memory/memory_search_grouping_and_transcript_pair_synthesis_contract_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
