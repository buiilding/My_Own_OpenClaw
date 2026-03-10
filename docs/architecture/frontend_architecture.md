---
summary: "Current WindieOS frontend architecture across Electron main, React renderer, preload IPC boundary, and Python sidecar runtime."
read_when:
  - When changing renderer/main/sidecar ownership boundaries.
  - When changing query, stream, tool, wakeword, or transcript flow across frontend processes.
title: "Frontend Architecture"
---

# Frontend Architecture

See also: [Frontend Functionality Map](../frontend/README.md) and [Frontend Full Functionality Inventory Reference](../frontend/inventory/frontend_full_functionality_inventory_reference.md).

## Runtime Topology

WindieOS frontend is a multi-runtime desktop stack:

1. Renderer (React): UX state, chat/dashboard surfaces, tool-stream rendering.
2. Main process (Electron/Node): window lifecycle, backend WebSocket bridge, sidecar process bridge, wakeword subprocess bridge.
3. Preload boundary: allowlisted IPC bridge (`window.ipc`) between renderer and main.
4. Sidecar (Python): local tool execution, local transcript/memory store, system-state capture, browser/file/system tool adapters.

## Packaged Install Contract

- End users install one OS-specific WindieOS package (Windows/macOS/Linux).
- Packaged app ships bundled Python sidecar runtime; no system Python prerequisite.
- Frontend main process starts sidecar/wakeword from bundled runtime paths and reports clear reinstall errors when runtime assets are missing.
- Bundled runtime is expected to include:
  - wakeword model assets
  - browser Python dependencies
- Runtime bootstrap should not reinstall already-present bundled assets.

## Current Source Layout

```text
frontend/src/
├── main/
│   ├── index.cjs                          # Electron main composition root (wires runtime modules)
│   ├── ipc.cjs                            # Renderer <-> backend WS bridge and event fan-out
│   ├── ipc_runtime_helpers.cjs            # IPC runtime helper set (user-id, payload normalization, upload, backend message processing)
│   ├── ipc_renderer_windows.cjs           # Renderer-window tracking + broadcast helpers for IPC bridge
│   ├── ipc_query_broadcast.cjs            # Local user-message/query-failure bridge helpers
│   ├── main_window_runtime.cjs            # Main/chat/response/tray window constructors + renderer view loading
│   ├── surface_runtime.cjs                # Shared owner for main/chat/response window refs, overlay phase, and visibility orchestration
│   ├── window_visibility_runtime.cjs      # Main/chat overlay visibility operations (show/hide/maximize)
│   ├── window_platform_policy.cjs         # Centralized per-OS window policy (activation, content protection, overlay topmost/workspace rules)
│   ├── window_suppression_runtime.cjs     # Screenshot suppression helpers for dashboard offscreen/hide/restore
│   ├── overlay_window_helpers_runtime.cjs # Overlay bounds/position/on-top/context-label runtime helpers
│   ├── overlay_signal_runtime.cjs         # Wakeword + overlay visibility signal fan-out helpers
│   ├── overlay_phase_ipc_runtime.cjs      # Phase-owned overlay surface IPC registration (chat/response shell sizing + visibility)
│   ├── window_controls_ipc_runtime.cjs    # Main-window/display control IPC registration
│   ├── permission_ipc_runtime.cjs         # Permission + sudo IPC registration
│   ├── main_process_lifecycle_runtime.cjs # app.whenReady/activate/quit lifecycle wiring + shortcut registration
│   ├── local_backend_supervisor.cjs       # Explicit sidecar subprocess state supervisor (starting/ready/stopping/error)
│   ├── local_backend_bridge*.cjs          # Main <-> sidecar JSON-RPC bridge
│   ├── wakeword_supervisor.cjs            # Explicit wakeword subprocess state supervisor (starting/ready/stopping/error)
│   ├── wakeword_bridge.cjs                # Main <-> wakeword subprocess bridge
│   ├── query_payload_builder.cjs          # System-state/memory XML augmentation for query payload
│   ├── permission_service.cjs             # Install-time permission manifest checks + OS probe/request helpers
│   └── python/                            # Sidecar runtime (tools/memory/system/browser)
├── preload.js                             # Context-isolated channel allowlist bridge
├── renderer/
│   ├── app/                               # App/provider composition + wakeword controller
│   ├── features/chat                      # Chat stream, tool runner, message UI
│   ├── features/dashboard                 # Sidebar, memory/models/settings/usage/search panels
│   ├── features/voice                     # Voice mode + wakeword capture hooks
│   └── infrastructure                     # API/IPC/transcript/tool-exec/audio services
└── landing/                               # Marketing/landing surface
```

