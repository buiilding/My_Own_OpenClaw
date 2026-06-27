---
summary: "Frontend runtime surface reference across Electron main composition, renderer send/stream UI consumption, SDK/app-runtime contracts, Python local-runtime feature-pack behavior, and"
read_when:
  - When changing frontend runtime boundaries across main, renderer, and the Python local runtime.
---


## Scope

Canonical files:

- `frontend/src/main/index.cjs`
- `frontend/src/main/app/main_process_bootstrap_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/surfaces/surface_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/shortcuts/agent_stop_shortcut_runtime.cjs`
- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/main/python/sidecar_daemon.py`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/core/feature_pack_installer.py`
- `frontend/src/main/python/tools/registry.py`

## Main Process Composition Boundary

`index.cjs` is now composition-only wiring, not a monolithic runtime body.

Key split modules:

- bootstrap path: `main_process_bootstrap_runtime.cjs`
- app lifecycle path: `main_process_lifecycle_runtime.cjs`
- shared window/surface owner: `surface_runtime.cjs`
- IPC bridge/runtime: `ipc.cjs` plus `main/ipc/*`
- stop shortcut runtime: `agent_stop_shortcut_runtime.cjs`

This split keeps lifecycle/window policy/IPC concerns separate while preserving a single composition root.

## IPC Runtime State Contract

`ipc.cjs` hosts SDK-backed query/session relay state and renderer fanout:

- SDK/backend endpoint resolution (`ws` + `http`)
- renderer window tracking and broadcast fanout
- initial settings sync gate with ACK timeout (`2500ms`)
- SDK session identity fields (`currentSessionId`, `currentServerUserId`, `currentConversationRef`)
- overlay phase replay state for late-mounted renderer surfaces
- local UI projection events (`local-user-message`, query-send-failure)
- global stop-shortcut status projection into IPC status payloads

Settings sync boundary:

- renderer may persist `global_agent_stop_shortcut`, but `ipc.cjs` strips that field from backend `update-settings` payloads
- shortcut fallback resolution is local-main behavior, then reflected back to renderer via IPC status/config persistence

## Global Stop Shortcut Runtime

For the detailed settings, config, registration, fallback, and validation path,
start with [Global Stop Shortcut Runtime Reference](../main/global_stop_shortcut_runtime_reference.md).

`agent_stop_shortcut_runtime.cjs` is a dedicated runtime for loop-stop hotkeys:

- per-platform accelerator catalog from `shared/agent_stop_shortcut_catalog.json`
- phase gating (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`)
- fallback registration candidates when requested key is unavailable
- status projection fields:
  - enabled and registered state
  - requested/resolved/registered accelerator
  - registrationFailed
  - usingFallback
  - supportedAccelerators

Status-change deduplication compares every projected status field, so disabling
the runtime after a successful registration still emits the unregistered state
even when the requested and resolved accelerator strings are unchanged.

Main process can enable/disable this runtime based on agent loop phase without mutating renderer state directly.


`vm_worker_runtime.cjs` is a polling/relay runtime for hosted VM operation.

Mode flags:

- `WINDIE_VM_MODE=1` enables VM mode
- `WINDIE_VM_WORKER_MODE=1` explicitly enables worker polling mode
- when worker flag is unset, worker mode inherits VM mode

Worker behavior:

- dispatches assigned run queries via `sendAutomatedQuery(...)`
- relays backend stream events back to run-event API (`worker-stream` source)
- applies queued stop controls by sending backend stop messages

## Renderer Send and Stream UI Boundary

`useChatMessageSender.ts` coordinates renderer user intent for sending messages
while the durable send contract stays behind SDK and app-runtime facades. Before
the first send, the renderer hook resolves the conversation continuity inputs it
needs from app-runtime clients:

- resolve active conversation ref from transcript/store
- fallback to main-session snapshot through `DesktopClientSessionRuntimeClient`
- only generate new conversation ref when neither local nor main snapshot has one

Send pipeline ownership:

- SDK-owned `conversation.send` emits `turn_started` and base `user_message`
  before resource resolution
- renderer submits typed turn-resource intent for readable files, clipboard
  images, workspace binding, and optional query screenshots instead of resolving
  them before send
- SDK turn input pipeline resolves resources through host/local resolvers and
  emits user-message metadata before backend transport
- deferred model selection
  (`DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection(...)`)
  sent through `DesktopSettingsRuntimeClient.setModel(...)` immediately before
  `sendQuery(...)` when needed
- transcript display renders SDK rows/current-turn projection, not a renderer
  optimistic row

`useChatStream.ts` consumes SDK/app-runtime stream projection and coordinates
renderer message state. Reusable stream-event normalization, stale-turn
predicates, terminal handoff, message targeting, and payload rules live under
`frontend/src/renderer/app/runtime/desktopChatStream*` modules and SDK
projections rather than inside feature components.

## Python Local Runtime: Feature Pack and Tool Exposure

`sidecar_daemon.py` is the SDK local-runtime entrypoint, and
`local_backend.py` provides the in-process service implementation used by that
daemon. The Python local runtime supports the optional browser runtime install
path:

- bootstraps local-runtime feature-pack site-packages into `sys.path`
- checks browser availability through `feature_pack_installer.py` markers
- can auto-install browser feature pack on-demand (pip target to user-writable local-runtime feature-pack directory)
- emits packaged-app specific failure guidance when bundled runtime dependencies are missing

Tool exposure boundary is defined in `tools/registry.py`:

- `frontend/src/main/python/tools/manifest.py:LOCAL_RUNTIME_BUILTIN_TOOL_NAMES` defines the executable local-runtime tool exposure contract used for SDK/backend parity
- the current live local-runtime registry exposes concrete tool names only
- repo-local `model-facing/tool_schema.txt` still contains unified `computer_use` and `system_use` wrapper artifacts, but those names are not registered in the live local runtime
- registry reload path exists for post-install browser tool availability (`reload_tools`)

## Why This Surface Matters

Recent runtime changes are about explicit ownership:

- main process owns process/window/lifecycle policy
- renderer owns UI intent, presentation state, and local interaction hooks for
  send/stream surfaces
- SDK and renderer app-runtime facades own reusable send/stream contracts,
  event normalization, stale-turn predicates, and display projections
- Python local runtime owns local execution and memory/runtime dependency bootstrap

Keeping these boundaries explicit reduces cross-process drift and makes docs, tests, and runtime behavior easier to keep aligned.
