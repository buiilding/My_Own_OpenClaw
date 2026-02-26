---
summary: "Current exhaustive frontend functionality inventory across Electron main, preload bridge, renderer runtime, and Python sidecar services."
read_when:
  - When auditing frontend behavior ownership across main/renderer/sidecar.
  - When updating frontend features and validating cross-process contracts.
title: "Frontend Full Functionality Inventory Reference"
---

# Frontend Full Functionality Inventory Reference

This is the canonical current-state functionality inventory for `frontend/src`.

## Coverage Snapshot (2026-02-26)

Source counts used in this inventory:

- Main process (`frontend/src/main`, `.cjs|.js`): `24`
- Sidecar runtime (`frontend/src/main/python`, `.py`): `140`
- Renderer runtime (`frontend/src/renderer`, `.ts|.tsx|.js|.jsx`): `117`
- Landing (`frontend/src/landing`, `.jsx|.css`): `13`
- Preload bridge (`frontend/src/preload.js`): `1`
- Total covered frontend files: `295`

## 1) Electron Main Process Inventory

### 1.1 App + Window Runtime

Primary files:

- `frontend/src/main/index.cjs`
- `frontend/src/main/overlay_bounds.cjs`
- `frontend/src/main/overlay_visibility_handler.cjs`
- `frontend/src/main/overlay_mouse_handler.cjs`
- `frontend/src/main/overlay_chatbox_handler.cjs`
- `frontend/src/main/overlay_responsebox_handler.cjs`
- `frontend/src/main/overlay_renderer_registration.cjs`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/external_focus_tracker.cjs`
- `frontend/src/main/main_window_controls_handler.cjs`
- `frontend/src/main/display_query_handler.cjs`

Functionality:

- Boots Electron app and creates main/dashboard + overlay windows.
- Manages response overlay phase transitions and overlay visibility.
- Maintains overlay z-order and click-through behavior.
- Handles overlay repositioning on display/window changes.
- Tracks external focused window before overlay query capture and restores focus.
- Applies Linux-specific screenshot hide/restore guard for overlays.
- Registers global wakeword hotkey and open-target window routing.

### 1.2 Backend WebSocket + IPC Orchestration

Primary files:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`

Functionality:

- Opens backend websocket (`/ws`) and sends handshake with validated user id.
- Tracks backend session/user/conversation identifiers from stream envelopes.
- Broadcasts backend events to all renderer windows (`from-backend`).
- Maintains settings-sync ACK lifecycle with timeout protection.
- Gates first query behind initial settings sync attempt.
- Builds query payload content with system-context XML + memory sections.
- Emits synthetic `local-user-message` and fallback error envelopes for failed sends.
- Persists/loads frontend config to disk and keeps in-memory config snapshot.

### 1.3 Local Sidecar Bridge (Main <-> Python)

Primary files:

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/main/runtime_paths.cjs`

Functionality:

- Starts/stops sidecar process and verifies readiness with ping retries.
- Correlates JSON-RPC request/response ids and enforces request timeouts.
- Registers mapped IPC handlers for memory/transcript/system APIs.
- Executes tool calls and normalizes tool args (`run_shell_command` sudo mode injection).
- Applies Linux screenshot execution window hiding/restoration.

### 1.4 Wakeword + Privilege Bridges

Primary files:

- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/agent_sudo_access_handler.cjs`

Functionality:

- Wakeword bridge:
  - Starts python wakeword service lazily on enable.
  - Streams length-prefixed audio frames to subprocess.
  - Parses length-prefixed detection results and relays `wakeword-detected`.
  - Flushes stale buffers when disabled.
- Agent sudo bridge (Linux-only):
  - Enables passwordless sudo via `pkexec` + sudoers file write/validate.
  - Disables via non-interactive `sudo -n` path.
  - Normalizes cancellation/auth failure reasons for renderer UX.

## 2) Preload Boundary Inventory

Primary file:

- `frontend/src/preload.js`

Functionality:

- Exposes allowlisted `send`/`invoke`/`on`/`once` IPC APIs to renderer.
- Enforces channel-level safety across context-isolated boundary.
- Prevents direct Node/electron API exposure to renderer runtime.

## 3) Renderer Runtime Inventory

### 3.1 App + Provider Composition

