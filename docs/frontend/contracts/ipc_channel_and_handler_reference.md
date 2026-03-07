---
summary: "Renderer-main IPC reference: preload allowlists, typed channel constants, Electron main handler ownership, and backend/ws relay channel behavior."
read_when:
  - When adding or changing Electron IPC channels, including permission onboarding/data-controls channels.
  - When debugging renderer-main contract mismatches or unhandled invoke/send events.
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
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/display_query_handler.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/agent_sudo_access_handler.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`

## Security/Validation Layers

Two-layer channel gating:

1. `preload.js` hard-allowlists channel names for `send`, `invoke`, and `on`.
2. renderer `IpcBridge` optionally validates channel names in dev mode via static sets.

Result: unknown channel usage is rejected before Electron main dispatch.

## Renderer -> Main One-way Channels (`send`)

### `to-backend`

Owner: `ipc.cjs`

Behavior:

- primary relay channel to backend websocket.
- supports message types like `query`, `update-settings`, `tool-result`, `tool-bundle-result`, `wakeword-detected`, etc.
- query path enriches payload with system state + memory context and generates local optimistic user event.

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

## IPC bridge channels (`ipc.cjs`)

- `load-frontend-config` -> loads persisted config JSON from userData
- `save-frontend-config` -> atomic temp-write + rename persistence
- `get-client-user-id` -> returns websocket user/session endpoint metadata
- `upload-artifact` -> multipart upload to backend HTTP `/api/artifacts/`

## Phase-owned overlay channels (`overlay_phase_ipc_runtime.cjs`, wired by `index.cjs`)

- `set-chatbox-visual-anchor-height` -> chat-pill anchor height updates for deterministic response overlay re-anchoring
- `set-responsebox-size` -> bounded response overlay resize/show/hide
- `show-chatbox`
- `hide-chatbox`
- `prepare-surface-for-screenshot` -> bounded pre-capture wait + optional chat hide + settle delay; returns timing metrics

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

- `set-agent-sudo-access`
  - Linux-only privileged sudoers toggle flow (`pkexec` enable + `sudo -n` disable) with normalized canceled/error semantics
  - detailed runtime contract: [Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference](../main/agent_sudo_access_handler_pkexec_and_noninteractive_disable_contract_reference.md)
- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

Removed legacy renderer-callable channels:

- `set-overlay-ignore-mouse`
- `set-overlay-focusable`
- `prepare-overlay-tool-focus`

## Local sidecar bridge channels (`local_backend_bridge.cjs`)

- `execute-tool`
- `get-system-state`
- `search-memory`
- `search-conversations`
- mapped JSON-RPC channels:
- `list-conversations`
- `list-episodic-memories`
- `get-conversation`
- `list-semantic-memories`
- `delete-episodic-memory`
- `delete-conversation`
- `delete-semantic-memory`
- `store-memory`
- `store-transcript`

`execute-tool` runtime nuances:

- screenshot calls resolve display bounds in main-process order:
  1. visible sender window display affinity
  2. active query-origin display affinity fallback
- direct `run_shell_command` and nested `system_use -> run_shell_command` payloads derive `sudo_auth_mode` from frontend config (`agent_full_sudo_enabled`)
- sidecar `screenshot_path` responses are materialized into artifact refs (`screenshot_ref`/`screenshot_url`) when upload succeeds, with inline base64 fallback on upload failure

## Main -> Renderer Event Channels (`on`)

### Backend relay/events

- `from-backend`: canonical stream/tool/error payload relay from backend websocket
- `ipc-status`: websocket connection + endpoint status payload
- `response-overlay-phase`: phase transitions (`idle`, `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`, `complete`, `error`)

### Wakeword/UI events

- `wakeword-detected`
- `wakeword-status`
- `wakeword-toggle`
- `wakeword-stt-trigger`
- `chatbox-focus`
- `main-window-open-target`
- `log` (diagnostic)

## Permission Runtime Channel Contract

Permission onboarding and settings data-controls use invoke-only channels:

- `list-permissions`: returns manifest snapshot + status list
- `check-permissions`: batch status re-check
- `check-permission`: single status check helper
- `run-permission-probe`: explicit one-permission probe rerun
- `request-permission`: best-effort OS request flow + post-request probe

These channels are registered in `permission_ipc_runtime.cjs` and delegated to `permission_service.cjs`.

## `to-backend` Query Relay Lifecycle (main process)

Owner: `ipc.cjs` (with helper-module delegation to `ipc_runtime_helpers.cjs`, `ipc_query_broadcast.cjs`, and `ipc_query_events.cjs`).

1. validates message envelope and type.
2. for first query after connect, enforces one-time settings sync gate (`update-settings` ACK/timeout handling).
3. runs overlay pre-capture hook for chatbox sender.
4. generates local optimistic user event (`local-user-message`) to render instantly.
5. enriches payload `content` with XML system context + episodic/semantic memory snippets (`query_payload_builder.cjs`).
6. stores active sender display affinity in main process for follow-on screenshot tool fallback routing.
7. injects runtime-only `system_state_internal` (screen resolution) when available.
8. sends normalized backend message over websocket.

## Backend Relay Normalization

`ipc.cjs` normalizes outbound payloads before websocket send:

- for `query` and `tool-bundle-result`, strips `screenshot_url`.
- backend message envelope always includes `{id,type,payload,user_id,timestamp}`.

Incoming websocket messages are normalized by `processBackendMessageData` (`ipc_runtime_helpers.cjs`) and rebroadcast to all tracked renderer windows via `ipc_renderer_windows.cjs`, excluding optional source sender where applicable.

## Drift Hotspots

Keep these in sync whenever adding a channel:

1. `preload.js` allowlist arrays
2. `channels.ts` constants
3. `ipc.cjs` / `index.cjs` / `local_backend_bridge.cjs` / `wakeword_bridge.cjs` handler registration + `wakeword_bridge_runtime.cjs` helper ownership
4. renderer call sites (`IpcBridge.send|invoke|on`)

## Related Pages

- `docs/frontend/contracts/ipc/README.md`
- `docs/frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md`
- `docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md`
- `docs/frontend/contracts/ipc/bridge/README.md`
- `docs/frontend/contracts/ipc/bridge/renderer_ipc_bridge_runtime_validation_and_window_ipc_guard_reference.md`
