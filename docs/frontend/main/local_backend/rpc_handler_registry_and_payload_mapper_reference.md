---
summary: "Deep reference for local-backend bridge handler registration, channel-to-method mapping, payload normalization rules, and test-backed IPC/JSON-RPC contract invariants."
read_when:
  - When adding/removing local-backend `ipcMain.handle` channels or changing `COMPILED_RPC_HANDLER_DEFINITIONS`.
  - When debugging renderer invoke payload keys that do not map to sidecar JSON-RPC params.
title: "Local-Backend RPC Handler Registry and Payload-Mapper Reference"
---

# Local-Backend RPC Handler Registry and Payload-Mapper Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_display_bounds.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_screenshot_attachment.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_window_visibility.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/LocalBackendBridgeDisplayBounds.test.cjs`
- `tests/frontend/LocalBackendBridgeToolArgs.test.cjs`

## Handler Registration Topology

`initializeLocalBackendBridge(getWindows)` registers:

Direct handlers:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `get-system-state`

Mapped handlers via `registerMappedRpcHandlers(registerRpcHandler, COMPILED_RPC_HANDLER_DEFINITIONS)`:

- `search-chat-conversations`
- `list-chat-conversations`
- `list-episodic-memories`
- `get-chat-events`
- `list-semantic-memories`
- `delete-episodic-memory`
- `delete-chat-conversation`
- `delete-semantic-memory`
- `clear-local-memory`
- `clear-chat-history`
- `store-chat-event`
- `replace-chat-conversation`
- `rewrite-chat-conversation-after-event`
- `get-chat-conversation-revision`

`registerRpcHandler` contract:

- each channel maps to one JSON-RPC method with mapped params
- every mapped path uses `sendRequestOrError(...)` for canonical error envelope fallback

## Direct Handler Semantics

### Scoped host tool channels

Renderer-callable host channels are intentionally narrow:

- `capture-screenshot-attachment` maps to local `screenshot`
- `read-attachment-file` maps to local `read_file`
- `run-browser-action` maps to local `browser`

Dispatch:

- JSON-RPC method: `execute_tool`
- params are built by Electron main before entering the shared local tool
  runtime; renderer code cannot provide arbitrary `toolName` values

Tool-arg normalization behavior:

- invalid non-object `system_use.arguments` values are intentionally passed through unchanged for sidecar validation ownership
- non-shell tools receive deep-cloned object args
- non-object args normalize to `{}`
- screenshot tools may receive injected fallback `display_bounds` derived from
  main-process display-affinity runtime when explicit bounds are missing
- `run_shell_command` arguments are not augmented with a frontend-selected
  `sudo_auth_mode`; Linux `sudo ...` rewriting is owned by the sidecar shell
  tool

Display-affinity fallback precedence for screenshot local tool calls:

1. resolve affinity through `resolveActiveSurfaceDisplayAffinityForWindows(...)` with sender webContents + `getWindows()` adapter
2. wrapper precedence: visible sender surface (chat/main) -> visible chat/main surface -> stored active query-origin affinity

Timeout tiers:

- `browser` -> 120s
- default -> 30s

Special wrapper:

- `screenshot` runs inside `withHiddenWindowForScreenshot(...)` (platform runtime may no-op or apply hide/show guards)

Response normalization:

- backend `result.success === false` -> `{ success:false, error:result.error }`
- backend success -> `{ success:true, data:result.data || result }`
- thrown bridge errors -> `{ success:false, error:getErrorMessage(error) }`

Screenshot result materialization:

- only screenshot tool results run screenshot materialization
- if the screenshot sidecar returns owned `data.screenshot_path` under `${os.tmpdir()}/windieos-screenshots` with a `windie-shot-` filename, bridge attempts artifact upload (`POST /api/artifacts/`)
- success path injects `screenshot_ref` + `screenshot_url`
- upload failure falls back to inline base64 `screenshot`
- bridge deletes accepted temporary screenshot files and removes `screenshot_path` before returning
- non-screenshot tools that return `screenshot_path` have the local path stripped without file read, upload, inline fallback, or deletion

### `get-system-state`

Input payload:

