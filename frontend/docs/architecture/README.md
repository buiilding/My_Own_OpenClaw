---
summary: "Architecture hub for WindieOS runtime boundaries, data flow, state ownership, failure domains, and subsystem-specific architecture pages."
read_when:
  - When making cross-cutting backend, Electron main, renderer, local-runtime, or
    SDK changes or deciding which runtime owns a behavior.
  - When adding architecture docs or routing a feature through backend,
    surfaces.
title: "Architecture Hub"
---

# Architecture Hub


## Architecture Pages

- [System Architecture](architecture.md)
- [Runtime Boundary Matrix](runtime_boundary_matrix.md)
- [Agent-Visible Data Pipeline](agent_visible_data_pipeline.md)
- [Data Flow and State Ownership](data_flow_and_state_ownership.md)
- [Storage and Persistence Change Workflow](storage_persistence_change_workflow.md)
- [Change Ownership Decision Tree](change_ownership_decision_tree.md)
- [Failure Domain Map](failure_domain_map.md)
- [Communication Flow](communication_flow.md)
- Backend Architecture (private backend docs)
- [Frontend Architecture](frontend_architecture.md)
- [Local-Runtime Python Implementation](python_sidecar.md)
- [Agent System](agent_system.md)
- Backend Tool System (private backend docs)
- [LLM Integration](llm_integration.md)
- [Memory System](memory_system.md)
- [Extension Points](extension_points.md)

## Primary Boundary

| Runtime | Owns | Does not own |
| --- | --- | --- |
| hosted backend | agent loop, providers, model-facing tool schema, route auth, websocket events, OCR/vision/embedding/TTS services, artifacts, SDK/runs APIs | local mouse/keyboard/files/processes, Electron windows, local permissions |
| Electron main | desktop window lifecycle, overlay orchestration, SDK runtime adaptation, endpoint selection, local config, permission probes, local-runtime host/status context | model-facing prompt/tool policy, hosted backend websocket primitives, local-runtime tool implementation |
| React renderer | dashboard/chat UI, stream presentation, settings UI, onboarding, transcript queue, SDK projection rendering | OS permission probing, backend route auth, local-runtime lifecycle, tool execution orchestration |
| preload | constrained renderer IPC exposure and channel allowlist | business logic, backend transport, local execution |
| local-runtime implementation | local tool execution, browser automation runtime, local memory storage, system state, wakeword service process | backend agent loop, model provider selection, renderer UI |

## Architecture Rules

- Identify the producer runtime before editing the visible consumer.
- Keep Electron client and local-runtime Python implementation imports
  independent from backend Python packages.
- Route schema parity through explicit contracts and tests.
- Keep local machine authority in the local runtime or Electron main, not
  hosted REST routes.
- Keep public hosted API behavior documented in gateway/reference/web docs.

## Related Docs

- [Runtime Model](../concepts/runtime_model.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
- [Agent-Visible Data Pipeline](agent_visible_data_pipeline.md)
- [Channel Routing Matrix](../channels/channel_routing_matrix.md)
- [Storage and Persistence Change Workflow](storage_persistence_change_workflow.md)
- Security Boundary Matrix (private backend docs)
