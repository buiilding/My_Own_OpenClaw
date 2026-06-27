---
summary: "Decision tree for choosing the owning WindieOS subsystem before implementing backend, frontend, sidecar, hosted API, platform, provider, tool, memory, or packaging changes."
read_when:
  - When a requested change could fit multiple WindieOS runtimes.
  - When deciding which docs, files, and tests should be read before coding.
title: "Change Ownership Decision Tree"
---

# Change Ownership Decision Tree

Use this before touching code when ownership is ambiguous.

## Decision Tree

1. Does the behavior change what the model sees or how the agent loop reasons?
   - Yes: backend agent/tools/LLM ownership.
   - Read [Agent System](agent_system.md), [Tool System](tool_system.md), and [LLM Integration](llm_integration.md).
2. Does it require local machine authority such as screenshot, mouse, keyboard, file, shell, browser, window state, or local memory?
   - Yes: local-runtime Python/Electron main ownership.
   - Read [Local-Runtime Python Implementation](python_sidecar.md), [Tools Hub](../tools/README.md), and [Platform Permission Matrix](../platforms/permission_matrix.md).
3. Does it change windowing, overlays, endpoint selection, IPC, permissions, or process supervision?
   - Yes: Electron main ownership.
   - Read [Frontend Architecture](frontend_architecture.md) and [Frontend Main Docs Hub](../frontend/main/README.md).
4. Does it only change visible dashboard/chat/settings/voice UI presentation?
   - Yes: renderer ownership, unless the producer contract is wrong.
   - Read [Frontend Renderer Docs Hub](../frontend/renderer/README.md).
5. Does it expose or change a hosted HTTP/websocket route?
   - Yes: backend gateway/API ownership plus web/reference docs.
   - Read Gateway Protocol Map (private backend docs) and [HTTP and WebSocket API Surface](../reference/http_api_surface.md).
6. Does it change package output, bundled Python, signing, or installed app state?
   - Yes: install/operations/platform ownership.
   - Read [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md).
7. Does it create an extension point for tools, providers, SDK routes, or local-runtime actions?
   - Yes: read [Extension Points](extension_points.md) and [Plugins and Extensions Hub](../plugins/README.md).

## If Two Owners Seem Valid

Choose the producer first:

- malformed backend event: fix backend, not renderer display
- wrong local-runtime backend endpoint: fix Electron main env propagation, not local-runtime Python defaults
- permission status wrong: fix permission probe, not UI label
- tool call valid but action fails: fix SDK/main local-runtime dispatch, not backend schema
- packaged-only failure: fix packaging/runtime path, not source-mode launch code

## Minimum Update Scope

| Change touches | Also update |
| --- | --- |
| protocol or payload | reference docs and contract tests |
| visible runtime behavior | domain docs and focused tests |
| docs routing | hubs and `read_when` hints |
| platform-specific rule | platform matrix and OS page |
| hosted public route | web/gateway/reference docs and client docs |

## Related Docs

- [Runtime Boundary Matrix](runtime_boundary_matrix.md)
- [Data Flow and State Ownership](data_flow_and_state_ownership.md)
- [Validation Matrix](../development/validation_matrix.md)
