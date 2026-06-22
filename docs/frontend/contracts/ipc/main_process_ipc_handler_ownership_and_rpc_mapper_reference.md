---
summary: "Deep reference for main-process IPC handler ownership across `ipc.cjs` + IPC helper modules, `index.cjs`, permission/wakeword handlers, and scoped local-runtime bridge channels."
read_when:
  - When adding/removing `ipcMain.on/handle` registrations, including permission onboarding channels.
  - When debugging renderer invoke/send calls that do not reach expected SDK/main local-runtime behavior.
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
- `frontend/src/main/ipc/ipc_automated_query_dispatcher.cjs`
- `frontend/src/main/ipc/ipc_startup_state.cjs`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `frontend/src/main/ipc/ipc_backend_endpoint_state.cjs`
- `frontend/src/main/ipc/ipc_artifact_handlers.cjs`
- `frontend/src/main/ipc/ipc_artifact_fetch.cjs`
- `frontend/src/main/ipc/ipc_image_interaction_handlers.cjs`
- `frontend/src/main/ipc/ipc_clipboard_image.cjs`
- `frontend/src/main/ipc/ipc_image_context_menu.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/surfaces/display_query_handler.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_settings_sync_runtime.cjs`
- `frontend/src/main/permissions/permission_service.cjs`

## Registration Topology

Main-process handler registration is split by responsibility:

- transport/backend relay orchestration and config persistence: `ipc.cjs`
- relay helper ownership for message processing/fan-out/synthetic query events: `ipc_runtime_helpers.cjs`, `ipc_renderer_windows.cjs`, `ipc_query_broadcast.cjs`, `ipc_query_events.cjs`
- settings ACK-gate helper ownership: `ipc_settings_sync.cjs`
- phase-owned overlay shell registration: `overlay_phase_ipc_runtime.cjs` (wired by `index.cjs`)
- main-window/display control registration: `window_controls_ipc_runtime.cjs` (wired by `index.cjs`)
- permission registration: `permission_ipc_runtime.cjs` (wired by `index.cjs`)
- chat/main window visibility transitions: `window_visibility_runtime.cjs` (called from `overlay_visibility_handler.cjs` + runtime hooks)
- app lifecycle listener bootstrap: `main_process_lifecycle_runtime.cjs` (wired by `index.cjs`)
- Local-runtime scoped host bridge: `local_runtime_bridge.cjs`
- wakeword audio process bridge: `wakeword_bridge.cjs`

## Handler Ownership Matrix

### `ipc.cjs`

`ipcMain.handle`:

- `windie:invoke`
- `copy-image-to-clipboard`
- `show-image-context-menu`
- `load-frontend-config`
- `get-client-user-id`
- `upload-artifact`
- `save-frontend-config`

Notable behavior:

- SDK-owned renderer commands are routed through `windie:invoke` with a strict
  command allowlist keyed by the SDK `SDK_RUNTIME_COMMANDS` export. Current
  command names include `conversation.send`,
  `conversation.stop`, `conversation.rehydrate`, `conversation.compact`,
  `conversation.loadDisplayTimeline`, `conversation.replaceRows`,
  `settings.update`, `models.list`, `wakeword.detected`,
  `memories.clearAll`, and `conversations.clearAll`.
- focused query helpers own payload preparation, settings gates, and stop
  orchestration behind the `conversation.send` and `conversation.stop`
  commands
- exported VM `sendAutomatedQuery(...)` delegates to
  `ipc_automated_query_dispatcher.cjs`, which owns automated-query backend
  connection/settings gates, shared query payload building, SDK send, and
  successful state mutation
- SDK runtime commands use explicit SDK-shaped command names over
  `windie:invoke`. Electron main does not expose a generic renderer
  `to-backend` compatibility command router or the retired direct chat runtime
  handler family.
- `save/load-frontend-config` are registered by
  `ipc_desktop_ui_config_handlers.cjs` and call atomic file helpers in
  `ipc_desktop_ui_config.cjs`
- `windie:pending-turn` is registered by `ipc_pending_turn_handlers.cjs`;
  `ipc.cjs` injects the latest pending-turn cache, sibling-window fan-out,
  late-window replay state, and current-turn clear semantics
- `ipc_response_overlay_handlers.cjs` / `prime-response-overlay-awaiting` are
  removed; active response phases are driven by SDK/backend current-turn
  projection and overlay phase events, not a renderer invoke preflight handler
- `upload-artifact` and `fetch-artifact-image` are registered by
  `ipc_artifact_handlers.cjs`; upload delegates to the shared artifact uploader,
  and protected image fetch ensures install auth before calling
  `ipc_artifact_fetch.cjs`
