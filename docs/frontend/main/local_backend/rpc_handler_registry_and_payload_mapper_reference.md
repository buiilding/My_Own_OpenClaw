---
summary: "Reference for local-runtime bridge handler registration after removal of the direct chat/memory IPC mapper layer, plus test-backed host IPC/JSON-RPC contract invariants."
read_when:
  - When adding/removing local-runtime `ipcMain.handle` channels.
  - When debugging SDK local-runtime payload keys that do not map to local-runtime JSON-RPC params.
title: "Local-Runtime RPC Handler Registry Reference"
---

# Local-Runtime RPC Handler Registry and Payload-Mapper Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_display_bounds.cjs`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
- `tests/frontend/LocalRuntimeDisplayBounds.test.cjs`
- `tests/frontend/LocalRuntimeToolArgs.test.cjs`

## Handler Registration Topology

`initializeLocalRuntimeBridge(getWindows)` registers these handlers. The old
`initializeLocalRuntimeBridge(...)` export has been removed.

Active direct handlers:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `get-system-state`

Removed mapped chat/memory handlers:

- Electron main no longer registers the deleted compiled mapper layer for
  `search-chat-conversations`, `list-chat-conversations`,
  `list-episodic-memories`, `get-chat-events`,
  `list-semantic-memories`, `delete-episodic-memory`,
  `delete-chat-conversation`, `delete-semantic-memory`,
  `clear-local-memory`, `clear-chat-history`, `store-chat-event`,
  `replace-chat-conversation`, `rewrite-chat-conversation-after-event`, or
  `get-chat-conversation-revision`.
- Renderer-visible chat and memory capabilities use SDK-shaped
  `windie:invoke` commands and SDK local-runtime store calls, not direct
  sidecar-named IPC channels.
- Reintroducing a mapped channel for compatibility is not part of the current
  contract; add a typed SDK command or focused host channel at the owning layer.

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

- invalid non-object `system_use.arguments` values are intentionally passed through unchanged for local-runtime validation ownership
- non-shell tools receive deep-cloned object args
- non-object args normalize to `{}`
- screenshot tools may receive injected fallback `display_bounds` derived from
  main-process display-affinity runtime when explicit bounds are missing
- `run_shell_command` arguments are not augmented with a frontend-selected
  `sudo_auth_mode`; Linux `sudo ...` rewriting is owned by the local-runtime shell
  tool

Display-affinity fallback precedence for screenshot local tool calls:

1. resolve affinity through `resolveActiveSurfaceDisplayAffinityForWindows(...)` with sender webContents + `getWindows()` adapter
2. wrapper precedence: visible sender surface (chat/main) -> visible chat/main surface -> stored active query-origin affinity

Timeout tiers:

- `browser` -> 120s
- default -> 30s

Special wrapper:

- `screenshot` runs inside `withHiddenWindowForScreenshot(...)`, which currently calls the local-runtime screenshot task directly

Response normalization:

- backend `result.success === false` -> `{ success:false, error:result.error }`
- backend success -> `{ success:true, data:result.data || result }`
- thrown bridge errors -> `{ success:false, error:getErrorMessage(error) }`

Screenshot result materialization:

- only screenshot tool results run screenshot materialization
- if the local-runtime screenshot tool returns owned `data.screenshot_path` under `${os.tmpdir()}/desktop-runtime-screenshots` with a `desktop-runtime-shot-` filename, bridge attempts artifact upload (`POST /api/artifacts/`)
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

## SDK Local-Runtime Payload Contract

Chat and memory JSON-RPC params are now built behind SDK local-runtime store
interfaces. Preserve these rules there:

- renderer-facing command fields stay SDK-shaped and camelCase
- Python JSON-RPC method params stay snake_case
- command validation belongs at the SDK/renderer facade boundary
- local-runtime Python handler signatures stay explicit so JSON-RPC validation can reject
  missing or unexpected params
- fallback aliases are allowed only when both names are intentionally public and
  covered by focused tests

Removed mapping:

- `search-memory` and `mapSearchMemoryPayload(...)` are not registered. Prompt
  memory lookup is SDK-owned and calls local-runtime `search_memory_by_embedding`
  with an SDK-provided embedding.

## Test-Backed Invariants

From `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`:

- removed mapped chat/memory IPC channels are not registered by Electron main
- completed-turn memory writes are SDK-owned and do not have a renderer-visible `store-memory` IPC channel
- screenshot path materialization returns artifact refs on success and inline fallback on upload failures
- screenshot tool request path injects active display-affinity bounds when sender window is hidden

## Drift and Regression Hotspots

1. channel constants drift between preload allowlist and `ipcMain.handle` registration
2. SDK command payload keys drift from SDK local-runtime store params
3. method name drift (`delete_semantic_memory`, `conversation.append_event`, etc.) breaking local-runtime routing silently
4. wrapper-specific behavior drift (`screenshot` visibility runtime wrapper ownership, browser timeout tier)

## Related Pages

- [Frontend Main Local-Runtime Docs Hub](README.md)
- [Local Runtime JSON-RPC Change Workflow](../../sidecar/local_backend_jsonrpc_change_workflow.md)
- [Local-Runtime Process Lifecycle, Readiness, and Request-Correlation Reference](process_lifecycle_readiness_and_request_correlation_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