## Core Runtime Flows

### Query Send Flow

1. User enters message in `renderer/features/chat/components/MessageInput.jsx`.
2. `useChatMessageSender` builds payload and optional screenshot metadata.
3. `ApiClient.sendQuery()` emits `to-backend` IPC message.
4. Main `ipc.cjs`:
   - Ensures one-time initial settings sync ACK gate.
   - Runs overlay pre-capture focus handoff for chatbox-surface sends.
   - Resolves sender-window display affinity in main (including virtual desktop bounds) and stores it for follow-on tool screenshots when the dashboard renderer is hidden.
   - Emits local synthetic `local-user-message` event to renderer immediately.
   - Calls `buildQueryPayloadContent()` to inject system-context + memory sections.
   - Sends normalized `query` over backend WebSocket.

### Stream Receive Flow

1. Backend WebSocket events arrive in main `ipc.cjs`.
2. Main updates response-overlay phase (`awaiting-first-chunk`/`streaming`/`tool-call`/`complete`/`error`) and broadcasts `from-backend` to renderer windows.
3. Renderer `useChatStream`:
   - Filters by active conversation/turn tracking.
   - Updates Zustand store for thinking, streaming text, tool messages, completion, errors.
   - Persists transcript rows (`recordUserMessage`, `recordAssistantMessage`, `recordToolMessage`).

### Tool Turn Flow

1. Backend emits `tool-call` or `tool-bundle`.
2. Renderer `useToolRunner` validates active turn and stale-turn guards.
3. `ToolExecutionService` executes sidecar-facing tools and sends `tool-result`/`tool-bundle-result` via IPC -> backend.
4. Tool output is rendered as assistant tool rows and persisted in transcript queue.

### Conversation/Transcript Flow

1. Renderer writes transcript rows through `INVOKE_CHANNELS.STORE_TRANSCRIPT`.
2. `TranscriptWriter` queues failed writes and retries when session info becomes available.
3. Dashboard sidebar/search open operations fetch transcript windows via sidecar RPC (`list-conversations`, `search-conversations`, `get-conversation`).
   `get-conversation` resume/hydrate paths use `message_index` cursor pagination (`after_message_index`) so large local DB transcripts are fully reloaded instead of capped at one page.
4. Resume action rehydrates backend context (`rehydrate-conversation`) and replaces in-memory renderer chat state.

### Wakeword/Voice Flow

1. Renderer wakeword hook captures mic PCM and sends `wakeword-audio-chunk` IPC.
2. Main wakeword bridge forwards framed audio to Python wakeword subprocess.
3. Detection emits `wakeword-detected` back to renderer + `wakeword-detected` backend event.
4. Renderer shows chatbox/focuses input; optional STT continuation uses voice-mode gateway hook.

### Permission Runtime Flow (Settings + Store Gate State)

1. Renderer `App.jsx` startup is still not hard permission-gated; it routes by VM mode + frontend onboarding slideshow completion state.
2. Frontend onboarding step 1 now mounts a permission checklist powered by `permissionStore` (manifest/status bootstrap + per-permission request actions).
3. `permissionStore` remains the canonical place for manifest fetch + permission gate derivation (`needsOnboarding`, required permission sets, manifest-version completion).
4. Onboarding and settings surfaces both call store helpers for permission runtime updates:
   - onboarding uses `REQUEST_PERMISSION` (per row) and `CHECK_PERMISSIONS` (global re-check)
   - `PermissionControlCenter` uses `RUN_PERMISSION_PROBE` (per row) and `CHECK_PERMISSIONS` (global recheck)

## Main Process Responsibilities

Primary modules:

- `main/index.cjs`:
  - Main-process composition root: assembles runtime modules and passes shared dependencies only.
  - Delegates lifecycle boot/activate/quit wiring to `main_process_lifecycle_runtime.cjs`.
  - Delegates split IPC handler registration to `overlay_phase_ipc_runtime.cjs`, `window_controls_ipc_runtime.cjs`, and `permission_ipc_runtime.cjs`.
  - Delegates surface/window ownership to `surface_runtime.cjs` and per-OS activation/protection/topmost policy to `window_platform_policy.cjs`.
  - Preserves sender-display affinity through composition when chat surfaces open the dashboard.
