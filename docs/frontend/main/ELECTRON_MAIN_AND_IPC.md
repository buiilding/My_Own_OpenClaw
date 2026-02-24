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

Responsibilities:

- Creates/manages main window + chat overlay windows.
- Maintains overlay response phases (`idle`, `awaiting-first-chunk`, `streaming`, tool phases).
- Tracks and restores external focused window (notably on Windows) for overlay UX.
- Registers tray/shortcuts and always-on-top behavior for overlay windows.

## Preload Boundary

- `frontend/src/preload.js`

Responsibilities:

- Exposes allowlisted IPC APIs (`send`, `invoke`, `on`, `once`) to renderer.
- Enforces channel allowlists at the renderer boundary.
- Prevents arbitrary channel usage from renderer code.

## IPC Bridge to Backend WebSocket

Main module:

- `frontend/src/main/ipc.cjs`

Responsibilities:

- Maintains backend websocket connection and reconnect logic.
- Tracks backend session context (`userId`, `sessionId`, `conversation_ref`).
- Gates first query on settings synchronization ACK.
- Broadcasts connection status to all renderer windows.
- Uploads artifacts over HTTP endpoint and injects returned references.

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

## Wakeword Bridge

Module:

- `frontend/src/main/wakeword_bridge.cjs`

Responsibilities:

- Spawns `wakeword_service.py` subprocess.
- Streams binary audio chunks to Python service.
- Parses framed binary wakeword detection responses.
- Supports wakeword enable/disable state and buffer flushing.

## IPC Channel Taxonomy

From renderer usage perspective:

- send channels: backend messaging, overlay window control, wakeword chunk/control
- invoke channels: tool execution, artifact upload, memory CRUD/search, config load/save, window/display APIs
- on channels: backend stream events, connection status, wakeword events, overlay phase updates

Canonical constants are in renderer infra (`frontend/src/renderer/infrastructure/ipc/channels.ts`) and must stay aligned with main-process handlers.
