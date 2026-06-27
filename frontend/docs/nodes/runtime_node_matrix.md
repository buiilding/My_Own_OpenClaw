---
summary: "Matrix mapping WindieOS runtime nodes to processes, code roots, protocols, lifecycle hooks, failure signals, and validation targets."
read_when:
  - When routing a bug or feature to the runtime process that actually owns it.
  - When changing cross-node protocols, startup lifecycle, shutdown lifecycle, auth, or tool execution boundaries.
title: "Runtime Node Matrix"
---

# Runtime Node Matrix

This matrix maps WindieOS runtime nodes to the files and contracts an agent should inspect before editing. A node is a process or deployed service with its own lifecycle and trust boundary.

## Matrix

| Node | Code roots | Protocols | Lifecycle owner | Failure signals | Validate |
| --- | --- | --- | --- | --- | --- |
| Hosted backend node | `backend/src/main.py`, `backend/src/api/app_assembly.py`, `backend/src/api/routes/**`, `backend/src/core/bootstrap/**`, `backend/src/core/container/**` | HTTP `/api/*`, websocket `/ws`, websocket `/ws/transcription` | FastAPI lifespan initializes the DI container and install auth service; `app_assembly.py` registers routers and CORS | route `404`, REST `401`/`503`, websocket `1008`, missing stream events, provider health failure | backend route tests, websocket contract tests, auth tests, SDK tests |
| Backend agent loop subnode | `backend/src/agent/**`, `backend/src/api/services/query_execution.py`, `backend/src/api/processing/**`, `backend/src/tools/**` | backend-internal stream events, model provider streams, SDK tool dispatch messages | backend query handler creates/uses session execution state per websocket query | empty final response, malformed tool call, stale pending result, missing completion event | backend agent/tool/formatter tests |
| Electron main node | `frontend/src/main/index.cjs`, `frontend/src/main/ipc.cjs`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `frontend/src/main/app/main_process_*`, `frontend/src/main/surfaces/surface_runtime.cjs`, `frontend/src/main/app/backend_endpoints.cjs` | Electron IPC, Electron agent-host runtime, SDK local-runtime host services, OS window APIs | Electron app bootstrap composes windows, IPC handlers, SDK startup, local-runtime launch facts/status consumers, optional VM worker | renderer cannot send query, overlays do not open/close, config does not sync, backend URL wrong, SDK local runtime unavailable | main-process Jest tests, endpoint/config tests, overlay/window tests |
| Preload bridge node | `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json`, `frontend/src/renderer/infrastructure/ipc/**` | constrained renderer API over Electron context bridge | loaded per renderer window before app UI | invalid channel error, missing `window.ipc` method, renderer can access too much authority | preload allowlist parity tests, IPC contract tests |
| Renderer node | `frontend/src/renderer/app/**`, `frontend/src/renderer/features/**`, `frontend/src/renderer/infrastructure/**` | renderer IPC facade, SDK projection channels, typed backend side-channel events, browser DOM/UI state | React app mounts dashboard, overlays, providers, hooks, transcript stores, and display-only tool state | UI state does not match SDK projection or typed side-channel event, transcript replay drift, display tool state does not match SDK execution state, settings UI stale | renderer hook/store/component tests, SDK projection and event consumer tests |
| Local-runtime Python implementation node | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/tools/**`, `frontend/src/main/python/memory/**`, `frontend/src/main/python/core/**` | daemon HTTP/RPC endpoints, local-runtime JSON-RPC method handlers, backend HTTP helper clients, local OS/library APIs | SDK `LocalRuntime` starts/reuses the daemon; Electron main supplies launch options and host context | readiness timeout, RPC failure, tool registry missing action, stdout contamination, local memory failure | local-runtime Python pytest tests, daemon/RPC protocol tests, tool tests |
| Wakeword service node | `frontend/src/main/wakeword/wakeword_bridge*.cjs`, `frontend/src/main/wakeword/wakeword_supervisor.cjs`, `frontend/src/main/python/wakeword_service.py`, renderer wakeword controller files | binary/audio frames and wakeword status events over a dedicated subprocess bridge | renderer captures audio chunks, main bridge forwards frames, service emits detection/status | wakeword never becomes ready, repeated detections, microphone capture mismatch, audio framing error | wakeword bridge tests, wakeword service tests, voice hook tests |
| VM worker node | `frontend/src/main/app/vm_worker_runtime.cjs`, `frontend/src/main/app/runtime_mode.cjs`, `frontend/src/main/index.cjs`, backend runs routes/services | HTTP `/api/runs/*`, backend websocket `/ws` through `sendAutomatedQuery(...)`, worker stream event relay | enabled by `WINDIE_VM_MODE` and `WINDIE_VM_WORKER_MODE`; polls heartbeat interval and dispatches assigned runs | worker never heartbeats, run remains `awaiting_worker`, assignment not dispatched, stop control ignored, timeline missing events | frontend VM worker/runtime-mode tests, backend runs route/service tests |
| Cloudflare/origin service node | `scripts/cloudflared/**`, backend process manager, deployment docs | public HTTPS/WebSocket to self-hosted backend origin through Cloudflare Tunnel | user-level tunnel/service scripts install cloudflared, backend service, DNS route, and tunnel config | `502`, tunnel DNS mismatch, origin process down, public websocket cannot connect | cloudflared script smoke where applicable, operations runbook checks |

## Protocol Ownership

| Protocol | Producer | Consumer | Docs |
| --- | --- | --- | --- |
| `/ws` query/control stream | SDK runtime | hosted backend websocket route | [Channels Hub](../channels/README.md), [Backend API WebSocket Docs Hub](../backend/api/websocket/README.md) |
| `/ws/transcription` | renderer voice gateway | backend transcription route | [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| `/api/runs/*` | dashboard/API caller and VM worker | backend runs router/service | [Automation Hub](../automation/README.md), [Runs API Runbook](../automation/runs_api_runbook.md) |
| local-runtime JSON-RPC | SDK `LocalRuntime` with Electron host context | local-runtime Python executor | [Local Tool Channels](../channels/sidecar_and_tool_channels.md), [Local-Runtime JSON-RPC Protocol Reference](../frontend/sidecar/core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md) |
| preload IPC | renderer facade | Electron main IPC handlers | [Frontend Preload Channel Allowlist](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md), [Frontend IPC Channel Reference](../frontend/contracts/ipc_channel_and_handler_reference.md) |
| wakeword subprocess frames | renderer/main wakeword bridge | local-runtime wakeword helper backed by the Python service | [Voice and Audio Channels](../channels/voice_and_audio_channels.md), [Electron Wakeword Bridge and Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md) |
| Cloudflare tunnel ingress | public clients | hosted backend origin | [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md), [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md) |

## Node Debug Order

1. Confirm the entry protocol using [Channel Routing Matrix](../channels/channel_routing_matrix.md).
2. Confirm the producing node emitted a valid payload.
3. Confirm the transport node forwarded the payload without rewriting authority or identity fields.
4. Confirm the consuming node validated the payload as expected.
5. Confirm the result returned through the documented response path.

Examples:

- A tool-call card appears but the OS action never runs: backend emitted a model-facing tool event; inspect SDK tool coordination, Electron main local-runtime bridge, then local-runtime JSON-RPC and executable tool registry.
- `/api/runs/*` creates a run but no agent work occurs: inspect backend run status, worker heartbeat assignment, `vm_worker_runtime.cjs`, then normal `/ws` dispatch.
- Hosted `/api/*` returns `401`: inspect install auth middleware and frontend/SDK bearer-token propagation before changing route code.
- Public `api.windieos.com` returns `502`: inspect Cloudflare/origin service state before changing FastAPI route handlers.

## Validation Selection

| Change touches | Minimum validation |
| --- | --- |
| backend route or auth | backend route/auth tests plus API docs examples |
| websocket message schema or formatter | backend schema/handler/formatter tests plus renderer event consumer tests if UI consumes it |
| preload IPC | preload allowlist and IPC parity tests |
| renderer stream handling | renderer stream hook/store tests |
| local-runtime executable tool | local-runtime Python tool tests plus backend/schema parity tests when the tool is model-visible |
| wakeword protocol | wakeword bridge/service tests plus voice capture tests |
| VM worker | backend runs service/routes and frontend VM worker/runtime-mode tests |
| Cloudflare/deployment scripts | script dry-run/smoke checks where available plus operations docs review |
