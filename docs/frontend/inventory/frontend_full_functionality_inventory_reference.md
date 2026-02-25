---
summary: "Exhaustive frontend functionality inventory across Electron main, preload, renderer, sidecar Python runtime, and landing application surfaces."
read_when:
  - When auditing frontend feature coverage or onboarding across all frontend runtime surfaces.
  - When adding/changing frontend behavior and deciding ownership between main/renderer/sidecar layers.
title: "Frontend Full Functionality Inventory Reference"
---

# Frontend Full Functionality Inventory Reference

This page is a code-grounded, end-to-end inventory of frontend functionality in `frontend/src`.

## Coverage Snapshot

Source inventory used for this reference:

- Main process (`.cjs`/`.js` in `frontend/src/main`): `23`
- Sidecar Python (`.py` in `frontend/src/main/python`): `136`
- Renderer TS/JS (`frontend/src/renderer`): `114`
- Landing (`.jsx`/`.css` in `frontend/src/landing`): `13`
- Preload bridge (`frontend/src/preload.js`): `1`
- Total covered files: `287`

## Electron Main Process Functionality Inventory

Primary runtime modules:

- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`
- `frontend/src/main/runtime_paths.cjs`

Main process functionality:

- App boot and window/tray lifecycle.
- Multi-window overlay orchestration (main, chatbox, response overlay, context label).
- Response overlay phase state machine.
- Backend WebSocket connection lifecycle and reconnect behavior.
- Handshake, message relay, settings-sync ACK gating, and renderer fan-out.
- Query payload enrichment with memory/system context XML.
- Artifact upload path to backend HTTP endpoint.
- User/session/conversation reference propagation through IPC events.
- Initial settings synchronization gate before first query send.

Overlay and focus handlers:

- `frontend/src/main/overlay_visibility_handler.cjs`
- `frontend/src/main/overlay_mouse_handler.cjs`
- `frontend/src/main/overlay_chatbox_handler.cjs`
- `frontend/src/main/overlay_responsebox_handler.cjs`
- `frontend/src/main/overlay_bounds.cjs`
- `frontend/src/main/overlay_renderer_registration.cjs`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/external_focus_tracker.cjs`
- `frontend/src/main/main_window_controls_handler.cjs`
- `frontend/src/main/display_query_handler.cjs`

Handler functionality:

- Overlay show/hide and click-through state.
- Chatbox and response overlay bounds updates.
- Response phase transitions (`idle`, `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`, `complete`, `error`).
- External window focus snapshot/restore around overlay query capture.
- Main window control commands and display enumeration.

