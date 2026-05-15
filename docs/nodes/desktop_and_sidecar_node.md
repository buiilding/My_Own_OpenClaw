---
summary: "Desktop and sidecar node guide for Electron main, renderer, preload, Python sidecar, wakeword subprocess, and local-tool ownership."
read_when:
  - When changing local desktop behavior, renderer/main IPC, sidecar JSON-RPC, local tools, wakeword, permissions, overlays, or transcript projection.
  - When debugging a failure that crosses UI, Electron main, preload, Python sidecar, or OS permissions.
title: "Desktop and Sidecar Node"
---

# Desktop and Sidecar Node

The desktop node is not one process. It is a small local runtime cluster:

- Electron main process
- one or more renderer processes
- preload bridge injected into renderer windows
- Python sidecar subprocess
- optional wakeword subprocess

Keep these nodes separate when developing. They run on the user's machine, but each owns a different trust boundary.

## Process Ownership

| Local process | Owns | Does not own |
| --- | --- | --- |
| Electron main | native windows, overlay visibility, backend websocket client, config persistence, install-token storage/transport, IPC handlers, sidecar process lifecycle | React component state, backend route implementation, sidecar tool internals |
| Renderer | dashboard/chat/overlay UI, stream projection, transcript state, settings forms, voice UI, tool-runner UI state | direct filesystem/shell access, backend auth enforcement, native window authority |
| Preload | narrow `window.ipc` bridge and channel allowlist | feature policy, backend schemas, broad Node.js access |
| Python sidecar | local executable tools, local memory, browser runtime, system state, shell/filesystem/computer actions | model-facing tool schemas, websocket route validation, renderer UI |
| Wakeword service | model bootstrap and audio-frame detection | voice dictation transcription, generic sidecar tools, backend TTS |

## Main Process Code Roots

Start with these files when local orchestration changes:

- `frontend/src/main/index.cjs`: composition root for app bootstrap.
- `frontend/src/main/main_process_bootstrap_runtime.cjs`: bootstrap/runtime setup.
- `frontend/src/main/main_process_lifecycle_runtime.cjs`: Electron lifecycle policy.
- `frontend/src/main/surface_runtime.cjs`: shared window/surface owner.
- `frontend/src/main/ipc.cjs`: SDK-runtime adaptation, query dispatch, renderer fanout, session/config state.
- `frontend/src/main/windie_sdk_runtime.cjs`: hosted backend websocket primitive for Electron.
- `frontend/src/main/ipc/**`: narrower IPC modules.
- `frontend/src/main/local_backend_bridge.cjs`: sidecar process bridge.
- `frontend/src/main/local_backend_bridge_*`: sidecar request mapping, timeout, screenshot, bounds, and tool-argument helpers.
- `frontend/src/main/backend_endpoints.cjs`: hosted backend endpoint selection.
- `frontend/src/main/permission_*`: OS permission probes and grant effects.
- `frontend/src/main/wakeword_bridge*.cjs`: wakeword subprocess bridge.
- `frontend/src/main/vm_worker_runtime.cjs`: optional VM worker node layered on main.

## Renderer Code Roots

Start with these folders when UI or stream projection changes:

- `frontend/src/renderer/app/**`: app roots, providers, overlay entrypoints, wakeword controller.
- `frontend/src/renderer/features/chat/**`: chat dashboard, minimal pill, response overlay, stream hooks, tool runner, transcript projection.
- `frontend/src/renderer/features/dashboard/**`: dashboard shell, sidebar, settings, model/API-key/memory sections.
- `frontend/src/renderer/features/voice/**`: voice mode UI, capture hooks, wakeword bridge events.
- `frontend/src/renderer/features/permissions/**`: permission center state and presentation.
- `frontend/src/renderer/infrastructure/**`: IPC, API, transcript, artifact, and service helpers.

## Sidecar Code Roots

Start with these files when local execution changes:

