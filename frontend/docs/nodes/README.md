---
summary: "Runtime nodes hub for WindieOS desktop, local-runtime implementation, hosted backend, VM worker, wakeword subprocess, and Cloudflare/origin service boundaries."
read_when:
  - When deciding which WindieOS runtime process or deployed service owns a behavior.
  - When changing desktop, local-runtime implementation, backend, VM worker, wakeword, or hosted deployment lifecycle behavior.
title: "Runtime Nodes Hub"
---

# Runtime Nodes Hub

OpenClaw has a `nodes/` docs area for mobile and edge nodes. WindieOS does not currently ship an OpenClaw-style fleet of mobile or edge nodes. The current WindieOS "nodes" are concrete runtime processes and hosted services that cooperate through IPC, JSON-RPC, HTTP, and websocket protocols.

Use this hub when an agent needs to identify where a behavior runs before editing code. Most WindieOS bugs come from changing a consumer node while the producing node's contract is wrong.

## Current Runtime Nodes

| Node | Runs where | Owns | Start docs |
| --- | --- | --- | --- |
| Hosted backend node | Peter-hosted or self-hosted FastAPI process | agent loop, websocket protocols, REST routes, model/tool schema, providers, artifacts, OCR/vision, semantic routes, run control | [Runtime Node Matrix](runtime_node_matrix.md), Gateway Hub (private backend docs), Backend Functionality Map (private backend docs) |
| Electron main node | local desktop app main process | windows, overlay lifecycle, SDK-runtime adapter, local config, preload IPC handlers, local-runtime host/status context, VM worker mode | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Frontend Main Docs Hub](../frontend/main/README.md) |
| Renderer node | local desktop renderer processes | dashboard, chat UI, overlay UI, voice UI, settings, transcript projection, display-only tool state | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |
| Preload bridge node | local isolated bridge injected into renderer windows | allowed IPC surface, channel validation, safe renderer-to-main access | [Runtime Node Matrix](runtime_node_matrix.md), [Frontend Preload Docs Hub](../frontend/preload/README.md) |
| Local-runtime Python implementation node | local Python subprocess managed by SDK local runtime | SDK/main local runtime owns local executable authority; this node is the concrete implementation for filesystem/shell/computer/browser tools, local memory, system state, JSON-RPC methods, and SDK helper clients | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md) |
| Wakeword service node | local Python subprocess separate from generic local-runtime JSON-RPC | wakeword model bootstrap, audio framing, detection events | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| VM worker node | Electron main running in `WINDIE_VM_MODE` or `WINDIE_VM_WORKER_MODE` | `/api/runs/*` heartbeat, assignment, dispatch, run event relay, stop controls | VM Worker Node (private backend docs), Automation Hub (private backend docs) |
| Cloudflare/origin service node | deployment host and Cloudflare Tunnel user service | public `api.windieos.com` ingress to a self-hosted backend origin | [Runtime Node Matrix](runtime_node_matrix.md), Gateway Troubleshooting (private backend docs), Cloudflared Self-Host Runbook (private backend docs) |

## Node Boundary Rules

- Backend nodes expose model-facing contracts. Desktop/local-runtime code executes local actions and must not import backend modules for schema parity.
- Renderer nodes never own durable hosted identity. Hosted identity comes from backend install auth and main-process token propagation.
- Preload is a trust boundary, not an application feature layer. Add explicit channel allowlist entries only for concrete renderer needs.
- The local-runtime Python implementation logs to stderr and reserves stdout for JSON-RPC protocol frames.
- The wakeword service is not the generic local-runtime tool channel. Treat audio framing, model bootstrap, and wakeword status as a separate subprocess protocol.
- The VM worker node uses `/api/runs/*` as a control plane and dispatches actual agent work through the normal backend websocket query path.
- The Cloudflare/origin service node is deployment plumbing. Route or auth failures still belong to the hosted backend node unless the tunnel/origin process is unreachable.

## Change Paths

### Decide Which Node Owns a Bug

Read:

- [Runtime Node Matrix](runtime_node_matrix.md)
- [Channels Hub](../channels/README.md)
- [Debug Hub](../debug/README.md)
- [Runtime Traces](../debug/runtime_traces.md)

Ask:

1. Which node produced the payload or event?
2. Which protocol carried it?
3. Which node validated or transformed it?
4. Which node observed the failure?

Patch the producer or enforcing node first. Do not normalize malformed data in a downstream UI just to hide contract drift.

### Change Desktop or Local Tool Execution

Read:

- [Desktop and Local Runtime Node](desktop_and_sidecar_node.md)
- [Local Tool Channels](../channels/sidecar_and_tool_channels.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Likely code:

- `frontend/src/main/**`
- `frontend/src/renderer/**`
- `frontend/src/preload.js`
- `frontend/src/main/python/**`

Validate preload/channel tests, main-process IPC tests, SDK/main tool-routing tests, renderer projection tests, and local-runtime Python pytest coverage for the touched tool or protocol.

### Change Hosted Backend or Gateway Behavior

Read:

- [Runtime Node Matrix](runtime_node_matrix.md)
- Gateway Hub (private backend docs)
- Gateway Protocol Map (private backend docs)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Likely code:

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/api/routes/**`
- `backend/src/api/auth/**`
- `backend/src/core/bootstrap/**`

Validate backend route/auth/websocket tests and SDK clients when public route behavior changes.

### Change VM Worker or Future Node Orchestration

Read:

- VM Worker Node (private backend docs)
- Automation Hub (private backend docs)
- [Current vs Future Nodes](current_vs_future_nodes.md)
- [VM Multi-Agent Plan](../planning/windieos_vm_multi_agent_plan.md)

Likely code:

- `backend/src/api/routes/runs/**`
- `backend/src/services/vm_run_control.py`
- `backend/src/services/vm_run_control_support/**`
- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`

Validate backend run-control tests and frontend VM worker/runtime-mode tests.

## Deep Docs

- [Runtime Node Matrix](runtime_node_matrix.md)
- [Desktop and Local Runtime Node](desktop_and_sidecar_node.md)
- VM Worker Node (private backend docs)
- [Current vs Future Nodes](current_vs_future_nodes.md)
- [Channels Hub](../channels/README.md)
- Gateway Hub (private backend docs)
- Automation Hub (private backend docs)
