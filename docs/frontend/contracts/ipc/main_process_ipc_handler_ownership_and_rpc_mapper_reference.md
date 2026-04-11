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
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_memory_store_persistence.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/display_query_handler.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/agent_sudo_access_handler.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/permission_service.cjs`

## Registration Topology

Main-process handler registration is split by responsibility:

- transport/backend relay orchestration and config persistence: `ipc.cjs`
- relay helper ownership for message processing/fan-out/synthetic query events: `ipc_runtime_helpers.cjs`, `ipc_renderer_windows.cjs`, `ipc_query_broadcast.cjs`, `ipc_query_events.cjs`
- settings ACK-gate helper ownership: `ipc_settings_sync.cjs`
- phase-owned overlay shell registration: `overlay_phase_ipc_runtime.cjs` (wired by `index.cjs`)
- main-window/display control registration: `window_controls_ipc_runtime.cjs` (wired by `index.cjs`)
- permission/sudo registration: `permission_ipc_runtime.cjs` (wired by `index.cjs`)
- chat/main window visibility transitions: `window_visibility_runtime.cjs` (called from `overlay_visibility_handler.cjs` + runtime hooks)
- app lifecycle listener bootstrap: `main_process_lifecycle_runtime.cjs` (wired by `index.cjs`)
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
  - main-process `memory-store` event persistence side effect: `ipc_memory_store_persistence.cjs`

### `overlay_phase_ipc_runtime.cjs` (invoked from `index.cjs`)

`ipcMain.handle`:

- `set-chatbox-visual-anchor-height`
- `set-responsebox-size`
- `show-chatbox`
- `hide-chatbox`
- `prepare-surface-for-screenshot`

`ipcMain.on`:

- `move-chatbox-to`

Notable behavior:

- overlay handlers guard for missing/destroyed windows and return structured success/reason payloads
- chat/response/context windows are repositioned together after move operations, and response resize re-anchors against chat bounds
- `show-chatbox` target-display selection routes through `resolveActiveSurfaceDisplayAffinityForWindows(...)` (sender + `getWindows()` wrapper) before window-visibility runtime execution
- `prepare-surface-for-screenshot` supports bounded wait/hide/settle orchestration (`waitMs`, `hideChatbox`, `settleMs`) and returns measured timing fields
- phase-only scope: this registrar no longer owns dashboard window controls or permission channels

### `window_controls_ipc_runtime.cjs` (invoked from `index.cjs`)

`ipcMain.handle`:

- `show-main-window` (optional payload `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`)
- `get-main-window-visibility`
- `get-displays`
- `window-minimize`
- `window-toggle-maximize`
- `window-close`

Notable behavior:

- `show-main-window` normalizes optional open-target payload and emits `main-window-open-target` to renderer on accepted target
- `show-main-window` target-display selection routes through `resolveActiveSurfaceDisplayAffinityForWindows(...)` (sender + `getWindows()` wrapper) before window-visibility runtime execution
- `show-main-window { maximize:true }` routes through platform-aware window visibility behavior: Windows/Linux use native maximize after restore when no display-targeted placement is requested, while macOS uses native fullscreen and exits fullscreen first before any display-targeted reposition
- `get-displays` returns mapped inventory rows `{ id, label, isPrimary, bounds, scaleFactor }` produced by `display_query_handler.cjs` (label format: `Display N (WIDTHxHEIGHT)`)

### `permission_ipc_runtime.cjs` (invoked from `index.cjs`)

`ipcMain.handle`:

- `set-agent-sudo-access`
- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

Notable behavior:

- permission handlers delegate to `permission_service.cjs` using shared deps (`platform`, `shell`, `systemPreferences`)
- `set-agent-sudo-access` delegates to `agent_sudo_access_handler.cjs` and is Linux-only; enable path uses `pkexec`, disable path uses non-interactive `sudo -n` with normalized auth-cancel/error messaging

### `window_visibility_runtime.cjs`

Visibility runtime owners:

- `show-chatbox` behavior (main hide/overlay restore/focus/wakeword sync) via `showChatWindow(...)`
- `hide-chatbox` behavior (chat/response/context hide and wakeword sync) via `hideChatWindow(...)`
- `show-main-window` visibility/maximize/focus flow via `showMainWindow(...)`

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
- `delete-episodic-memory`
- `delete-conversation`
- `delete-semantic-memory`
- `store-memory`
- `store-transcript`

Notable behavior:

- `execute-tool` sets extended timeout for `browser` tool (120s vs default 30s)
- `execute-tool` args are normalized by `resolveToolArgs(...)` before JSON-RPC dispatch, including:
  - `run_shell_command` `sudo_auth_mode` derivation from frontend config (`native` vs `os_prompt`)
  - nested `system_use -> run_shell_command` `arguments.sudo_auth_mode` derivation from the same frontend config policy
  - non-object nested `system_use.arguments` values are passed through unchanged so sidecar schema validation remains authoritative
  - deep-clone normalization for non-shell payloads
  - screenshot-only `display_bounds` default injection from display-affinity fallback
- screenshot display-affinity precedence for `execute-tool`:
  1. `resolveActiveSurfaceDisplayAffinityForWindows(...)` resolves sender + visible-surface + stored-affinity selection
  2. internal precedence: visible sender surface (chat/main) -> visible chat/main surface -> stored active query display affinity
- screenshot tool results with sidecar temp files are materialized in main process:
  - upload `data.screenshot_path` to backend artifacts API when possible
  - fallback to inline base64 `data.screenshot` on upload failure
  - always delete temporary screenshot file and drop `screenshot_path` from returned payload
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
- helper ownership:
  - `wakeword_bridge_runtime.cjs` owns stderr status parsing/noisy-line suppression
  - `wakeword_bridge_runtime.cjs` owns startup/process error text normalization and audio-chunk payload normalization

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
2. handler moved between files (or helper split added) without docs/constants updates
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
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](../../main/display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Display Query Handler Display Inventory Payload Contract Reference](../../main/display_query_handler_display_inventory_payload_contract_reference.md)
- [Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference](../../main/agent_sudo_access_handler_pkexec_and_noninteractive_disable_contract_reference.md)
