---
summary: "Renderer-main IPC reference: preload allowlists, typed channel constants, Electron main handler ownership, retired permission sudo IPC routing, and SDK-runtime relay channel behavior."
read_when:
  - When adding or changing Electron IPC channels, including permission onboarding and focused settings channels.
  - When debugging renderer-main contract mismatches or unhandled invoke/send events.
  - When searching for retired permission sudo IPC behavior or removed sudo permission channels.
  - When searching for removed `prime-response-overlay-awaiting`; current send preflight uses `windie:pending-turn`.
title: "IPC Channel and Handler Reference"
---

# IPC Channel and Handler Reference

## Canonical Files

- Preload allowlist: `frontend/src/preload.js`
- Typed channel constants: `frontend/src/renderer/infrastructure/ipc/channels.ts`
- Typed bridge wrapper: `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- Main-process handlers:
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/surfaces/display_query_handler.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`

## Security/Validation Layers

Two-layer channel gating:

1. `preload.js` hard-allowlists channel names for `send`, `invoke`, and `on`.
2. renderer `IpcBridge` optionally validates channel names in dev mode via static sets.

Result: unknown channel usage is rejected before Electron main dispatch.

## Renderer -> Main One-way Channels (`send`)

### `renderer-log` / `live-surface-trace` / `windie:pending-turn` / `transcript-session-sync`

Owners: `ipc_renderer_diagnostics_handlers.cjs`,
`ipc_client_session_handlers.cjs`, and `ipc_pending_turn_handlers.cjs`

Behavior:

- forwards renderer log and live-surface trace payloads into main logging
  through `ipc_renderer_diagnostics_handlers.cjs`
- syncs transcript session/conversation/user identity from renderer to main
  runtime state
- relays renderer-composed pending user turns across windows with
  `windie:pending-turn`; payloads are `{ type: "pending", pendingTurn }` or
  `{ type: "clear", conversationRef?, turnRef? }`

### `move-chatbox-to`

Owner: `overlay_phase_ipc_runtime.cjs` (registered via `index.cjs`)

Behavior:

- updates chat overlay position for drag interactions.
- response overlay is repositioned relative to chat overlay.

### `wakeword-audio-chunk`

Owner: `wakeword_bridge.cjs` (payload normalization delegated to `wakeword_bridge_runtime.cjs`)

Behavior:

- forwards PCM chunk buffers to wakeword Python subprocess when ready/enabled.

### `wakeword-enable` / `wakeword-disable`

Owner: `wakeword_bridge.cjs` (status/error mapping delegated to `wakeword_bridge_runtime.cjs`)

Behavior:

- toggles wakeword detection state and readiness notifications.
- disable clears buffered detections and sends reset frame to subprocess.

## Renderer -> Main Request/Response Channels (`invoke`)

## IPC bridge channels (`ipc.cjs` composition, focused handler modules)

- `windie:invoke` -> strict SDK-shaped command bridge registered by
  `ipc_agent_sdk_command_handlers.cjs` with Electron agent-host dependencies
  injected from `ipc.cjs`. Renderer facades and Electron main use the SDK
  `SDK_RUNTIME_COMMANDS` export for supported user-runtime commands such as
  `conversation.send`, `conversation.stop`, `settings.update`, `models.list`,
  `conversation.rehydrate`, `conversation.compact`,
  `conversation.loadDisplayTimeline`, `conversation.replaceRows`, and
  `wakeword.detected`.
- `load-frontend-config` -> loads persisted desktop UI config JSON from userData
  through the Electron-main desktop UI config store
- `save-frontend-config` -> persists redacted desktop UI config through the
  Electron-main desktop UI config store, which preserves the main-owned MCP
  allowlist unless an explicit MCP toggle disables preservation
- `get-client-user-id` -> returns websocket user/session endpoint metadata via
  `ipc_client_session_handlers.cjs`