Primary files:

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/app/providers/*`

Functionality:

- Mounts provider stack (`AppConfigProvider` + `AppStatusProvider` + `ChatProvider`).
- Loads/syncs frontend config with disk/localStorage/backend update-settings.
- Maintains wakeword preference/suppression state.
- Coordinates save-state callback from config updates into status context.
- Boots chat stream + tool runner hooks at app scope.

### 3.2 Chat Feature Runtime

Primary files:

- Components: `frontend/src/renderer/features/chat/components/*`
- Hooks: `frontend/src/renderer/features/chat/hooks/*`
- Store: `frontend/src/renderer/features/chat/stores/chatStore.ts`
- Helpers/policies/constants: `frontend/src/renderer/features/chat/{utils,policies,constants}/*`

Functionality:

- Send pipeline:
  - Message send, optional screenshot attachment, stream-phase gating.
- Stream pipeline (`useChatStream`):
  - Handles `llm-thought`, `streaming-response`, `streaming-complete`.
  - Handles `tool-call`, `tool-output`, `tool-bundle` render and transcript writes.
  - Handles `context-compaction-*`, `system-prompt`, `assistant-message-full`, `error`.
- Tool execution (`useToolRunner`):
  - Executes incoming tool calls/bundles through `ToolExecutionService`.
  - Cancels stale-turn tool events with synthetic failure response payloads.
- Conversation actions:
  - New chat reset.
  - Assistant retry from selected assistant message.
  - Inline user-message edit and resend from edited point.
- UI composition:
  - `ChatInterface` header model selector + speech toggle.
  - `MessageList` with inline user edit composer.
  - `MessageTransparencySections` for debug transparency blocks.
  - Chatbox/response overlay companion surfaces.

### 3.3 Dashboard Runtime

Primary files:

- Shell: `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- Sidebar/search: `DashboardSidebar.jsx`, `SearchChatsModal.jsx`
- Sections:
  - `MemorySection.jsx`, `MemoryItem.jsx`, `memorySectionData.js`
  - `ModelsSection.jsx`, `modelCardData.js`, `modelCards.jsx`, `providerApiKeys.js`, `ApiKeysSection.jsx`
  - `SettingsSection.jsx`, `UsageSection.jsx`
- Utilities/hooks:
  - `utils/episodicMemoryUtils.js`, `utils/modelSelectionUtils.js`
  - `hooks/useTranscriptSessionInfo.js`

Functionality:

- Sidebar navigation and panel modal orchestration.
- Recent chat list fetch/grouping (today/yesterday/last-7-days/older).
- Transcript search modal and conversation open/rehydrate path.
- Conversation row actions: rename, pin/unpin, delete.
- Memory panel:
  - Unified episodic/semantic/procedural tabs.
  - Episodic/semantic list RPC fetch.
  - Semantic delete RPC path.
  - Local edit/add/search/expand UX state.
- Models panel:
  - Provider-first model selector.
  - Missing-model fallback reconciliation.
  - Provider API-key enable/input controls.

### 3.4 Voice Runtime

Primary files:

- Hooks: `frontend/src/renderer/features/voice/hooks/*`
- Components/utils: `frontend/src/renderer/features/voice/components/*`, `utils/*`

Functionality:

- Wakeword detection hook:
  - Captures mic audio via ScriptProcessor.
  - Encodes float PCM -> int16 and pushes IPC chunks.
  - Applies confidence threshold and cooldown suppression.
- Voice mode hook:
  - Connects to Nova voice gateway websocket.
  - Streams audio frames and receives realtime transcription.
  - Triggers utterance-end callbacks and reconnect backoff policy.
- `WakewordController`:
  - Sends backend `wakeword-detected` event.
  - Opens chatbox on detection.

### 3.5 Renderer Infrastructure Runtime

Primary files:

- API client: `frontend/src/renderer/infrastructure/api/client.ts`
- IPC bridge/channels: `frontend/src/renderer/infrastructure/ipc/*`
- Transcript writer/session/queues: `frontend/src/renderer/infrastructure/transcript/*`
- Tool execution stack: `frontend/src/renderer/infrastructure/services/*`
- Audio playback: `frontend/src/renderer/infrastructure/audio/PlayerService.ts`

Functionality:

- Typed API event emitters for backend command types.
- Typed IPC wrappers with dev-mode channel guards.
- Transcript session state persistence and queued write retry.
- Tool execution bundling, payload normalization, capture orchestration.
- Streaming TTS audio queue/decode/playback lifecycle.

## 4) Python Sidecar Runtime Inventory

### 4.1 Entrypoints

Primary files:

- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/wakeword_service.py`

Functionality:

- Local backend JSON-RPC protocol host for tools/system/memory/transcript APIs.
- Memory service specialization for memory-only flows.
- Wakeword inference subprocess with binary frame protocol.

### 4.2 Tool Runtime

Primary files:

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/{computer,filesystem,system,browser,memory}/*`

Functionality:

- Registers exposed sidecar tools expected by backend schemas.
- Executes mouse/keyboard/scroll/screenshot/system/window/stats/shell/process tools.
- Executes filesystem read/replace tooling with validation + atomic update behavior.
- Executes browser runtime actions via browser stack adapters/contracts.
- Normalizes result envelopes to `{success,data,error}` style.

### 4.3 Memory Runtime

Primary files:

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/{operations,summarizer,sqlite_store,faiss_index,watermark_state,conversation_titles}.py`

Functionality:

- SQLite + FAISS storage for episodic/semantic memory.
- Embedding/title backend API client usage for vector/title generation.
- Transcript persistence/search/list/get/delete operations.
- Summarizer watermark and semantic candidate handling.
- Conversation title generation lifecycle.

### 4.4 Core Runtime

Primary files:

- `frontend/src/main/python/core/{ipc_protocol,system_state,system_metrics,runtime_shutdown,stdout_json,thread_pool}.py`
- `frontend/src/main/python/core/platform/*`

Functionality:

- JSON-RPC request parsing/dispatch.
- Graceful signal/shutdown flow.
- OS-specific system-state probes.
- Runtime thread/worker helpers and JSON stdout helpers.

## 5) Landing Surface Inventory

Primary files:

- `frontend/src/landing/main.jsx`, `LandingPage.jsx`
- `frontend/src/landing/components/*`
- `frontend/src/landing/styles/*`

Functionality:

- Standalone marketing/onboarding presentation.
- Sectioned product narrative components (hero/how/privacy/roadmap/etc).
- CSS token + section style composition.

## 6) Current Refactor Delta Notes (Important)

Canonical current frontend now differs from older deep-doc slices:

- Old token display component path (`TokenCountDisplay`) is no longer an active render surface.
- Memory dashboard is unified under `MemorySection` + section-local data helpers.
- Old split memory section components and context-menu hotkey helper paths are retired.
- Old response overlay ghost lifecycle helper/util file paths were replaced by current runtime wiring.
- Chat stream update helpers moved into `useStreamMessageUpdaters.ts` and related modern utils.

When deep references disagree with this page, treat this inventory as source of truth and update the deep pages.
