---
summary: "Renderer-main IPC reference: preload allowlists, typed channel constants, Electron main handler ownership, and backend/ws relay channel behavior."
read_when:
  - When adding or changing Electron IPC channels.
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
- `frontend/src/main/index.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`

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

Owner: `index.cjs`

Behavior:

- updates chat overlay position for drag interactions.
- response overlay is repositioned relative to chat overlay.

### `wakeword-audio-chunk`

Owner: `wakeword_bridge.cjs`

Behavior:

- forwards PCM chunk buffers to wakeword Python subprocess when ready/enabled.

### `wakeword-enable` / `wakeword-disable`

Owner: `wakeword_bridge.cjs`

Behavior:

- toggles wakeword detection state and readiness notifications.
- disable clears buffered detections and sends reset frame to subprocess.

## Renderer -> Main Request/Response Channels (`invoke`)

## IPC bridge channels (`ipc.cjs`)

- `load-frontend-config` -> loads persisted config JSON from userData
- `save-frontend-config` -> atomic temp-write + rename persistence
- `get-client-user-id` -> returns websocket user/session endpoint metadata
- `upload-artifact` -> multipart upload to backend HTTP `/api/artifacts/`

## Window/overlay channels (`index.cjs`)

- `set-overlay-ignore-mouse` -> click-through toggle for overlay windows
- `set-chatbox-size` -> bounded chat window resize + response reposition
- `set-responsebox-size` -> bounded response overlay resize/show/hide
- `show-main-window`
- `show-chatbox`
- `hide-chatbox`
- `get-displays`
- `window-minimize`
- `window-toggle-maximize`
- `window-close`

## Local sidecar bridge channels (`local_backend_bridge.cjs`)

- `execute-tool`
- `get-system-state`
- `search-memory`
- mapped JSON-RPC channels:
- `list-conversations`
- `get-conversation`
- `list-semantic-memories`
- `delete-conversation`
- `delete-semantic-memory`
- `store-memory`
- `store-transcript`

## Main -> Renderer Event Channels (`on`)

### Backend relay/events

- `from-backend`: canonical stream/tool/error payload relay from backend websocket
- `ipc-status`: websocket connection + endpoint status payload
- `response-overlay-phase`: phase transitions (`idle`, `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`, `complete`, `error`)

### Wakeword/UI events

- `wakeword-detected`
- `wakeword-status`
- `wakeword-toggle`
- `chatbox-focus`
- `log` (diagnostic)

## `to-backend` Query Relay Lifecycle (main process)

Owner: `ipc.cjs`.

1. validates message envelope and type.
2. for first query after connect, enforces one-time settings sync gate (`update-settings` ACK/timeout handling).
3. runs overlay pre-capture hook for chatbox sender.
4. generates local optimistic user event (`local-user-message`) to render instantly.
5. enriches payload `content` with XML system context + episodic/semantic memory snippets (`query_payload_builder.cjs`).
6. injects runtime-only `system_state_internal` (screen resolution) when available.
7. sends normalized backend message over websocket.

## Backend Relay Normalization

`ipc.cjs` normalizes outbound payloads before websocket send:

- for `query` and `tool-bundle-result`, strips `screenshot_url`.
- backend message envelope always includes `{id,type,payload,user_id,timestamp}`.

Incoming websocket messages are rebroadcast to all tracked renderer windows, excluding optional source sender where applicable.

## Drift Hotspots

Keep these in sync whenever adding a channel:

1. `preload.js` allowlist arrays
2. `channels.ts` constants
3. `ipc.cjs` / `index.cjs` / `local_backend_bridge.cjs` / `wakeword_bridge.cjs` handler registration
4. renderer call sites (`IpcBridge.send|invoke|on`)

## Related Pages

- `docs/frontend/contracts/ipc/README.md`
- `docs/frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md`
- `docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md`