- `main/surface_runtime.cjs`:
  - Single owner for `mainWindow` / `chatWindow` / `responseWindow` refs plus response-overlay visibility + phase state.
  - Composes overlay positioning, wakeword visibility fan-out, blur-only capture prep, and one-time main-process IPC initialization behind one surface lifecycle boundary.
  - Exposes the window operations consumed by bootstrap/lifecycle modules (`showChatWindow`, `hideChatWindow`, `showMainWindow`, `applyResponseOverlayPhase`, `syncWindowDisplayAffinity`, VM worker shutdown).
- `main/main_window_runtime.cjs`:
  - Constructs dashboard/chat/response/tray windows and lazy renderer-view loading.
  - Leaves cross-platform overlay policy to `window_platform_policy.cjs` instead of setting topmost/workspace/content-protection flags inline.
- `main/window_platform_policy.cjs`:
  - Centralizes per-platform `BrowserWindow` policy for overlay topmost level, workspace/fullscreen visibility, content protection, and activation/focus handoff.
  - Keeps macOS/Windows/Linux window rules in one place so composition/runtime modules do not duplicate Electron platform conditionals.
- `main/ipc.cjs`:
  - Single backend WebSocket client lifecycle and reconnect.
  - Handshake/user/session/conversation context propagation.
  - Settings sync ACK tracking (`settings-updated`/timeout handling).
  - Applies the renderer-owned `global_agent_stop_shortcut` preference locally in main while filtering that key out of backend `update-settings` payloads.
  - Query preprocessing + local-user-message synthesis.
  - Artifact upload HTTP helper.
- `main/local_backend_bridge.cjs`:
  - Sidecar subprocess start/readiness ping/retry and JSON-RPC bridge wiring.
  - Uses `local_backend_supervisor.cjs` to track process identity plus explicit `starting|ready|stopping|error` lifecycle state.
  - JSON-RPC request correlation and timeout handling.
  - Tool execution handlers, system-state/memory RPC handlers.
  - Screenshot monitor resolution: visible sender-window display wins; otherwise screenshot tools fall back to the active query display affinity stored by `ipc.cjs`.
  - Screenshot args include virtual desktop bounds so sidecar screenshot capture can keep monitor targeting deterministic; Windows/Linux crop from all-displays captures when needed, while macOS uses direct bounded capture to avoid Retina scaling drift.
  - Screenshot execution wrapper delegates to `main/local_backend_bridge_window_visibility.cjs`, which selects `main/platform/screenshot_window_visibility/*` per OS.
- `main/window_visibility_runtime.cjs`:
  - Dashboard opens from the chat pill now target the sender display work area directly, avoiding Linux window-manager maximize hops that can reopen on the old monitor.
- `main/window_suppression_runtime.cjs`:
  - Owns offscreen screenshot suppression, suppression polling, and restore-bounds bookkeeping for dashboard capture prep.
- `main/overlay_window_helpers_runtime.cjs`:
  - Manual chat-pill drag position is stored in main and reused by later overlay positioning passes so recenter logic cannot fight a user drag.
- `main/wakeword_bridge.cjs`:
  - Wakeword subprocess lifecycle and framed stdout/stderr protocol handling.
  - Uses `wakeword_supervisor.cjs` to track process identity, readiness, enabled state, and terminal errors.
  - Binary length-prefixed detection frame parsing.
  - Enable/disable buffering policy to avoid stale detections.

## Renderer Responsibilities

### Provider and App Composition

- `renderer/app/App.jsx`: Root provider stack and dashboard shell mounting.
  - Startup route gate is VM mode + frontend onboarding slideshow completion.
  - No boot-time renderer permission gate in current `App.jsx`.
- `renderer/app/providers/AppConfigProvider.jsx`:
  - Frontend config load/merge/save.
  - Persists renderer-owned config such as `global_agent_stop_shortcut` locally without syncing that key to the backend.
  - Backend settings sync, backend model-list routing.
  - Wakeword suppression and effective wakeword state.
- `renderer/app/providers/AppProvider.jsx`:
  - Config/status coordination and keyboard interaction-mode toggle.
- `renderer/app/providers/ChatProvider.jsx`:
  - Wires `useChatStream` and `useToolRunner`.

### Chat Runtime

- `features/chat/stores/chatStore.ts`: canonical chat state + stream tracking.
- `features/chat/hooks/useChatStream.ts`:
 - Stream event routing (`llm-thought`, `streaming-response`, `tool-call`, `tool-output`, `streaming-complete`, etc.).
  - Conversation gating, turn tracking, token-count handling.
  - Dev transparency source tagging: in `electron:dev` (`dev_ui=1`), message/thinking/response surfaces show source badges mapped to stream/event origin (`streaming-response`, `tool-call`, `tool-output`, `llm-thought`, etc.).
  - Stream trace logging is separately gated by `WINDIE_DEBUG_STREAM_EVENTS=1`, which main process fans out as `?debug_stream=1` so renderer consoles stay quiet during normal `electron:dev` runs.
