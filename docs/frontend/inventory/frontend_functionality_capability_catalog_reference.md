---
summary: "Capability-level frontend catalog across Electron main, preload, renderer, sidecar, and landing ownership."
read_when:
  - When you need a capability-first frontend map before touching code.
  - When validating cross-process runtime contracts across renderer/main/sidecar.
title: "Frontend Functionality Capability Catalog Reference"
---

# Frontend Functionality Capability Catalog Reference

This page is the capability-first technical catalog for `frontend/src`.

## Coverage Snapshot (2026-03-05)

- Main process (`frontend/src/main`, `.cjs|.js`): `58`
- Sidecar runtime (`frontend/src/main/python`, `.py`): `156`
- Renderer runtime (`frontend/src/renderer`, `.ts|.tsx|.js|.jsx`): `201`
- Landing (`frontend/src/landing`, `.jsx|.css`): `13`
- Preload bridge (`frontend/src/preload.js`): `1`
- Total covered frontend files: `429`

## IPC Surface Snapshot (Typed Renderer Channel Catalog)

- `SEND_CHANNELS`: `6`
- `INVOKE_CHANNELS`: `35`
- `ON_CHANNELS`: `12`
- `ipc.cjs` settings ACK timeout (`SETTINGS_SYNC_TIMEOUT_MS`): `2500ms`

## 1) Main Process Capability Catalog

Primary files:

- `frontend/src/main/index.cjs`
- `frontend/src/main/main_window_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/overlay_signal_runtime.cjs`
- `frontend/src/main/overlay_window_helpers_runtime.cjs`
- `frontend/src/main/overlay_topmost_runtime.cjs`
- `frontend/src/main/runtime_mode.cjs`
- `frontend/src/main/vm_worker_runtime.cjs`

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
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/openai_codex_oauth.cjs`

Capabilities:

- Maintains backend websocket session and handshake to `/ws`.
- Relays backend stream envelopes to renderer windows (`from-backend`).
- Enforces first-query settings-sync ACK/timeout policy through `ipc_settings_sync` helpers.
- Builds query payload with memory/system context sections.
- Emits synthetic local-user-message and user-safe error fallbacks for send failures.
- Persists frontend config to disk and returns merged config payloads to renderer.
- Query send path resolves `conversation_ref` from payload or cached backend-ref fallback and reuses it for both local echo and outbound websocket message.
- Query send gates first turn on config sync only when cached frontend config payload is object-valid; invalid payloads are dropped instead of sent.
- Exposes OpenAI Codex OAuth login/logout IPC handlers backed by PKCE + local callback server flow.

## 3) Main Local Sidecar + Permission/Privilege Bridges

Primary files:

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/permission_service.cjs`
- `frontend/src/main/agent_sudo_access_handler.cjs`

Capabilities:

- Starts and supervises sidecar process, ping-readiness, and JSON-RPC request correlation.
- Executes sidecar-exposed tool and memory/transcript RPC handlers through typed mapper layer.
- Routes screenshot tool execution through platform screenshot visibility runtime wrapper.
- Streams wakeword audio binary frames and receives framed detection payloads.
- Delegates wakeword stderr readiness/error parsing, startup/process error mapping, and audio chunk normalization to helper runtime module.
- Provides permission list/check/request/probe IPC contracts for onboarding.
- Provides Linux sudo enable/disable path with normalized renderer-safe result semantics.
- Sidecar spawn env injects `WINDIE_BACKEND_HTTP_URL` and enforces `NODE_OPTIONS=--no-deprecation` append policy via bridge utils.
- Sidecar readiness checks use bounded ping retry (`<=10` attempts, exponential backoff capped at `1000ms`) with stale-generation token guards.
- Local sidecar RPC request timeout defaults to `30s` (`120s` for browser tool), with canonical `{success:false,error}` response normalization for failures.
- Screenshot visibility runtime wrapper currently executes pass-through behavior across platforms; Linux hide/show ownership is renderer capture orchestration.
- Wakeword bridge uses length-prefixed binary frame protocol for audio/result streams and clears stale stdout/stderr buffers on restart/exit.

## 3.5) VM Worker and Hosted Runs Bridge

Primary files:

