---
summary: "Conceptual runtime model for WindieOS across hosted backend, Electron frontend, renderer, preload, and Python sidecar."
read_when:
  - When explaining how WindieOS is split across backend, frontend, and sidecar.
  - When deciding which runtime owns a feature before touching code.
title: "Runtime Model"
---

# Runtime Model

WindieOS is a desktop AI operator with a hosted backend, an Electron desktop app, and a local Python sidecar. The runtime is intentionally split so model orchestration can stay server-owned while machine control stays local to the user's computer.

## Runtime Parts

| Runtime | Owns | Main code |
| --- | --- | --- |
| Hosted FastAPI backend | Agent loop, prompt construction, LLM providers, model-facing tool schema, websocket/REST contracts, OCR/vision/embedding/TTS services, SDK and run-control APIs | `backend/src` |
| Electron main process | Window lifecycle, overlay surfaces, SDK-runtime adaptation, local config, permission probes, sidecar process supervision, local JSON-RPC bridge | `frontend/src/main` |
| React renderer | Dashboard, chat UI, minimal pill, response overlay, settings, permissions, voice controls, tool execution orchestration | `frontend/src/renderer` |
| Preload | Strict renderer IPC exposure and channel allowlist | `frontend/src/preload.js` |
| Python sidecar | Local executable tools, browser automation, shell/filesystem/computer actions, local memory, system state, wakeword service | `frontend/src/main/python` |

## Boundary Rules

- Backend owns the model-facing contract.
- Sidecar owns local execution.
- Renderer/main own UI state and desktop process control.
- Frontend and sidecar must not import backend code to keep schema parity. Use generated/shared contracts and tests instead.
- Provider and capability health should narrow what the model sees before prompting, not after a failing tool call.

## Request Shape

At a high level:

1. The renderer sends a user goal through Electron main.
2. Main enriches the query with config, workspace/repo instructions, screenshots, artifact refs, and system state.
3. The hosted backend builds the prompt and streams events over websocket.
4. Tool calls return to the frontend as executable requests.
5. The renderer/main/sidecar execute local work and send `tool-result` or `tool-bundle-result` messages back.
6. The backend commits history and continues or completes the turn.

Read [Agent Loop](agent_loop.md) for the full turn lifecycle.