- `frontend/src/main/python/local_backend.py`: JSON-RPC entrypoint and request dispatch.
- `frontend/src/main/python/tools/registry.py`: tool registration and exposed tool lookup.
- `frontend/src/main/python/tools/exposed_tool_names.py`: direct-tool exposure contract used for parity.
- `frontend/src/main/python/tools/computer/**`: mouse, keyboard, screenshot, scroll.
- `frontend/src/main/python/tools/browser/**`: dedicated browser automation runtime.
- `frontend/src/main/python/tools/filesystem/**`: file read/replace helpers.
- `frontend/src/main/python/tools/system/**`: shell/process/window/stats/open-app/wait actions.
- `frontend/src/main/python/memory/**`: local transcript, episodic, semantic, title, and FAISS behavior.
- `frontend/src/main/python/core/**`: backend URL helpers, env flags, remote API clients, runtime shutdown, executors.

## Local Tool Lifecycle

```mermaid
sequenceDiagram
  participant Backend as Hosted backend
  participant Main as Electron main
  participant Renderer as Renderer
  participant Sidecar as Python sidecar

  Backend->>Main: websocket tool-call event
  Main->>Renderer: from-backend event
  Renderer->>Main: execute local tool via IPC
  Main->>Sidecar: JSON-RPC execute-tool
  Sidecar-->>Main: tool result
  Main-->>Renderer: result/failure
  Renderer->>Main: tool-result payload
  Main->>Backend: websocket tool-result
```

Ownership rules:

- The backend decides which model-facing tool is visible.
- The renderer tracks the current turn, displays tool state, and initiates local execution.
- Electron main maps renderer requests to sidecar JSON-RPC and enforces bridge timeouts/window guards.
- The sidecar performs the local action and returns a normalized result.
- The result must re-enter backend history through the websocket tool-result path.

## Wakeword Lifecycle

Wakeword uses a separate subprocess path:

1. renderer wakeword controller decides whether capture should run.
2. renderer sends audio chunks over wakeword IPC.
3. Electron main forwards framed chunks through `wakeword_bridge*.cjs`.
4. `frontend/src/main/python/wakeword_service.py` loads the model and emits status/detection messages.
5. main rebroadcasts wakeword status/detected events to renderer.
6. optional backend activation uses the normal `/ws` wakeword message path.

Do not route dictation audio through the wakeword service. Dictation uses `/ws/transcription`.

## Debug Checklist

For a desktop-sidecar bug, identify the last successful boundary:

- UI action happened: renderer event handler fired.
- IPC bridge accepted the channel: preload and main handler are registered.
- main process mapped the request: payload shape matches bridge mapper.
- sidecar request was sent: JSON-RPC stdout/stderr framing is clean.
- sidecar tool ran: registry has the tool and returns a result or structured error.
- result came back: renderer persisted/displayed it and sent backend tool-result if needed.

## Focused Validation

| Change | Validate |
| --- | --- |
| renderer stream/tool state | renderer chat hook/store/tool-runner tests |
| IPC or preload channel | preload allowlist parity and main IPC tests |
| main-process window/overlay behavior | main overlay/window tests |
| sidecar JSON-RPC mapping | sidecar JSON-RPC protocol tests and main bridge mapper tests |
| sidecar tool implementation | focused sidecar pytest for the tool |
| backend-visible local tool contract | backend remote-tool/schema tests plus sidecar parity tests |
| wakeword service or bridge | wakeword bridge/service tests and voice hook tests |

## Related Docs

- [Runtime Node Matrix](runtime_node_matrix.md)
- [Channels Hub](../channels/README.md)
- [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md)
- [Frontend Runtime Surface](../frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md)
- [Frontend IPC Channel Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [Frontend Sidecar Docs Hub](../frontend/sidecar/README.md)
- [Voice and Audio Channels](../channels/voice_and_audio_channels.md)
