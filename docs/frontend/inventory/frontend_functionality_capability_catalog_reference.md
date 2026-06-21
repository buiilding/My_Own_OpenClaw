---
summary: "Capability-level frontend catalog across Electron main, preload, renderer, local-runtime Python, and landing ownership."
read_when:
  - When you need a capability-first frontend map before touching code.
  - When validating cross-process runtime contracts across renderer/main/local-runtime.
title: "Frontend Functionality Capability Catalog Reference"
---

# Frontend Functionality Capability Catalog Reference

This page is the capability-first technical catalog for `frontend/src`.

## Coverage Snapshot (2026-03-05)

- Main process (`frontend/src/main`, `.cjs|.js`): `58`
- Local-runtime Python (`frontend/src/main/python`, `.py`): `156`
- Renderer runtime (`frontend/src/renderer`, `.ts|.tsx|.js|.jsx`): `202`
- Landing (`frontend/src/landing`, `.jsx|.css`): `13`
- Preload bridge (`frontend/src/preload.js`): `1`
- Total covered frontend files: `430`

## IPC Surface Snapshot (Typed Renderer Channel Catalog)

- `SEND_CHANNELS`: `6`
- `INVOKE_CHANNELS`: `35`
- `ON_CHANNELS`: `12`
- `ipc.cjs` settings ACK timeout (`SETTINGS_SYNC_TIMEOUT_MS`): `2500ms`

## 1) Main Process Capability Catalog

Primary files:

- `frontend/src/main/index.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/surfaces/overlay_signal_runtime.cjs`
- `frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs`
- `frontend/src/main/surfaces/overlay_topmost_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`
- `frontend/src/main/app/vm_worker_runtime.cjs`

Capabilities:

- Boots Electron app and creates dashboard + overlay windows.
- Splits lifecycle wiring (startup/activate/quit/global-shortcut) from window action handlers.
- Maintains response-overlay phase machine and visibility broadcasts across windows.
- Maintains overlay bounds, top-most order, click-through policy, and fallback positioning.
- Supports wakeword hotkey toggle and wakeword STT trigger relays.
- Uses blur-only overlay query-capture prep instead of cross-app focus restoration.
- Gates VM mode/worker mode from env and starts an automated VM worker runtime loop when enabled.

## 2) Main IPC + Backend Relay

Primary files:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`

Capabilities:

- Adapts renderer/backend-bound work to the SDK runtime, which owns the backend websocket session and handshake to `/ws`.
- Relays SDK conversation events and typed backend side channels to renderer
  windows (`windie:conversation-event`, `backend-settings-event`,
  `agent-capability-event`, `audio-chunk`).
- Enforces first-query settings-sync ACK/timeout policy through `ipc_settings_sync` helpers.
- Builds query payload with memory/system context sections.
- Relays SDK `user_message` projections and user-safe error fallbacks for send
  failures.
- Persists desktop UI config to disk and returns merged config payloads to renderer.
- Query send path resolves `conversation_ref` from payload or cached backend-ref fallback and reuses it for both local echo and outbound websocket message.
- Query send gates first turn on config sync only when cached desktop UI config payload is object-valid; invalid payloads are dropped instead of sent.

## 3) Main Local Runtime + Permission/Privilege Bridges

Primary files:

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_utils.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/permissions/permission_service.cjs`

Capabilities:

- Starts and supervises the SDK local-runtime daemon, ping-readiness, and JSON-RPC request correlation.
- Executes local-runtime exposed tools through scoped host helpers; memory and
  transcript persistence use SDK local-runtime store calls.
- Routes screenshot tool execution through the local-runtime window-visibility path.
- Streams wakeword audio binary frames and receives framed detection payloads.
- Delegates wakeword stderr readiness/error parsing, startup/process error mapping, and audio chunk normalization to helper runtime module.
- Provides permission list/check/request/probe IPC contracts for onboarding.
- Local-runtime Python spawn env injects `WINDIE_BACKEND_HTTP_URL` and enforces `NODE_OPTIONS=--no-deprecation` append policy via bridge utils.
- Local-runtime readiness checks use bounded ping retry (`<=10` attempts, exponential backoff capped at `1000ms`) with stale-generation token guards.
- Local-runtime RPC request timeout defaults to `30s` (`120s` for browser tool), with canonical `{success:false,error}` response normalization for failures.
- Screenshot tool execution currently calls the local-runtime screenshot task directly; Linux hide/show ownership is SDK/main surface prep and renderer attachment capture orchestration.
- Wakeword bridge uses length-prefixed binary frame protocol for audio/result streams and clears stale stdout/stderr buffers on restart/exit.

## 3.5) VM Worker and Hosted Runs Bridge

Primary files:

