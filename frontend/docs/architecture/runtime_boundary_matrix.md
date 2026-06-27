---
summary: "Architecture-level runtime boundary matrix for WindieOS backend, Electron main, renderer, preload, local runtime, wakeword, private automation worker, and gateway/origin services."
read_when:
  - When routing a cross-runtime feature or bug to the correct process and trust boundary.
  - When deciding whether a behavior belongs in backend, Electron main,
    code.
title: "Runtime Boundary Matrix"
---

# Runtime Boundary Matrix

Use this architecture-level matrix before searching broadly. It is intentionally less granular than [Runtime Node Matrix](../nodes/runtime_node_matrix.md); it answers "which runtime owns this?" rather than "which exact file handles this event?"

| Boundary | Owns | First code roots | First docs |
| --- | --- | --- | --- |
| backend route/gateway | FastAPI app assembly, router registration, CORS, install auth, websocket handshake | private backend implementation | Gateway Protocol Map (private backend docs) |
| preload | context-bridge IPC surface and allowlist | `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json` | [Frontend Preload Docs Hub](../frontend/preload/README.md) |
| React renderer | dashboard, chat UI, response overlay UI, settings, permissions UI, voice controls, transcript projection, display-only tool state | `frontend/src/renderer` | [Frontend Architecture](frontend_architecture.md), [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |
| local-runtime implementation | local tools, browser runtime, filesystem/shell/computer actions, local memory DB/FAISS, system state, hosted SDK helper clients | `frontend/src/main/python` | [Local-Runtime Python Implementation](python_sidecar.md), [Local Tool Channels](../channels/sidecar_and_tool_channels.md) |
| wakeword subprocess | wakeword model/runtime, audio frame handling, detection events | `frontend/src/main/wakeword/wakeword_bridge*.cjs`, `frontend/src/main/python/wakeword_service.py` | [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |

## Boundary Tests

| Boundary change | Test direction |
| --- | --- |
| backend schema/event | backend contract tests plus renderer consumer tests when UI consumes it |
| Electron IPC/preload | IPC allowlist and channel parity tests |
| local-runtime tool | local-runtime Python pytest and backend/local-runtime parity tests for model-visible tools |
| platform capture/overlay | frontend overlay/window policy tests |
| hosted route/auth | backend route/auth tests and gateway docs examples |

## Related Docs

- [Architecture Hub](README.md)
- [Data Flow and State Ownership](data_flow_and_state_ownership.md)
- [Change Ownership Decision Tree](change_ownership_decision_tree.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)

## Evidence Notes

- Prove boundary ownership with the runtime that can observe or enforce the
  invariant, not with a downstream consumer that only renders the result.
- When two rows appear to own the same state, treat that as a design smell and
  route the change through the owner matrix before adding another bridge.
