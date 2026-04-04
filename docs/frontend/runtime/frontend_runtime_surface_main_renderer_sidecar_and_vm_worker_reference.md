---
summary: "Frontend runtime surface reference across Electron main composition, renderer send/stream orchestration, sidecar feature-pack behavior, and VM worker run relay."
read_when:
  - When changing frontend runtime boundaries across main, renderer, and sidecar.
  - When modifying VM worker orchestration (`WINDIE_VM_*`), global stop shortcut runtime, or sidecar browser feature-pack install behavior.
title: "Frontend Runtime Surface: Main, Renderer, Sidecar, and VM Worker"
---

# Frontend Runtime Surface: Main, Renderer, Sidecar, and VM Worker

## Scope

Canonical files:

- `frontend/src/main/index.cjs`
- `frontend/src/main/main_process_bootstrap_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/surface_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/agent_stop_shortcut_runtime.cjs`
- `frontend/src/main/vm_worker_runtime.cjs`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
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
- optional VM worker runtime: `vm_worker_runtime.cjs`

This split keeps lifecycle/window policy/IPC concerns separate while preserving a single composition root.

## IPC Runtime State Contract

`ipc.cjs` keeps backend transport and frontend session state:

- backend endpoint resolution (`ws` + `http`)
- renderer window tracking and broadcast fanout
- initial settings sync gate with ACK timeout (`2500ms`)
- backend session fields (`currentSessionId`, `currentServerUserId`, `currentConversationRef`)
- overlay phase replay state for late-mounted renderer surfaces
- local synthetic events (`local-user-message`, query-send-failure)
- global stop-shortcut status projection into IPC status payloads

Settings sync boundary:

- renderer may persist `global_agent_stop_shortcut`, but `ipc.cjs` strips that field from backend `update-settings` payloads
- shortcut fallback resolution is local-main behavior, then reflected back to renderer via IPC status/config persistence

## Global Stop Shortcut Runtime

`agent_stop_shortcut_runtime.cjs` is a dedicated runtime for loop-stop hotkeys:

- per-platform accelerator catalog from `shared/agent_stop_shortcut_catalog.json`
- phase gating (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`)
- fallback registration candidates when requested key is unavailable
- status projection fields:
  - requested/resolved/registered accelerator
  - registrationFailed
  - usingFallback
  - supportedAccelerators

Main process can enable/disable this runtime based on agent loop phase without mutating renderer state directly.

## VM Worker Mode Runtime

`vm_worker_runtime.cjs` is a polling/relay runtime for hosted VM operation.

Mode flags:

- `WINDIE_VM_MODE=1` enables VM mode
- `WINDIE_VM_WORKER_MODE=1` explicitly enables worker polling mode
- when worker flag is unset, worker mode inherits VM mode

Worker behavior:

- polls heartbeat + assignment endpoints under `/api/runs/*`
- dispatches assigned run queries via `sendAutomatedQuery(...)`
- relays backend stream events back to run-event API (`worker-stream` source)
- applies queued stop controls by sending backend stop messages
- supports API key headers (`WINDIE_VM_RUNS_API_KEY`, fallback `WINDIE_RUNS_API_KEY` / `WINDIE_DEMO_API_KEY`)

## Renderer Send and Stream Runtime

`useChatMessageSender.ts` now enforces conversation continuity before first send:

- resolve active conversation ref from transcript/store
- fallback to main-session snapshot via `GET_CLIENT_USER_ID` invoke
- only generate new conversation ref when neither local nor main snapshot has one

Send pipeline details:

- optimistic user row insert before backend send
- query screenshot artifact resolution via `resolveQueryScreenshotArtifacts(...)`
- deferred model settings patch (`buildDeferredQueryModelConfig`) sent immediately before `sendQuery(...)` when needed
- transcript write uses resolved conversation/session info at send time

`useChatStream.ts` remains the canonical stream-event state machine and stale-turn guard boundary for renderer message updates.

## Sidecar Runtime: Feature Pack and Tool Exposure

`local_backend.py` supports optional browser runtime install path:

- bootstraps sidecar feature-pack site-packages into `sys.path`
- checks browser availability through `feature_pack_installer.py` markers
- can auto-install browser feature pack on-demand (pip target to user-writable sidecar feature-pack directory)
- emits packaged-app specific failure guidance when bundled runtime dependencies are missing

Tool exposure boundary is defined in `tools/registry.py`:

- `frontend/src/main/python/tools/exposed_tool_names.py:EXPOSED_TO_BACKEND_TOOL_NAMES` defines the sidecar direct-tool exposure contract used for backend parity
- the current live sidecar registry exposes concrete tool names only
- repo-local `model-facing/tool_schema.txt` still contains unified `computer_use` and `system_use` wrapper artifacts, but those names are not registered in the live sidecar runtime
- registry reload path exists for post-install browser tool availability (`reload_tools`)

## Why This Surface Matters

Recent runtime changes are about explicit ownership:

- main process owns process/window/lifecycle policy
- renderer owns turn-level UI/send/stream behavior
- sidecar owns local execution + memory/runtime dependency bootstrap
- VM worker mode is an optional polling/relay runtime layered on top of the same backend transport and run APIs

Keeping these boundaries explicit reduces cross-process drift and makes docs, tests, and runtime behavior easier to keep aligned.