Local sidecar bridge in main process:

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`

Bridge functionality:

- Spawn/monitor local Python sidecar process.
- Readiness checks and request correlation.
- JSON-RPC request mapping for tool, memory, transcript, and system-state methods.
- Window resolver mapping for overlay-safe screenshot paths.
- Canonical RPC mapper registration for conversation/transcript/memory CRUD methods.

Wakeword bridge:

- `frontend/src/main/wakeword_bridge.cjs`

Wakeword functionality:

- Wakeword subprocess lifecycle.
- Binary frame parsing of detection results.
- Audio chunk relay from renderer to wakeword process.
- Wakeword detection callbacks to chat surfaces.

Support/runtime utilities:

- `frontend/src/main/test_shell.cjs` manual shell tool harness.

## Preload Boundary Functionality Inventory

Module:

- `frontend/src/preload.js`

Functionality:

- Security boundary between renderer and Electron main.
- Allowlisted IPC surface exposure (`send`, `invoke`, `on`, `once`, listener cleanup helpers).
- Channel safety for renderer-runtime calls.

## Renderer Application Functionality Inventory

Root composition and providers:

- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/providers/*.jsx`
- `frontend/src/renderer/components/ErrorBoundary.jsx`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`

Provider/runtime functionality:

- AppConfig ownership and backend sync updates.
- AppStatus save-state ownership.
- Chat provider ownership of stream and tool-runner hooks.
- Wakeword controller and app-level composition.
- View routing across main/overlay surfaces plus dashboard modal targets.
- Renderer event ingress for targeted open actions (`chat`, `settings`, `models`, `memory`).

### Renderer Chat Feature Inventory

Primary modules:

- Components: `frontend/src/renderer/features/chat/components/*`
- Hooks: `frontend/src/renderer/features/chat/hooks/*`
- Store: `frontend/src/renderer/features/chat/stores/chatStore.ts`
- Policies/constants: `frontend/src/renderer/features/chat/policies/*`, `constants/*`
- Helpers: `frontend/src/renderer/features/chat/utils/*`

Chat functionality:

- Message send workflow with overlay-aware capture policy.
- Streaming backend event ingestion and per-event UI updates.
- Thinking/status stream rendering.
- Tool-call/tool-output/bundle message presentation.
- Screenshot attachment and artifact URL handling.
- Conversation gating by active `conversation_ref`.
- Stream tracking and turn lifecycle transitions.
- Chatbox/response overlay rendering, including tool-ghost preview/lifecycle.
- Transcription region editing/reconciliation for voice typing.

### Renderer Dashboard Feature Inventory

Primary modules:

- `frontend/src/renderer/features/dashboard/components/*`
- `frontend/src/renderer/features/dashboard/components/sections/*`
- `frontend/src/renderer/features/dashboard/hooks/*`
- `frontend/src/renderer/features/dashboard/utils/*`

Dashboard functionality:

- Conversation-first dashboard shell with sidebar/open-state persistence.
- Search chats modal and grouped recent conversation recall.
- Transcript conversation resume + backend rehydrate handoff.
- Episodic and semantic memory browsing/actions.
- Model filtering and selection reconciliation.
- Display selection and settings payload shaping.
- Memory context menu keyboard/selection handling.

### Renderer Settings + Voice Inventory

Settings modules:

- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`

Settings functionality:

- Settings display + config toggle orchestration with backend sync-aware hook handoff.

Voice modules:

- `frontend/src/renderer/features/voice/hooks/*`
- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
- `frontend/src/renderer/features/voice/utils/*`

Voice functionality:

- Voice gateway websocket connect/reconnect and capture lifecycle.
- Wakeword capture + cooldown management via IPC bridge.
- PCM encoding and gateway packet framing.
- Capture cleanup and audio context teardown safety.

### Renderer Infrastructure Inventory

API + IPC modules:

- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/renderer/infrastructure/ipc/{bridge.ts,channels.ts}`

Functionality:

- Typed client wrappers for query/stop/settings/model/wakeword actions.
- Typed channel constants and defensive bridge wrappers.

Tool/capture runtime modules:

- `frontend/src/renderer/infrastructure/services/*`

Functionality:

- Tool execution orchestration for single and bundled calls.
- Capture policy, screenshot/system-state capture, and payload normalization.
- Artifact upload helper and image format utilities.
- Tool execution timing/logging and correlation diagnostics.

Audio + transcript modules:

- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/infrastructure/transcript/*`

Functionality:

- Streaming audio chunk queue/decoding/playback lifecycle.
- Transcript session state persistence and queued write behavior.
- Pending user/tool/assistant queue coordination.

Shared renderer contracts and utilities:

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/utils/{configFilter.js,configStorage.js,displaySelection.ts}`
- `frontend/src/renderer/infrastructure/markdown.ts`

Functionality:

- Backend event type guards and payload contracts.
- Frontend config persistence/filtering.
- Display bounds persistence and retrieval.
- Markdown sanitization/caching helpers.

## Sidecar Python Runtime Functionality Inventory

Primary sidecar entrypoints:

- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/wakeword_service.py`

Entrypoint functionality:

- JSON-RPC local backend for tool, memory, transcript, and system-state operations.
- Memory-only service protocol for focused memory operations.
- Wakeword binary protocol service and model bootstrap.

Core sidecar infrastructure:

- `frontend/src/main/python/core/*.py`

Core functionality:

- JSON-RPC protocol and method registration.
- Remote backend clients for embeddings/semantic summarize.
- Runtime shutdown signals and stdout JSON framing.
- Cross-platform system-state collection.
- Platform window manager abstractions (`windows`, `macos`, `linux`).
- Shared thread-pool lifecycle for blocking work.

Memory runtime:

- `frontend/src/main/python/memory/*.py`

Memory functionality:

- Local store for episodic + semantic records.
- SQLite + FAISS index storage and recovery paths.
- Transcript-to-memory operations and metadata helpers.
- Semantic summarization watermark/cadence handling.
- Conversation-title generation/storage for transcript session browsing.

Tool registry and domain tools:

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/schemas.py`
- `frontend/src/main/python/tools/result.py`
- `frontend/src/main/python/tools/base.py`

Registry functionality:

- Tool registration and argument validation.
- Unified result envelope for sidecar tool execution.

Computer tools:

- `frontend/src/main/python/tools/computer/*.py`

Functionality:

- Mouse, keyboard, screenshot, and scroll execution.
- OS scroll calibration helpers.

Filesystem tools:

- `frontend/src/main/python/tools/filesystem/*.py`

Functionality:

- Safe text-file read with binary detection and windowed pagination.
- Replace engine with strict/lenient matching, patch chunk application, and atomic writes.
- `.gitignore`-aware path filtering helpers.

System/process tools:

- `frontend/src/main/python/tools/system/*.py`

Functionality:

- Shell command execution (foreground/background/PTY-aware modes).
- Background process registry and lifecycle actions (`poll`, `write`, `log`, `kill`, `list`).
- Window switching and open window enumeration by platform manager.
- Runtime wait/stat tools.

Memory tool:

- `frontend/src/main/python/tools/memory/memory_tool.py`

Functionality:

- Add/search memory through local memory store.

Browser tool runtime:

- `frontend/src/main/python/tools/browser/*`
- `frontend/src/main/python/tools/browser/browser_use/*`

Functionality:

- Chrome detection and launch with CDP readiness checks.
- Browser controller snapshot and action runtime.
- Enhanced CDP DOM/AX snapshot pipeline and ref mapping.
- Browser action compatibility adapter for OpenClaw-style payloads.
- Browser Use vendored runtime provider, action bridge, watchdogs, DOM serializers, LLM adapters, token tracking, and agent state/history models.

Browser Use vendored stack (detailed ownership):

- Actor action helpers: pointer/keyboard/page primitives (`actor/*`).
- Browser session lifecycle + watchdog orchestration (`browser/*`, `browser/watchdogs/*`).
- DOM extraction and serializer pipeline (`dom/*`, `dom/serializer/*`).
- Tool registry, extraction, and invocation services (`tools/*`).
- LLM provider adapters and message serialization (`llm/*`).
- Token accounting and lightweight filesystem adapters (`tokens/*`, `filesystem/*`).

## Landing Surface Functionality Inventory

Modules:

- `frontend/src/landing/main.jsx`
- `frontend/src/landing/LandingPage.jsx`
- `frontend/src/landing/components/*`
- `frontend/src/landing/components/icons/*`
- `frontend/src/landing/styles/*`

Functionality:

- Standalone landing page entry and section composition.
- Product capability/roadmap/privacy/CTA sections.
- Shared style variable system and section styling.

## End-to-End Runtime Paths (Code Ownership)

Primary query path:

1. Renderer send path: `renderer/features/chat/hooks/useChatMessageSender.ts` -> `renderer/infrastructure/api/client.ts`.
2. Main IPC bridge path: `main/ipc.cjs` -> backend websocket relay.
3. Stream return path: `main/ipc.cjs` -> `renderer/features/chat/hooks/useChatStream.ts`.
4. Tool-call execution path: `renderer/features/chat/hooks/useToolRunner.ts` -> `renderer/infrastructure/services/ToolExecutionService.ts` -> `main/local_backend_bridge.cjs` -> `main/python/local_backend.py`.
5. Tool-result return path: sidecar response -> `main/local_backend_bridge.cjs` -> renderer callbacks -> `main/ipc.cjs` -> backend `tool-result` message.

Voice/wakeword path:

1. Renderer wakeword capture hooks.
2. Main wakeword bridge process management and binary framing.
3. Detection event relay to renderer + backend wakeword notification via IPC/API client.

Memory path:

1. Transcript/session writes in renderer transcript infrastructure.
2. Main process to sidecar memory RPC.
3. Sidecar local memory store + optional summarizer and backend embedding/semantic APIs.

Search/rehydrate path:

1. Sidebar/search modal calls `list-conversations` via IPC bridge.
2. Renderer opens one conversation with `get-conversation`.
3. Renderer emits `rehydrate` to backend and synchronizes transcript session state locally.

## Related Docs

- [Frontend Functionality Map](../README.md)
- [Frontend Main Docs Hub](../main/README.md)
- [Frontend Renderer Docs Hub](../renderer/README.md)
- [Frontend Sidecar Docs Hub](../sidecar/README.md)
- [Frontend Contracts Docs Hub](../contracts/README.md)