- optional `{ fields }`

Dispatch:

- JSON-RPC method: `get_system_state`
- params only includes `fields` key when provided

Return normalization:

- sidecar `{ success:false }` or thrown request error -> `null`
- otherwise `result.data || result`

## Payload Mapper Runtime Contract

`createPayloadMapper(fieldMap)` compile step supports two mapping types:

1. direct string source key
2. function mapper `(payload) => value`

`getPayloadObject(payload)` hardening:

- non-object payload becomes `{}` instead of throwing

Guarantee:

- mapped object includes every target key declared in field map (values may be `undefined` or `null`)

## Compiled Channel-to-Method Mapping Details

`COMPILED_RPC_HANDLER_DEFINITIONS` map highlights:

- `search-chat-conversations` -> `search_chat_conversations` with `{ query, userId, limit } -> { query, user_id, limit }`
- `list-chat-conversations` -> `list_chat_conversations` with `{ userId, limit, recordKind } -> { user_id, limit, record_kind }`
- `list-episodic-memories` -> `list_episodic_memories` with `{ userId, limit } -> { user_id, limit }`
- `get-chat-events` -> `get_chat_events` with `conversation_id = conversationId ?? null`
- `list-semantic-memories` -> `list_semantic_memories` with `{ userId, limit } -> { user_id, limit }`
- `delete-episodic-memory` -> `delete_episodic_memory` with `{ memoryId } -> { memory_id }`
- `delete-chat-conversation` -> `delete_chat_conversation` with null-safe `conversation_id`
- `delete-semantic-memory` -> `delete_semantic_memory` with `{ memoryId } -> { memory_id }`
- `clear-local-memory` -> `clear_local_memory` with `{ userId } -> { user_id }`
- `clear-chat-history` -> `clear_chat_history` with `{ userId } -> { user_id }`
- `store-chat-event` -> `store_chat_event` mapping transcript metadata (`conversation_ref`, `message_type`, `tool_name`, `correlation_id`, `message_index`, `model_id`, `model_provider`)
- `replace-chat-conversation` -> `replace_chat_conversation` with mapped event rows
- `rewrite-chat-conversation-after-event` -> `rewrite_chat_conversation_after_event` with mapped replacement event payload
- `get-chat-conversation-revision` -> `get_chat_conversation_revision` with `{ userId, conversationId } -> { user_id, conversation_id }`

Removed mapping:

- `search-memory` and `mapSearchMemoryPayload(...)` are not registered. Prompt
  memory lookup is SDK-owned and calls sidecar `search_memory_by_embedding`
  with an SDK-provided embedding.

## Test-Backed Invariants

From `tests/frontend/LocalBackendBridge.rpc.test.cjs`:

- mapped channels send expected JSON-RPC method names and param keys
- non-object payloads do not crash mapper paths (`list-chat-conversations` sends `{}`)
- completed-turn memory writes are SDK-owned and do not have a renderer-visible `store-memory` IPC channel
- `get-chat-events` emits explicit `conversation_id: null` when `conversationId` absent
- `store-chat-event` errors normalize to `{ success:false, error }`
- `WINDIE_BACKEND_HTTP_URL` env and `NODE_OPTIONS --no-deprecation` propagation are validated at spawn
- deprecation stderr lines are filtered while normal stderr lines remain logged
- screenshot path materialization returns artifact refs on success and inline fallback on upload failures
- screenshot tool request path injects active display-affinity bounds when sender window is hidden

## Drift and Regression Hotspots

1. channel constants drift between preload allowlist and `ipcMain.handle` registration
2. renamed payload keys in renderer invoke calls not mirrored in mapper field map
3. method name drift (`delete_semantic_memory`, `store_chat_event`, etc.) breaking sidecar routing silently
4. wrapper-specific behavior drift (`screenshot` visibility runtime wrapper ownership, browser timeout tier)

## Related Pages

- [Frontend Main Local-Backend Docs Hub](README.md)
- [Local Backend JSON-RPC Change Workflow](../../sidecar/local_backend_jsonrpc_change_workflow.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](process_lifecycle_readiness_and_request_correlation_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
