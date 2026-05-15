---
summary: "Architecture-level runtime boundary matrix for WindieOS backend, Electron main, renderer, preload, sidecar, wakeword, VM worker, and gateway/origin services."
read_when:
  - When routing a cross-runtime feature or bug to the correct process and trust boundary.
  - When deciding whether a behavior belongs in backend, Electron main, renderer, preload, sidecar, wakeword, VM worker, or hosted operations code.
title: "Runtime Boundary Matrix"
---

# Runtime Boundary Matrix

Use this architecture-level matrix before searching broadly. It is intentionally less granular than [Runtime Node Matrix](../nodes/runtime_node_matrix.md); it answers "which runtime owns this?" rather than "which exact file handles this event?"

| Boundary | Owns | First code roots | First docs |
| --- | --- | --- | --- |
| hosted backend | agent loop, prompt construction, provider routing, model-facing schemas, websocket/REST contracts, artifacts, OCR/vision/embedding/TTS, SDK, VM runs | `backend/src/api`, `backend/src/agent`, `backend/src/llm`, `backend/src/tools`, `backend/src/services` | [Backend Architecture](backend_architecture.md), [Gateway Hub](../gateway/README.md) |
| backend route/gateway | FastAPI app assembly, router registration, CORS, install auth, websocket handshake | `backend/src/main.py`, `backend/src/api/app_assembly.py`, `backend/src/api/routes`, `backend/src/api/auth` | [Gateway Protocol Map](../gateway/gateway_protocol_map.md) |
| Electron main | windows, overlays, endpoint selection, SDK-runtime adaptation, config persistence, permission probes, sidecar lifecycle, wakeword bridge, VM worker runtime | `frontend/src/main` | [Frontend Architecture](frontend_architecture.md), [Frontend Main Docs Hub](../frontend/main/README.md) |
| preload | context-bridge IPC surface and allowlist | `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json` | [Frontend Preload Docs Hub](../frontend/preload/README.md) |
| React renderer | dashboard, chat UI, response overlay UI, settings, permissions UI, voice controls, transcript queue, tool runner | `frontend/src/renderer` | [Frontend Architecture](frontend_architecture.md), [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |
| Python sidecar | local tools, browser runtime, filesystem/shell/computer actions, local memory DB/FAISS, system state, hosted SDK helper clients | `frontend/src/main/python` | [Python Sidecar](python_sidecar.md), [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md) |
| wakeword subprocess | wakeword model/runtime, audio frame handling, detection events | `frontend/src/main/wakeword_bridge*.cjs`, `frontend/src/main/python/wakeword_service.py` | [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| VM worker | hosted run heartbeat, assignment, dispatch, event relay, stop controls | `frontend/src/main/vm_worker_runtime.cjs`, `backend/src/api/routes/runs`, `backend/src/services/vm_run_control.py` | [Automation Hub](../automation/README.md) |
| Cloudflare/origin | public HTTPS/WebSocket ingress to hosted backend origin | `scripts/cloudflared`, deployment/service config | [Operational Troubleshooting](../operations/operational_troubleshooting.md) |

## Boundary Tests

| Boundary change | Test direction |
| --- | --- |
| backend schema/event | backend contract tests plus renderer consumer tests when UI consumes it |
| Electron IPC/preload | IPC allowlist and channel parity tests |
| sidecar tool | sidecar pytest and backend/sidecar parity tests for model-visible tools |
| platform capture/overlay | frontend overlay/window policy tests |
| hosted route/auth | backend route/auth tests and gateway docs examples |
| VM runs | backend runs service/routes plus frontend VM worker tests |

## Related Docs

- [Architecture Hub](README.md)
- [Data Flow and State Ownership](data_flow_and_state_ownership.md)
- [Change Ownership Decision Tree](change_ownership_decision_tree.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