- `frontend/src/main/runtime_mode.cjs`
- `frontend/src/main/vm_worker_runtime.cjs`
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
- `frontend/src/renderer/app/{ChatBoxApp,ChatBoxResponseApp,ChatBoxContextLabelApp,ToolGhostDebugApp}.jsx`
- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/app/providers/{appConfigPersistence,configComparison}.js`

Capabilities:

- Routes renderer entry by `?view=` across full app and overlay/debug-specific roots.
- Mounts provider stack (`AppProvider` + `ChatProvider`) with shared status/config hooks.
- Provider-level config comparison/persistence guards avoid redundant writes and stale-config merges.
- Enforces permission-onboarding gate before dashboard/chat runtime.
- Boots wakeword controller and chat stream/tool-runner runtime at app scope.

## 6) Renderer Chat + Stream + Tool Execution

Primary files:

- `frontend/src/renderer/features/chat/hooks/{useChatMessageSender,useChatStream,useToolRunner,useStreamMessageUpdaters}.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/components/*`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`

Capabilities:

- Message send pipeline supports typed payload normalization and optional screenshot artifact upload.
- Streaming pipeline handles thought/chunk/complete/error/tool/context-compaction event families.
- Shared turn-scoped stream guards reject stale reply, metadata, compaction, terminal, and tool packets per workspace; tool runner reuses the same handoff semantics for stale-turn cancellation.
- Tool runner executes single and bundle tool requests and posts structured result payloads back to backend.
- Transcript writer persists user/assistant/tool entries with pending-queue retry semantics.
- Tool execution service includes capture, artifact upload, formatting, and backend callback fanout.
- Tool-runner safety flow no longer exposes separate overlay-prep IPC; renderer surface orchestration plus main-process overlay phase handling own the loop guard behavior.

## 7) Renderer Dashboard + Settings + Permissions + Voice

Primary files:

- `frontend/src/renderer/features/dashboard/components/*`
- `frontend/src/renderer/features/dashboard/hooks/*`
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- `frontend/src/renderer/features/permissions/components/*`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/voice/hooks/*`

Capabilities:

- Dashboard shell routes sections (memory/models/settings/usage) with search + transcript open/rehydrate.
- Memory panel supports episodic/semantic fetch, local edit/search state, and episodic/semantic delete for backend-backed rows.
- Models panel reconciles provider/model selection + provider API-key controls.
- Settings hook syncs renderer config edits through typed main-process IPC path.
- Permissions store derives runtime gate state from manifest/status/onboarding metadata, while current renderer startup is not blocked by a permission wizard gate.
- Voice runtime supports wakeword detection path and Nova voice streaming mode.

## 8) Sidecar Runtime Capability Catalog

Primary files:

- Entrypoints: `frontend/src/main/python/{local_backend,memory_service,wakeword_service}.py`
- Core: `frontend/src/main/python/core/*`, `frontend/src/main/python/core/{remote_api_client_base,remote_title_client}.py`
- Memory: `frontend/src/main/python/memory/*`
- Tools: `frontend/src/main/python/tools/*`

Capabilities:

- Local backend JSON-RPC host for tool execution, memory operations, and transcript persistence.
- Core protocol runtime includes request framing, stdout JSON transport, shutdown handling, and platform adapters.
- Memory runtime uses SQLite + FAISS with transcript search/list/get/delete and semantic summarization workflow.
- Sidecar core remote clients call backend semantic/title/embedding routes with shared retry/error policy wrappers.
- Tool runtime exposes computer/filesystem/system/browser/memory tool suites with normalized result envelopes.
- Browser stack includes native chrome controller contracts and vendored Browser Use runtime modules.

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

1. Renderer `ApiClient.sendQuery` sends query intent over main-process bridge.
2. Main process enriches payload and relays to backend WebSocket.
3. Backend stream envelopes relay from main to renderer `from-backend`.
4. `useChatStream` updates chat state + transcript and tracks active turn phase.
5. `tool-call`/`tool-bundle` events execute through `ToolExecutionService` and sidecar RPC.
6. Tool results route back to backend as `tool-result`/`tool-bundle-result`.

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Full Functionality Inventory Reference](frontend_full_functionality_inventory_reference.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
- [Frontend Module File Index Reference](frontend_module_file_index_reference.md)
