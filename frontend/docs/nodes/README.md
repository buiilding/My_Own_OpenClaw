---
summary: "Public runtime nodes hub for WindieOS desktop, renderer, preload, local-runtime Python, and wakeword process boundaries."
read_when:
  - When deciding which public frontend runtime process owns a behavior.
  - When changing desktop, renderer, preload, local-runtime implementation, or
    wakeword lifecycle behavior.
title: "Runtime Nodes Hub"
---

# Runtime Nodes Hub

Public node docs cover local desktop/frontend runtime processes. Private backend
docs live in private backend docs.

## Current Public Runtime Nodes

| Node | Runs where | Owns | Start docs |
| --- | --- | --- | --- |
| Electron main node | local desktop app main process | windows, overlay lifecycle, SDK-runtime adapter, local config, preload IPC handlers, local-runtime host/status context | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Frontend Main Docs Hub](../frontend/main/README.md) |
| Renderer node | local desktop renderer processes | dashboard, chat UI, overlay UI, voice UI, settings, transcript projection, display-only tool state | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |
| Preload bridge node | local isolated bridge injected into renderer windows | allowed IPC surface, channel validation, safe renderer-to-main access | [Runtime Node Matrix](runtime_node_matrix.md), [Frontend Preload Docs Hub](../frontend/preload/README.md) |
| Local-runtime Python implementation node | local Python subprocess managed by SDK local runtime | executable local tools, local memory, system state, JSON-RPC methods, SDK helper clients | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md) |
| Wakeword service node | local Python subprocess separate from generic local-runtime JSON-RPC | wakeword model bootstrap, audio framing, detection events | [Desktop and Local Runtime Node](desktop_and_sidecar_node.md), [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |

## Node Boundary Rules

- Renderer nodes do not own native authority. Privileged work goes through
  preload and Electron main.
- Preload is a trust boundary, not an application feature layer. Add explicit
  channel allowlist entries only for concrete renderer needs.
- The local-runtime Python implementation logs to stderr and reserves stdout for
  JSON-RPC protocol frames.
- The wakeword service is not the generic local-runtime tool channel. Treat
  audio framing, model bootstrap, and wakeword status as a separate subprocess
  protocol.
- Backend route, hosted auth, deployment, and VM-runs control-plane issues belong
  in private backend docs.

## Change Paths

### Decide Which Public Node Owns a Bug

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

Patch the producer or enforcing node first. Do not normalize malformed data in a
downstream UI just to hide contract drift.

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

Validate preload/channel tests, main-process IPC tests, SDK/main tool-routing
tests, renderer projection tests, and local-runtime Python pytest coverage for
the touched tool or protocol.

## Deep Docs

- [Runtime Node Matrix](runtime_node_matrix.md)
- [Desktop and Local Runtime Node](desktop_and_sidecar_node.md)
- [Current vs Future Nodes](current_vs_future_nodes.md)
- [Channels Hub](../channels/README.md)
