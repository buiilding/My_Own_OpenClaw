---
summary: "Public matrix mapping WindieOS frontend runtime nodes to processes, code roots, protocols, lifecycle hooks, failure signals, and validation targets."
read_when:
  - When routing a frontend bug or feature to the runtime process that owns it.
  - When changing public cross-node protocols, startup lifecycle, shutdown
    lifecycle, IPC, local-runtime, wakeword, or tool execution boundaries.
title: "Runtime Node Matrix"
---

# Runtime Node Matrix

This matrix covers public frontend/local runtime nodes only. Hosted backend,
backend docs.

## Matrix

| Node | Code roots | Protocols | Lifecycle owner | Failure signals | Validate |
| --- | --- | --- | --- | --- | --- |
| Electron main node | `frontend/src/main/index.cjs`, `frontend/src/main/ipc.cjs`, `packages/windie-sdk-js/src/runtime`, `frontend/src/main/app/main_process_*`, `frontend/src/main/surfaces/*` | Electron IPC, SDK runtime adapter, SDK local-runtime host services, OS window APIs | Electron app bootstrap composes windows, IPC handlers, SDK startup, local-runtime launch facts/status consumers | renderer cannot send query, overlays do not open/close, config does not sync, endpoint snapshot wrong, SDK local runtime unavailable | main-process tests, endpoint/config tests, overlay/window tests |
| Preload bridge node | `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json`, `frontend/src/renderer/infrastructure/ipc/**` | constrained renderer API over Electron context bridge | loaded per renderer window before app UI | invalid channel error, missing `window.ipc` method, renderer can access too much authority | preload allowlist parity tests, IPC contract tests |
| Renderer node | `frontend/src/renderer/app/**`, `frontend/src/renderer/features/**`, `frontend/src/renderer/infrastructure/**` | renderer IPC facade, SDK projection channels, typed event fan-out, browser DOM/UI state | React app mounts dashboard, overlays, providers, hooks, transcript stores, and display-only tool state | UI state does not match SDK projection, transcript replay drift, display tool state does not match SDK execution state, settings UI stale | renderer hook/store/component tests, SDK projection and event consumer tests |
| Local-runtime Python implementation node | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/tools/**`, `frontend/src/main/python/memory/**`, `frontend/src/main/python/core/**` | daemon HTTP/RPC endpoints, local-runtime JSON-RPC method handlers, local OS/library APIs | SDK `LocalRuntime` starts/reuses the daemon; Electron main supplies launch options and host context | readiness timeout, RPC failure, tool registry missing action, stdout contamination, local memory failure | local-runtime Python tests, daemon/RPC protocol tests, tool tests |
| Wakeword service node | `frontend/src/main/wakeword/wakeword_bridge*.cjs`, `frontend/src/main/wakeword/wakeword_supervisor.cjs`, `frontend/src/main/python/wakeword_service.py`, renderer wakeword controller files | binary/audio frames and wakeword status events over a dedicated subprocess bridge | renderer captures audio chunks, main bridge forwards frames, service emits detection/status | wakeword never becomes ready, repeated detections, microphone capture mismatch, audio framing error | wakeword bridge tests, wakeword service tests, voice hook tests |

## Protocol Ownership

| Protocol | Producer | Consumer | Docs |
| --- | --- | --- | --- |
| local-runtime JSON-RPC | SDK `LocalRuntime` with Electron host context | local-runtime Python executor | [Local Tool Channels](../channels/sidecar_and_tool_channels.md), [Local-Runtime JSON-RPC Protocol Reference](../frontend/sidecar/core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md) |
| preload IPC | renderer facade | Electron main IPC handlers | [Frontend Preload Channel Allowlist](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md), [Frontend IPC Channel Reference](../frontend/contracts/ipc_channel_and_handler_reference.md) |
| wakeword subprocess frames | renderer/main wakeword bridge | local-runtime wakeword helper backed by the Python service | [Voice and Audio Channels](../channels/voice_and_audio_channels.md), [Electron Wakeword Bridge and Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md) |

## Node Debug Order

1. Confirm the entry protocol using [Channel Routing Matrix](../channels/channel_routing_matrix.md).
2. Confirm the producing node emitted a valid payload.
3. Confirm the transport node forwarded the payload without rewriting authority
   or identity fields.
4. Confirm the consuming node validated the payload as expected.
5. Confirm the result returned through the documented response path.

## Validation Selection

| Change touches | Minimum validation |
| --- | --- |
| preload IPC | preload allowlist and IPC parity tests |
| renderer stream handling | renderer stream hook/store tests |
| local-runtime executable tool | local-runtime Python tool tests plus public manifest/schema parity tests when the tool is model-visible |
| wakeword protocol | wakeword bridge/service tests plus voice capture tests |
| packaging/runtime path | package or local reinstall checks on the target OS |
