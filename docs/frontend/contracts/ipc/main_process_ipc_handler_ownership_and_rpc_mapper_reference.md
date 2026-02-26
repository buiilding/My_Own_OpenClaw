---
summary: "Deep reference for main-process IPC handler ownership across `ipc.cjs` + IPC helper modules, `index.cjs`, permission/wakeword handlers, local-backend bridge, and mapped sidecar RPC channels."
read_when:
  - When adding/removing `ipcMain.on/handle` registrations, including permission onboarding channels.
  - When debugging renderer invoke/send calls that do not reach expected main/sidecar behavior.
title: "Main-Process IPC Handler Ownership and RPC Mapper Reference"
---

# Main-Process IPC Handler Ownership and RPC Mapper Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`
- `frontend/src/main/permission_service.cjs`

## Registration Topology

Main-process handler registration is split by responsibility:

- transport/backend relay orchestration and config persistence: `ipc.cjs`
- relay helper ownership for message processing/fan-out/synthetic query events: `ipc_runtime_helpers.cjs`, `ipc_renderer_windows.cjs`, `ipc_query_broadcast.cjs`, `ipc_query_events.cjs`
- window/overlay runtime control: `index.cjs`
- Python sidecar tool + memory bridge: `local_backend_bridge.cjs`
- wakeword audio process bridge: `wakeword_bridge.cjs`

## Handler Ownership Matrix

### `ipc.cjs`

`ipcMain.handle`:

- `load-frontend-config`
- `get-client-user-id`
- `upload-artifact`
- `save-frontend-config`

`ipcMain.on`:

- `to-backend`

Notable behavior:

- `to-backend` query path performs initial settings sync gate, local optimistic user event synthesis, payload enrichment, and websocket send
- `save/load-frontend-config` call atomic file helpers in `ipc_frontend_config.cjs`
- helper-module split:
  - inbound backend message normalization/state/phase fan-out: `ipc_runtime_helpers.cjs`
  - renderer-window registration and broadcast fan-out: `ipc_renderer_windows.cjs`
  - synthetic local user/failure query event broadcast: `ipc_query_broadcast.cjs` with envelope builders from `ipc_query_events.cjs`

### `index.cjs`

`ipcMain.handle`:

- `set-overlay-ignore-mouse`
- `set-chatbox-size`
- `set-responsebox-size`
- `show-main-window` (optional payload `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`)
- `show-chatbox`
- `hide-chatbox`
- `get-displays`
- `window-minimize`
- `window-toggle-maximize`
- `window-close`
- `set-agent-sudo-access`
- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

`ipcMain.on`:

- `move-chatbox-to`

Notable behavior:

- overlay handlers guard for missing/destroyed windows and return structured success/reason payloads
- chat/response/context windows are repositioned together after move/resize operations
- `show-main-window` normalizes optional open-target payload and emits `main-window-open-target` to renderer on accepted target
- `show-main-window { maximize:true }` restores/minimizes state and maximizes before focusing dashboard window
- permission handlers delegate to `permission_service.cjs` using shared deps (`platform`, `shell`, `systemPreferences`)

### `local_backend_bridge.cjs`

Direct `ipcMain.handle`:

- `execute-tool`
- `get-system-state`
- `search-memory`

Mapped `ipcMain.handle` registrations via `registerMappedRpcHandlers(...)`:

- `search-conversations`
- `list-conversations`
- `list-episodic-memories`
- `get-conversation`
- `list-semantic-memories`
- `delete-conversation`
- `delete-semantic-memory`
- `store-memory`
- `store-transcript`

Notable behavior:

- `execute-tool` sets extended timeout for `browser` tool (120s vs default 30s)
- `screenshot` tool path uses hidden-window guard wrapper
- all mapped handlers call `sendRequestOrError(...)` and return normalized error payloads

### `wakeword_bridge.cjs`

`ipcMain.on`:

- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

Notable behavior:

- disabled wakeword state drops incoming detections
- disable path clears buffered detections and writes a zero-length reset frame

## RPC Mapper Contract Details

`COMPILED_RPC_HANDLER_DEFINITIONS` in `local_backend_bridge_rpc_mappers.cjs` defines channel -> JSON-RPC method + payload mapping.

Examples of non-trivial mappings:

- `search-memory`:
  - `exclude_conversation_id` accepts fallback keys `excludeConversationId` or `exclude_conversation_id`
- `get-conversation` and `delete-conversation`:
  - `conversation_id` derived from `conversationId` with explicit `null` fallback
- `store-transcript`:
  - maps renderer camelCase keys into backend snake_case fields (`conversation_ref`, `message_type`, `tool_name`, etc.)

Mapper behavior:

- non-object payloads normalize to empty object
- every target key is present in mapped object (possibly `undefined`/`null`)

## Drift Hotspots

1. channel exposed in preload/channels constants but missing `ipcMain` registration
2. handler moved between files without docs/constants updates
3. RPC mapper field rename breaks backend method params silently
4. channel name typo (`-` vs `_`) between renderer constants and `ipcMain` registration

## Debug Checklist

If renderer `invoke` resolves with "not handled"/unexpected response:

1. locate owner file for channel in matrix above
2. verify `ipcMain.handle` registration path is executed at startup
3. if sidecar-mapped channel, inspect RPC mapper target keys/method name

If sidecar memory operations return wrong filters:

1. verify mapper source keys (`userId`, `conversationId`, `recordKind`, etc.)
2. verify fallback key behavior (`excludeConversationId` vs `exclude_conversation_id`)
3. inspect JSON-RPC method name in compiled definitions

## Related Pages

- [Frontend Contracts IPC Docs Hub](README.md)
- [Preload Allowlist and Channel-Constant Parity Reference](preload_allowlist_and_channel_constant_parity_reference.md)
- [IPC Channel and Handler Reference](../ipc_channel_and_handler_reference.md)
