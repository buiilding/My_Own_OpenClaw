---
summary: "Conceptual runtime model for WindieOS across hosted backend, Electron main, renderer, preload, and local runtime."
read_when:
  - When explaining how WindieOS is split across backend, Electron main,
    renderer, and local runtime.
  - When deciding which runtime owns a feature before touching code.
title: "Runtime Model"
---

# Runtime Model

WindieOS is a desktop runtime for personal AI agents, with a hosted backend, an
Electron desktop app, and a local runtime currently implemented by the Python
sidecar. The runtime is intentionally split so model orchestration can stay
server-owned while machine control stays local to the user's computer.

## Runtime Parts

| Runtime | Owns | Main code |
| --- | --- | --- |
| Electron main process | Window lifecycle, overlay surfaces, SDK-runtime adaptation, local config, permission probes, SDK local-runtime host/status context | `frontend/src/main` |
| React renderer | Dashboard, chat UI, minimal pill, response overlay, settings, permissions, voice controls, and tool-result projections | `frontend/src/renderer` |
| Preload | Strict renderer IPC exposure and channel allowlist | `frontend/src/preload.js` |
| Local runtime | Local executable tools, browser automation, shell/filesystem/computer actions, local memory, system state, wakeword service. Current implementation: local-runtime Python. | `frontend/src/main/python` |

## Boundary Rules

- Backend owns the model-facing contract.
- Local runtime owns local execution.
- Renderer owns UI state and display projections; Electron main hosts SDK runtime adapters and desktop process control.
- Electron main, renderer, and the local-runtime Python implementation must not import
  backend code to keep schema parity. Use generated/shared contracts and tests
  instead.
- Provider and capability health should narrow what the model sees before prompting, not after a failing tool call.

## Request Shape

At a high level:

1. The renderer sends a user goal through Electron main.
2. Main enriches the query with config, workspace/repo instructions, screenshots, artifact refs, and system state.
3. The hosted backend builds the prompt and streams events over websocket.
4. Tool calls return to the SDK runtime as executable requests.
5. SDK/main routes local work through the local runtime and sends `tool-result`
   or `tool-bundle-result` messages back.
6. The backend commits history and continues or completes the turn.

Read [Agent Loop](agent_loop.md) for the full turn lifecycle.

## Evidence Notes

- Prove a runtime-model claim with current code or runtime output from the
  layer named in the claim.
- If a behavior crosses renderer, main, SDK, local runtime, and backend,
  inspect the boundary payloads in order instead of inferring ownership from the
  final UI.