- `features/chat/hooks/useToolRunner.ts`:
  - Executes incoming tool calls/bundles, stale-turn cancellation responses.
- `features/chat/components/ChatInterface.jsx`:
  - Provider + model selectors, stop/new-chat actions, speech toggle, retry/edit message flows.
  - Focused-window `Esc` stop handler wired to the same stop-query path as the stop button.
- `features/chat/components/MessageList.jsx`:
  - Message rendering + inline user-message editor.

### Permission Runtime

- `features/permissions/stores/permissionStore.js`:
  - Manifest/status fetch + gate-state derivation (`needsOnboarding`, required IDs, missing required permissions, `completedForManifest`).
  - Probe/recheck/request action helpers and onboarding-state persistence utilities.
- `features/permissions/components/PermissionControlCenter.jsx`:
  - Settings-surface live permission status with `Re-check` per-row probe and `Re-run checks` global refresh.

### Dashboard Runtime

- `features/dashboard/components/ChatGptDashboardShell.jsx`:
  - Sidebar + modal surface orchestration.
  - Conversation search/recent grouping/open/rename/pin/delete actions.
  - `main-window-open-target` IPC target routing (`chat|settings|models|memory`).
- `features/dashboard/components/sections/SettingsSection.jsx`:
  - General settings controls for wakeword, TTS, and the configurable global stop shortcut.
  - Shortcut choices come from a shared platform catalog so the dashboard, onboarding, and main-process global registration stay aligned.
- `features/dashboard/hooks/useDashboardConversations.js`:
  - Extracted conversation runtime state: list/search fetch, open/rehydrate, rename/pin/delete handlers, transcript-entry polling.
- `features/dashboard/components/sections/MemorySection.jsx`:
  - Unified episodic/semantic/procedural view.
  - Fetch/delete semantic memory via sidecar RPC.
  - Local editable/add flows for panel state.
- `features/dashboard/components/sections/ModelsSection.jsx`:
  - Provider-first model selection, fallback reconciliation, API-key section.

### Voice Runtime

- `features/voice/hooks/useWakewordDetection.ts`: wakeword PCM capture + confidence/cooldown gating.
- `features/voice/hooks/useVoiceMode.ts`: gateway websocket + live transcription streaming.
- `app/WakewordController.jsx`: backend wakeword event + chatbox show/focus behavior.

### Shared Infrastructure

- `infrastructure/ipc/bridge.ts`: typed channel wrappers over preload API.
- `infrastructure/api/client.ts`: typed backend command emitter.
- `infrastructure/transcript/TranscriptWriter.ts`: transcript session state + queued persistence.
- `infrastructure/services/ToolExecutionService.ts`: tool execution/capture bundling.
- `infrastructure/services/surfaceOrchestrator/platform/surfaceVisibility/*`: explicit per-OS screenshot chat-pill policy (Linux hides; Windows/macOS no-op).
- `infrastructure/audio/PlayerService.ts`: chunk queue decode/playback.

## Sidecar Responsibilities (`frontend/src/main/python`)

- `local_backend.py`:
  - JSON-RPC method registry for tool/system-state/transcript/memory operations.
  - Memory summarization watermark logic and transcript routing.
- `tools/registry.py`:
  - Canonical sidecar-exposed tool surface for backend contract parity.
- `memory/local_store.py`:
  - SQLite + FAISS local storage.
  - Separate episodic/semantic stores and vector mapping sync.
  - Remote embedding/title client integrations.
- `core/system_state.py` + `core/platform/*`:
  - OS-aware active-window/mouse/display/system-state probes.

## Current Frontend Refactor Notes (2026-02-26)

Canonical current behavior that replaced older module splits:

- Token counter UI component removed from active renderer surfaces.
- Memory panel consolidated into `MemorySection` + `MemoryItem`; old `EpisodicMemorySection`/`SemanticMemorySection` split is retired.
- Tool ghost lifecycle moved away from old `useToolGhostLifecycle.js` + `toolGhostPreview.js` utility ownership.
- Dashboard utility storage/settings helper split changed; provider/model/memory helpers now live in section-local data/helper files.
- Stream updater logic now centralized in `useStreamMessageUpdaters.ts` and transcript payload formatting in `transcriptMessagePayload.js`.

Use inventory docs as source of truth before touching older deep references.
