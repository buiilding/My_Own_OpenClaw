---
summary: "Deep reference for local-backend bridge handler registration, channel-to-method mapping, payload normalization rules, and test-backed IPC/JSON-RPC contract invariants."
read_when:
  - When adding/removing local-backend `ipcMain.handle` channels or changing `COMPILED_RPC_HANDLER_DEFINITIONS`.
  - When debugging renderer invoke payload keys that do not map to sidecar JSON-RPC params.
title: "Local-Backend RPC Handler Registry and Payload-Mapper Reference"
---

# Local-Backend RPC Handler Registry and Payload-Mapper Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_display_bounds.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs`
- `frontend/src/main/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/LocalBackendBridgeDisplayBounds.test.cjs`
- `tests/frontend/LocalBackendBridgeToolArgs.test.cjs`

## Handler Registration Topology

`initializeLocalBackendBridge(getWindows)` registers:

Direct handlers:

- `execute-tool`
- `get-system-state`
- `search-memory`

Mapped handlers via `registerMappedRpcHandlers(registerRpcHandler, COMPILED_RPC_HANDLER_DEFINITIONS)`:

- `search-conversations`
- `list-conversations`
- `list-episodic-memories`
- `get-conversation`
- `list-semantic-memories`
- `delete-episodic-memory`
- `delete-conversation`
- `delete-semantic-memory`
- `store-memory`
- `store-transcript`

`registerRpcHandler` contract:

- each channel maps to one JSON-RPC method with mapped params
- every mapped path uses `sendRequestOrError(...)` for canonical error envelope fallback

## Direct Handler Semantics

### `execute-tool`

Input payload:

- `{ toolName, args }`

Dispatch:

- JSON-RPC method: `execute_tool`
- params:
  - `tool_name = toolName`
  - `args = resolveToolArgs(toolName, args, getFrontendConfig)`

Tool-arg normalization behavior:

- `run_shell_command` always receives derived `sudo_auth_mode`
  - `native` when frontend config has `agent_full_sudo_enabled=true`
  - `os_prompt` otherwise (including config-read failure)
- `system_use` with nested `tool: "run_shell_command"` and object `arguments` receives the same derived `sudo_auth_mode` inside nested `arguments`
- invalid non-object `system_use.arguments` values are intentionally passed through unchanged for sidecar validation ownership
- non-shell tools receive deep-cloned object args
- non-object args normalize to `{}`
- screenshot tools may receive injected fallback `display_bounds` derived from main-process display-affinity runtime when explicit bounds are missing

Display-affinity fallback precedence for screenshot `execute-tool` calls:

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

- if sidecar returns `data.screenshot_path`, bridge attempts artifact upload (`POST /api/artifacts/`)
- success path injects `screenshot_ref` + `screenshot_url`
- upload failure falls back to inline base64 `screenshot`
- bridge always deletes temp screenshot path and removes `screenshot_path` field before returning

### `get-system-state`

Input payload:

- optional `{ fields }`

Dispatch:

- JSON-RPC method: `get_system_state`
- params only includes `fields` key when provided

Return normalization:

- sidecar `{ success:false }` or thrown request error -> `null`
- otherwise `result.data || result`

### `search-memory`

Input payload:

- object with `query`, `user_id`, `limit`, `memory_type`, optional exclusion key

Dispatch:

- JSON-RPC method: `search_memory`
- params built by `mapSearchMemoryPayload(...)`

Exclusion key fallback:

- accepts either `excludeConversationId` or `exclude_conversation_id`
- both map to `exclude_conversation_id`

## Payload Mapper Runtime Contract

`createPayloadMapper(fieldMap)` compile step supports three mapping types:

1. direct string source key
2. fallback source-key array (first defined key wins)
3. function mapper `(payload) => value`

`getPayloadObject(payload)` hardening:

- non-object payload becomes `{}` instead of throwing

Guarantee:

- mapped object includes every target key declared in field map (values may be `undefined` or `null`)

## Compiled Channel-to-Method Mapping Details

`COMPILED_RPC_HANDLER_DEFINITIONS` map highlights:

- `search-conversations` -> `search_conversations` with `{ query, userId, limit } -> { query, user_id, limit }`
- `list-conversations` -> `list_conversations` with `{ userId, limit, recordKind } -> { user_id, limit, record_kind }`
- `list-episodic-memories` -> `list_episodic_memories` with `{ userId, limit } -> { user_id, limit }`
- `get-conversation` -> `get_conversation` with `conversation_id = conversationId ?? null`
- `list-semantic-memories` -> `list_semantic_memories` with `{ userId, limit } -> { user_id, limit }`
- `delete-episodic-memory` -> `delete_episodic_memory` with `{ memoryId } -> { memory_id }`
- `delete-conversation` -> `delete_conversation` with null-safe `conversation_id`
- `delete-semantic-memory` -> `delete_semantic_memory` with `{ memoryId } -> { memory_id }`
- `store-memory` -> `store_memory` with camelCase-to-snake_case memory write fields
- `store-transcript` -> `store_transcript` mapping transcript metadata (`conversation_ref`, `message_type`, `tool_name`, `correlation_id`, `message_index`, `model_id`, `model_provider`)

## Test-Backed Invariants

From `tests/frontend/LocalBackendBridge.rpc.test.cjs`:

- mapped channels send expected JSON-RPC method names and param keys
- non-object payloads do not crash mapper paths (`list-conversations` sends `{}`)
- `search-memory` accepts both camelCase and snake_case exclusion keys
- `get-conversation` emits explicit `conversation_id: null` when `conversationId` absent
- `store-transcript` errors normalize to `{ success:false, error }`
- `WINDIE_BACKEND_HTTP_URL` env and `NODE_OPTIONS --no-deprecation` propagation are validated at spawn
- deprecation stderr lines are filtered while normal stderr lines remain logged
- screenshot path materialization returns artifact refs on success and inline fallback on upload failures
- screenshot tool request path injects active display-affinity bounds when sender window is hidden
- `system_use` wrapper payloads route nested run-shell sudo-mode rewriting only when wrapper target tool is `run_shell_command`

## Drift and Regression Hotspots

1. channel constants drift between preload allowlist and `ipcMain.handle` registration
2. renamed payload keys in renderer invoke calls not mirrored in mapper field map
3. method name drift (`delete_semantic_memory`, `store_transcript`, etc.) breaking sidecar routing silently
4. wrapper-specific behavior drift (`screenshot` visibility runtime wrapper ownership, browser timeout tier)

## Related Pages

- [Frontend Main Local-Backend Docs Hub](README.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](process_lifecycle_readiness_and_request_correlation_reference.md)
- [Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference](tool_arg_sudo_auth_mode_resolution_and_config_guard_contract_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
