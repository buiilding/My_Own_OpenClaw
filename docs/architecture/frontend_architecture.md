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

## Current Source Layout

```text
frontend/src/
├── main/
│   ├── index.cjs                          # Electron app + overlay window orchestration
│   ├── ipc.cjs                            # Renderer <-> backend WS bridge and event fan-out
│   ├── local_backend_bridge*.cjs          # Main <-> sidecar JSON-RPC bridge
│   ├── wakeword_bridge.cjs                # Main <-> wakeword subprocess bridge
│   ├── query_payload_builder.cjs          # System-state/memory XML augmentation for query payload
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
4. Resume action rehydrates backend context (`rehydrate-conversation`) and replaces in-memory renderer chat state.

### Wakeword/Voice Flow

1. Renderer wakeword hook captures mic PCM and sends `wakeword-audio-chunk` IPC.
2. Main wakeword bridge forwards framed audio to Python wakeword subprocess.
3. Detection emits `wakeword-detected` back to renderer + `wakeword-detected` backend event.
4. Renderer shows chatbox/focuses input; optional STT continuation uses voice-mode gateway hook.

## Main Process Responsibilities

Primary modules:

- `main/index.cjs`:
  - App boot, tray, shortcuts.
  - Main/dashboard/chatbox/response/context-label window orchestration.
  - Overlay bounds, click-through, focus capture restore, response-phase visibility.
  - Linux screenshot hide/restore behavior for overlay windows.
  - Linux sudo toggle flow (`agent_sudo_access_handler.cjs`) for passwordless sudo policy file management.
- `main/ipc.cjs`:
  - Single backend WebSocket client lifecycle and reconnect.
  - Handshake/user/session/conversation context propagation.
  - Settings sync ACK tracking (`settings-updated`/timeout handling).
  - Query preprocessing + local-user-message synthesis.
  - Artifact upload HTTP helper.
- `main/local_backend_bridge.cjs`:
  - Sidecar subprocess start/readiness ping/retry.
  - JSON-RPC request correlation and timeout handling.
  - Tool execution handlers, system-state/memory RPC handlers.
  - Screenshot execution wrapper that temporarily hides windows on Linux.
- `main/wakeword_bridge.cjs`:
  - Wakeword subprocess lifecycle.
  - Binary length-prefixed detection frame parsing.
  - Enable/disable buffering policy to avoid stale detections.

## Renderer Responsibilities

### Provider and App Composition

- `renderer/app/App.jsx`: Root provider stack and dashboard shell mounting.
- `renderer/app/providers/AppConfigProvider.jsx`:
  - Frontend config load/merge/save.
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
- `features/chat/hooks/useToolRunner.ts`:
  - Executes incoming tool calls/bundles, stale-turn cancellation responses.
- `features/chat/components/ChatInterface.jsx`:
  - Model selector, stop/new-chat actions, speech toggle, retry/edit message flows.
- `features/chat/components/MessageList.jsx`:
  - Message rendering + inline user-message editor.

### Dashboard Runtime

- `features/dashboard/components/ChatGptDashboardShell.jsx`:
  - Sidebar + modal surface orchestration.
  - Conversation search/recent grouping/open/rename/pin/delete actions.
  - `main-window-open-target` IPC target routing (`chat|settings|models|memory`).
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