- `upload-artifact` -> multipart upload to backend HTTP `/api/artifacts/`
- `fetch-artifact-image` -> authenticated artifact image fetch
- `copy-image-to-clipboard` -> trusted image clipboard copy
- `show-image-context-menu` -> trusted image context menu actions
- `list-agent-extensions` -> public extension metadata plus MCP registry
  snapshot via `ipc_extension_mcp_handlers.cjs`
- `list-mcp-servers` / `set-mcp-server-enabled` / `refresh-mcp-servers` ->
  MCP registry and enablement controls via `ipc_extension_mcp_handlers.cjs`
## Phase-owned overlay channels (`overlay_phase_ipc_runtime.cjs`, wired by `index.cjs`)

- `set-chatbox-visual-anchor-height` -> chat-pill anchor height updates for deterministic response overlay re-anchoring
- `set-chatbox-hit-test-active`
- `set-responsebox-hit-test-active`
- `set-responsebox-size` -> bounded response overlay resize/show/hide
- `show-chatbox`
- `activate-chatbox-text-entry`
- `hide-chatbox`
- `handoff-surface-for-computer-use`
- `prepare-surface-for-screenshot` -> bounded pre-capture wait + optional chat hide + settle delay; returns timing metrics
- `restore-surface-after-screenshot`

## Window control channels (`window_controls_ipc_runtime.cjs`, wired by `index.cjs`)

- `show-main-window` -> shows main window; optional payload `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }` emits `main-window-open-target` when accepted
- `get-displays`
  - returns mapped display inventory rows `{ id, label, isPrimary, bounds, scaleFactor }`
  - label contract uses positional format `Display N (WIDTHxHEIGHT)`
  - detailed mapping contract: [Display Query Handler Display Inventory Payload Contract Reference](../main/display_query_handler_display_inventory_payload_contract_reference.md)
- `window-minimize`
- `window-toggle-maximize`
- `window-close`

## Permission channels (`permission_ipc_runtime.cjs`, wired by `index.cjs`)

- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`
- `set-active-workspace`

There is no renderer-callable `set-agent-sudo-access` channel. Linux
`run_shell_command` sudo behavior is owned by the local-runtime shell tool, which
rewrites leading `sudo ...` commands to `pkexec` prompting.

Removed legacy renderer-callable channels:

- `set-overlay-ignore-mouse`
- `set-overlay-focusable`
- `prepare-overlay-tool-focus`

## Local runtime bridge channels (`local_runtime_bridge.cjs`)

These channels are implementation-level main/local-runtime bridge channels. Renderer
feature code uses SDK-shaped `windie:invoke` commands for conversation and
memory user actions instead of these sidecar names.

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `get-system-state`

Removed direct chat/memory JSON-RPC bridge channels:

- Electron main no longer registers direct sidecar-named IPC handlers such as
  `list-chat-conversations`, `search-chat-conversations`,
  `list-episodic-memories`, `get-chat-events`,
  `get-chat-conversation-revision`, `list-semantic-memories`,
  `delete-episodic-memory`, `delete-chat-conversation`,
  `delete-semantic-memory`, `clear-local-memory`, `clear-chat-history`,
  `store-chat-event`, `replace-chat-conversation`, or
  `rewrite-chat-conversation-after-event`.
- Conversation and memory user actions use SDK-shaped `windie:invoke`
  commands; SDK local-runtime code owns the local-runtime JSON-RPC calls behind
  that boundary.

Local tool runtime nuances:

- screenshot calls resolve display bounds in main-process order:
  1. visible sender window display affinity
  2. active query-origin display affinity fallback
- sidecar `screenshot_path` responses are materialized into artifact refs (`screenshot_ref`/`screenshot_url`) when upload succeeds, with inline base64 fallback on upload failure

## Main -> Renderer Event Channels (`on`)

### Backend relay/events

- `windie:rows`: SDK display-row compatibility/diagnostic snapshots; normal
  renderer chat UI reads SDK `ConversationView`
- `windie:status`: Agent SDK runtime status snapshots
- `windie:conversation-event`: SDK-normalized conversation events for transcript/session side effects
- `windie:memory-store-changed`: memory-store invalidation events
- `windie:conversation-metadata-invalidated`: sidebar/list metadata invalidation
- `windie:current-turn`: SDK current-turn projection for live assistant/tool UI
- `windie:pending-turn`: main-replayed pending renderer user turn until matching SDK current-turn projection or explicit clear
- `transcript-session-sync`: normalized transcript session sync snapshots via
  `ipc_client_session_handlers.cjs`
- `ipc-status`: websocket connection + endpoint status payload
- `local-runtime-status`: SDK local-runtime process/readiness status
- `response-overlay-phase`: phase transitions (`idle`, `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`, `complete`, `error`)
- `backend-settings-event`: model/settings ACK and settings-error events
- `agent-capability-event`: client tool manifest and remote tool catalog events
- `audio-chunk`: TTS/audio side-channel payloads

### Wakeword/UI events

- `wakeword-detected`
- `wakeword-status`
- `wakeword-toggle`
- `wakeword-stt-trigger`
- `chatbox-focus`
- `workspace-access-updated`
- `main-window-open-target`
- `response-overlay-visibility`
- `log` (diagnostic)

## Permission Runtime Channel Contract

Permission onboarding and focused settings permission controls use invoke-only channels:

- `list-permissions`: returns manifest snapshot + status list
- `check-permissions`: batch status re-check
- `check-permission`: single status check helper
- `run-permission-probe`: explicit one-permission probe rerun
- `request-permission`: best-effort OS request flow + post-request probe

These channels are registered in `permission_ipc_runtime.cjs` and delegated to `permission_service.cjs`.

## `conversation.send` Relay Lifecycle (main process)

Owner: `ipc.cjs` (with helper-module delegation to `ipc_runtime_helpers.cjs`, `ipc_query_broadcast.cjs`, and `ipc_query_events.cjs`).

1. validates and normalizes the chat payload.
2. for first query after connect, enforces one-time settings sync gate (`update-settings` ACK/timeout handling).
3. runs overlay pre-capture hook for chatbox sender.
4. starts the SDK replay buffer with the query message id; the SDK emits the renderer-visible user row/event.
5. normalizes backend query fields and conversation identity (`ipc_query_runtime.cjs`); SDK context enrichment later renders model-facing memory/attachment content.
6. stores active sender display affinity in main process for follow-on screenshot tool fallback routing.
7. injects runtime-only `system_state_internal` (screen resolution) when available.
8. calls the Agent SDK runtime to send the normalized backend message over websocket.

## Backend Relay Normalization

`ipc.cjs` normalizes outbound payloads before websocket send:

- filters known backend command payloads through contract-backed allowlists and
  strips display-only `screenshot_url` for `query` and `tool-bundle-result`.
- backend message envelope always includes `{id,type,payload,user_id,timestamp}`.

Incoming websocket messages are owned by the Agent SDK runtime. Electron main forwards SDK-normalized rows, status, conversation events, and current-turn projections to all tracked renderer windows via `ipc_renderer_windows.cjs`, excluding optional source sender where applicable.

## Drift Hotspots

Keep these in sync whenever adding a channel:

1. `frontend/src/shared/ipcChannels.json`
2. `channels.ts` expected shared-registry key validation
3. `ipc.cjs` / `index.cjs` / `local_runtime_bridge.cjs` / `wakeword_bridge.cjs` handler registration + `wakeword_bridge_runtime.cjs` helper ownership
4. renderer call sites (`IpcBridge.send|invoke|on`)

## Related Pages

- `docs/frontend/contracts/ipc/README.md`
- `docs/frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md`
- `docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md`
- `docs/frontend/contracts/ipc/bridge/README.md`
- `docs/frontend/contracts/ipc/bridge/renderer_ipc_bridge_runtime_validation_and_window_ipc_guard_reference.md`