- clipboard image copy and image context-menu copy are registered by
  `ipc_image_interaction_handlers.cjs`, which owns the shared trusted backend
  artifact-origin policy while delegating copy/context-menu behavior to
  `ipc_clipboard_image.cjs` and `ipc_image_context_menu.cjs`; bounded
  `data:image/*` URLs are decoded locally, while HTTP(S) fetches are limited
  to trusted backend-origin
  `/api/artifacts/...` URLs, use manual redirect validation, and require image
  content type plus bounded response size
- helper-module split:
  - inbound backend message normalization/state/phase fan-out: `ipc_runtime_helpers.cjs`
  - renderer-window registration and broadcast fan-out: `ipc_renderer_windows.cjs`
  - synthetic local user/failure query event broadcast: `ipc_query_broadcast.cjs` with envelope builders from `ipc_query_events.cjs`

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

- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

Notable behavior:

- permission handlers delegate to `permission_service.cjs` using shared deps (`platform`, `shell`, `systemPreferences`)

### `window_visibility_runtime.cjs`

Visibility runtime owners:

- `show-chatbox` behavior (main hide/overlay restore/focus/wakeword sync) via `showChatWindow(...)`
- `hide-chatbox` behavior (chat/response/context hide and wakeword sync) via `hideChatWindow(...)`
- `show-main-window` visibility/maximize/focus flow via `showMainWindow(...)`

### `local_runtime_bridge.cjs`

Direct `ipcMain.handle`:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `get-system-state`

Removed mapped chat/memory `ipcMain.handle` registrations:

- Electron main no longer registers direct sidecar-named handlers such as
  `search-chat-conversations`, `list-chat-conversations`,
  `list-episodic-memories`, `get-chat-events`,
  `list-semantic-memories`, `delete-episodic-memory`,
  `delete-chat-conversation`, `delete-semantic-memory`, or
  `store-chat-event`.
- Renderer feature code reaches conversation and memory behavior through
  SDK-shaped `windie:invoke` commands. SDK local-runtime store code owns the
  local-runtime JSON-RPC calls behind that command boundary.

Notable behavior:

- local browser tool execution uses an extended timeout (120s vs default 30s)
- local tool args are normalized by `resolveToolArgs(...)` before JSON-RPC dispatch, including:
  - non-object nested `system_use.arguments` values are passed through unchanged so local-runtime schema validation remains authoritative
  - deep-clone normalization for non-shell payloads
  - screenshot-only `display_bounds` default injection from display-affinity fallback
- screenshot display-affinity precedence for local screenshot tool execution:
  1. `resolveActiveSurfaceDisplayAffinityForWindows(...)` resolves sender + visible-surface + stored-affinity selection
  2. internal precedence: visible sender surface (chat/main) -> visible chat/main surface -> stored active query display affinity
- screenshot tool results with sidecar temp files are materialized in main process:
  - accept only owned temp files under `${os.tmpdir()}/desktop-runtime-screenshots` with `desktop-runtime-shot-` filenames
  - upload accepted `data.screenshot_path` files to backend artifacts API when possible
  - fallback to inline base64 `data.screenshot` on upload failure
  - delete accepted temporary screenshot files and drop `screenshot_path` from returned payload
  - strip `screenshot_path` from non-screenshot tool results without reading or deleting the path
- `screenshot` tool path uses hidden-window guard wrapper
### `wakeword_bridge.cjs`

`ipcMain.on`:

- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

Notable behavior:

- `initializeWakewordBridge(...)` can register the channels against an injected
  `ipcMain`-compatible adapter and defaults to Electron `ipcMain`
- disabled wakeword state drops incoming detections
- disable path clears buffered detections and writes a zero-length reset frame
- helper ownership:
  - `wakeword_bridge_runtime.cjs` owns stderr status parsing/noisy-line suppression
  - `wakeword_bridge_runtime.cjs` owns startup/process error text normalization and audio-chunk payload normalization

## Drift Hotspots

1. channel exposed in preload/channels constants but missing `ipcMain` registration
2. handler moved between files (or helper split added) without docs/constants updates
3. SDK local-runtime store field rename breaks Python JSON-RPC params silently
4. channel name typo (`-` vs `_`) between renderer constants and `ipcMain` registration

## Debug Checklist

If renderer `invoke` resolves with "not handled"/unexpected response:

1. locate owner file for channel in matrix above
2. verify `ipcMain.handle` registration path is executed at startup
3. if a local-runtime-backed helper is involved, inspect the SDK/local-runtime target keys and method name

If local-runtime memory operations return wrong filters:

1. verify SDK local-runtime source keys (`userId`, `conversationId`, `recordKind`, etc.)
2. inspect the JSON-RPC method name used by the SDK local-runtime store

## Related Pages

- [Frontend Contracts IPC Docs Hub](README.md)
- [Preload Allowlist and Channel-Constant Parity Reference](preload_allowlist_and_channel_constant_parity_reference.md)
- [IPC Channel and Handler Reference](../ipc_channel_and_handler_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](../../main/display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Display Query Handler Display Inventory Payload Contract Reference](../../main/display_query_handler_display_inventory_payload_contract_reference.md)