- `frontend/src/main/app/runtime_mode.cjs`
- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/index.cjs`

Capabilities:

- Resolves worker-mode activation from `WINDIE_VM_MODE` / `WINDIE_VM_WORKER_MODE`.
- Polls backend `/api/runs/workers/heartbeat` on interval for assignments and control commands.
- Dispatches assigned runs through existing websocket query path and acknowledges `/api/runs/{run_id}/worker-dispatched`.
- Relays backend stream events into run timelines (`/api/runs/{run_id}/events`) with run/conversation correlation.
- Applies stop controls via websocket `stop-query` for mapped run conversations.

## 4) Preload Boundary

Primary file:

- `frontend/src/preload.js`

Capabilities:

- Exposes allowlisted `send`/`invoke`/`on`/`once` channels only.
- Preserves context-isolated boundary; no direct Node/Electron surface leak to renderer.
- Enforces renderer-to-main channel constant parity via preload allowlist.
- Disallows non-allowlisted channels at preload boundary so renderer code cannot invoke arbitrary Electron IPC handlers.

## 5) Renderer Entrypoint + Provider Composition

Primary files:

- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/{MinimalChatPillApp,MinimalResponseOverlayApp,ToolGhostDebugApp}.jsx`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/app/providers/{appConfigPersistence,configComparison}.js`

Capabilities:

- Routes renderer entry by `?view=` across full app and overlay/debug-specific roots.
- Mounts provider stack (`AppProvider` + `ChatProvider`) with shared status/config hooks.
- Provider-level config comparison/persistence guards avoid redundant writes and stale-config merges.
- Enforces permission-onboarding gate before dashboard/chat runtime.
- Boots wakeword controller and chat stream display runtime at app scope; local tool execution is owned by the Agent SDK runtime.

## 6) Renderer Chat + Stream + Tool Execution

Primary files:

- `frontend/src/renderer/features/chat/hooks/{useChatMessageSender,useChatStream,useStreamMessageUpdaters}.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/components/*`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`

Capabilities:

- Message send pipeline supports typed payload normalization and optional screenshot artifact upload.
- Streaming pipeline handles thought/chunk/complete/error/tool/context-compaction event families.
- Shared turn-scoped stream guards reject stale reply, metadata, compaction, terminal, and tool packets per workspace; SDK runtime owns stale local tool waits.
- SDK runtime executes single and bundle tool requests through the SDK local-runtime client and posts structured result payloads back to backend.
- Desktop transcript projection runtime persists user/assistant/tool entries with pending-queue retry semantics.
- SDK tool coordination owns local execution capture, artifact materialization,
  result formatting, and backend result delivery; renderer chat only displays
  projected tool state.
- Tool-runner safety flow no longer exposes separate overlay-prep IPC; renderer surface orchestration plus main-process overlay phase handling own the loop guard behavior.

## 7) Renderer Dashboard + Settings + Permissions + Voice

Primary files:

- `frontend/src/renderer/features/dashboard/components/*`
- `frontend/src/renderer/features/dashboard/hooks/*`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/features/permissions/components/*`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/voice/hooks/*`

Capabilities:

- Dashboard shell routes sections (memory/models/settings/usage) with search + transcript open/rehydrate.
- Memory panel supports episodic/semantic fetch, local search state, and episodic/semantic delete for backend-backed rows; add/edit controls are hidden until backed by durable memory create/update IPC.
- Models panel reconciles provider/model selection + provider API-key controls.
- Settings hook syncs renderer config edits through typed main-process IPC path.
- Permissions store derives runtime gate state from manifest/status/onboarding metadata, while current renderer startup is not blocked by a permission wizard gate.
- Voice runtime supports wakeword detection path and Nova voice streaming mode.

## 8) Local-Runtime Python Capability Catalog

Primary files:

- Entrypoints: `frontend/src/main/python/{local_backend,wakeword_service}.py`
- Core: `frontend/src/main/python/core/*`, `frontend/src/main/python/windie/_remote_api_client_base.py`
- Memory: `frontend/src/main/python/memory/*`
- Tools: `frontend/src/main/python/tools/*`

Capabilities:

- Local-runtime JSON-RPC host backed by the local-runtime Python implementation for
  tool execution, memory operations, and transcript persistence.
- Core protocol runtime includes request framing, stdout JSON transport, shutdown handling, and platform adapters.
- Memory runtime uses SQLite + FAISS with transcript search/list/get/delete and semantic summarization workflow.
- Local-runtime remote clients call backend semantic routes with shared
  retry/error policy wrappers; embedding generation is SDK-owned.
- Tool runtime exposes computer/filesystem/system/browser/memory tool suites with normalized result envelopes.
- Browser stack uses local-runtime browser adapters backed by local-runtime Python
  implementation over the official Browser Use CLI package.

## 9) Landing Surface Catalog

Primary files:

- `frontend/src/landing/main.jsx`
- `frontend/src/landing/LandingPage.jsx`
- `frontend/src/landing/components/*`
- `frontend/src/landing/styles/*`

Capabilities:

- Standalone landing/runtime entry independent from desktop app shell.
- Section-based capability narrative and CTA anchor flow.
- Shared tokenized CSS styles and section animation/layout contracts.

## 10) End-to-End Path Checkpoints

1. Renderer `DesktopLiveTurnRuntimeClient.sendQuery` sends query intent through the SDK conversation runtime and SDK desktop transport adapter.
2. Main process enriches payload and hands it to the SDK runtime for backend WebSocket transport.
3. SDK conversation events relay from main to renderer
   `windie:conversation-event`; backend settings/capability/audio side channels
   use their typed renderer channels.
4. `useChatStream` updates chat state + transcript from SDK projections and
   tracks active turn phase.
5. `tool-call`/`tool-bundle` events route through the SDK runtime to the local-runtime executor.
6. Tool results route back to backend as `tool-result`/`tool-bundle-result`.

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Full Functionality Inventory Reference](frontend_full_functionality_inventory_reference.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
- [Frontend Module File Index Reference](frontend_module_file_index_reference.md)
