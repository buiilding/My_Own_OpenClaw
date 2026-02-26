---
summary: "Electron main process runtime: window orchestration, backend websocket bridge, sidecar process bridge, and IPC contracts."
read_when:
  - When changing renderer/main IPC channels or backend bridge logic.
  - When debugging window overlays, wakeword bridge, or backend connectivity.
title: "Electron Main and IPC"
---

# Electron Main and IPC

## Main Entry and Window Orchestration

Primary entrypoint:

- `frontend/src/main/index.cjs`
- `frontend/src/main/main_window_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/overlay_ipc_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`

Responsibilities:

- Creates/manages main window + chat overlay windows.
- Maintains overlay response phases (`idle`, `awaiting-first-chunk`, `streaming`, tool phases).
- Tracks and restores external focused window (notably on Windows) for overlay UX.
- Registers tray/shortcuts and always-on-top behavior for overlay windows.
- Delegates BrowserWindow factory/bootstrap helpers to `main_window_runtime.cjs`.
- Delegates lifecycle listeners/startup wiring to `main_process_lifecycle_runtime.cjs`.
- Delegates overlay/window IPC handler registration to `overlay_ipc_runtime.cjs`.
- Delegates chat/main visibility transitions to `window_visibility_runtime.cjs`.

See [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md) for extracted helper boundaries.
See [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md) for lifecycle and overlay-runtime split ownership.

## Preload Boundary

- `frontend/src/preload.js`

Responsibilities:

- Exposes allowlisted IPC APIs (`send`, `invoke`, `on`, `once`) to renderer.
- Enforces channel allowlists at the renderer boundary.
- Prevents arbitrary channel usage from renderer code.

## IPC Bridge to Backend WebSocket

Main modules:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc_query_events.cjs`

Responsibilities:

- Maintains backend websocket connection and reconnect logic.
- Tracks backend session context (`userId`, `sessionId`, `conversation_ref`).
- Gates first query on settings synchronization ACK.
- Broadcasts connection status to all renderer windows.
- Uploads artifacts over HTTP endpoint and injects returned references.

Split boundary:

- `ipc.cjs` owns lifecycle orchestration and IPC handler registration.
- helper modules own event processing, renderer-window fan-out, and synthetic query event broadcast paths.
- See [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md) for per-module contract details.

## Query Payload Enrichment

Module:

- `frontend/src/main/query_payload_builder.cjs`

Adds backend-facing context before query send:

- system context XML (`active_window`, `mouse_position`, `screen_resolution`, and full windows list for initial turn)
- episodic and semantic memory sections
- user query XML payload
- runtime-only system state subset (`screen_resolution`) for backend coordinate normalization

## Local Sidecar Bridge

Module:

- `frontend/src/main/local_backend_bridge.cjs`

Responsibilities:

- Spawns `local_backend.py` subprocess.
- Performs readiness ping handshake with retry/backoff.
- Handles JSON-RPC request/response correlation for tool and memory operations.
- Exposes IPC handlers to renderer/main callers for tool execution, memory operations, and system state.

Safety behavior:

- Rejects all pending requests on sidecar exit.
- Marks sidecar unavailable and notifies renderer.
- For detailed handler/mapper/window-hide internals, see [Local Backend Bridge Handler and Window Guard Reference](local_backend_bridge_handler_and_window_guard_reference.md).

## Wakeword Bridge

Module:

- `frontend/src/main/wakeword_bridge.cjs`

Responsibilities:

- Lazily spawns `wakeword_service.py` subprocess on `wakeword-enable`.
- Streams binary audio chunks to Python service.
- Parses framed binary wakeword detection responses.
- Supports wakeword enable/disable state and buffer flushing.

## Permission Runtime

Main modules:

- `frontend/src/main/permission_service.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/shared/permissions/permission_manifest.json`

Responsibilities:

- Loads permission manifest metadata and cloned permission definitions.
- Runs per-permission probes for onboarding/data-controls status surfaces.
- Handles permission request flows (notably macOS privacy-pane deep links and microphone access request).
- Exposes renderer invoke handlers:
  - `list-permissions`
  - `check-permissions`
  - `check-permission`
  - `run-permission-probe`
  - `request-permission`

## IPC Channel Taxonomy

From renderer usage perspective:

- send channels: backend messaging, overlay window control, wakeword chunk/control
- invoke channels: tool execution, artifact upload, memory CRUD/search, config load/save, window/display APIs
- invoke channels also include permission/status request channels and sudo access toggle:
  - `set-agent-sudo-access`
  - `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`
- on channels: backend stream events, connection status, wakeword events, overlay phase updates

Canonical constants are in renderer infra (`frontend/src/renderer/infrastructure/ipc/channels.ts`) and must stay aligned with main-process handlers.
