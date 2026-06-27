---
summary: "Compact WindieOS docs directory for quickly finding the most-used local docs without scanning the full generated index."
read_when:
  - When you want a short route map to the most common WindieOS docs.
  - When choosing between setup, architecture, debugging, SDK, tool, frontend, backend, operations, and reference docs.
title: "Docs Directory"
---

# Docs Directory

This is the compact local docs directory. For the complete canonical navigation map, use `docs/docs.json`. For agent-facing implementation routing, use [Documentation Hub](docs_hub.md). For searchable front matter and `read_when` hints, run `<windie> docs list` from the repo root.

## Start Here

- [Documentation Hub](docs_hub.md) - agent-facing subsystem, code-root, and validation routing.
- [Quick Start](quick_start.md) - fastest local run path.
- [Platform Setup: Backend + Frontend](platform_setup_backend_frontend.md) - source environment setup.
- [Product Overview](product_overview.md) - non-technical product shape.
- [Code Change Surface Index](../reference/code_change_surface_index.md) - feature request to source roots, tests, docs, and validation.
- [Agent Runtime Ownership and Change Routing](../development/agent_runtime_ownership_and_change_routing.md) - AGENTS.md runtime owner matrix and change-routing table.
- [Agent Routing Quick Cards](../development/agent_routing_quick_cards.md) - compact owner-first cards for common change types.

## Architecture

- [Runtime Model](../concepts/runtime_model.md) - backend, Electron main, renderer, preload, and local-runtime boundaries.
- [Runtime Nodes Hub](../nodes/README.md) - process and service ownership across backend, desktop, local runtime, wakeword, VM worker, and hosted ingress.
- [Channels Hub](../channels/README.md) - desktop, websocket, local-runtime JSON-RPC, voice, SDK, and VM-run communication paths.
- Gateway Hub (private backend docs) - hosted backend ingress, app assembly, websocket handshake, auth, health, and troubleshooting.
- [Agent Runtime Ownership and Change Routing](../development/agent_runtime_ownership_and_change_routing.md) - owner responsibilities and first docs for common change types.
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md) - owner selection by runtime and trust boundary.
- [Data Flow and State Ownership](../architecture/data_flow_and_state_ownership.md) - query, stream, tool result, settings, transcript, memory, artifact, permission, provider, and VM-run state.
- [Agent-Visible Data Pipeline](../architecture/agent_visible_data_pipeline.md) - what the model sees, what transports carry, what local-runtime Python executes, and what transcript/history preserve.
- [Change Ownership Decision Tree](../architecture/change_ownership_decision_tree.md) - routing ambiguous implementation work.

## Backend and Prompting

- Backend Hub (private backend docs) - backend source maps and sub-hubs.
- Backend Runtime Hub (private backend docs) - query, session, compaction, and event runtime.
- Query Lifecycle Change Workflow (private backend docs) - backend query and stream changes.
- Backend API Hub (private backend docs) - HTTP/websocket route ownership.
- Backend LLM Prompt Hub (private backend docs) - prompt constructor, prompt manager, and transparency metadata.
- Prompt Manager and System Prompt Lifecycle (private backend docs) - system prompt loading, rendering, and history wiring.

## Frontend and Desktop

- [Frontend Hub](../frontend/README.md) - renderer, main, preload, contracts, and local-runtime maps.
- [Desktop Surfaces](../desktop/README.md) - dashboard, chat pill, response overlay, voice, permissions, onboarding, screenshots, and artifacts.
- [Frontend Architecture](../architecture/frontend_architecture.md) - current Electron/React/local-runtime topology.
- [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md) - Electron main ownership.
- [Global Stop Shortcut Runtime Reference](../frontend/main/global_stop_shortcut_runtime_reference.md) - configurable stop-from-anywhere accelerator, registration fallback, and settings persistence.
- [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md) - chat/dashboard/settings renderer state.
- [IPC Change Workflow](../frontend/ipc_change_workflow.md) - preload/main/renderer IPC changes.
- [Workspace Context Change Workflow](../frontend/runtime/workspace_context_change_workflow.md) - workspace path and AGENTS.md prompt context.
- [Platforms Hub](../platforms/README.md) - macOS, Windows, and Linux permission, screenshot, overlay, packaging, and input behavior.

## Tools, Browser, SDK, and Providers

- [Tools Hub](../tools/README.md) - model-facing and local-runtime executable tool contracts.
- [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md) - tool visibility, schemas, policy, provider projection, and parity.
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) - backend call to SDK/main local execution to backend history.
- [Web Search Tool](../tools/web_search.md) - backend-owned logical web search, provider-native modes, Brave fallback, and policy gates.
- [Plugins and Extensions Hub](../plugins/README.md) - local-runtime plugin tools, prompt skills, MCP integrations, provider-like extensions, and current plugin boundaries.
- [MCP Runtime](../development/mcp.md) - repo-level MCP server config, discovery, enablement, execution, and MCP tool-result preservation.
- [Browser Change Workflow](../browser/browser_change_workflow.md) - dedicated browser schema, runtime, bridge, UI, and tests.
- [Browser Hub](../browser/README.md) - dedicated browser runtime, CDP session ownership, action schemas, snapshots, and debug routes.
- [SDK Hub](../sdk/README.md) - hosted clients, query planning, OCR/vision, and tool authoring.
- [AgentClient Runtime Contract](../sdk/windie_client_runtime.md) - SDK runtime ownership and public API.
- [Providers Hub](../providers/README.md) - LLM, inference, credential, STT, TTS, and search providers.
- [Models and LLM Providers](../providers/models.md) - provider factory registration, model catalog metadata, reasoning variants, and capability flags.

## Debug, Install, and Operations

- [Debug Hub](../debug/README.md) - logs, flags, process health, traces, symptom playbooks, and test selection.
- [Process Health Checklist](../debug/process_health_checklist.md) - prove which process is dead, stuck, disconnected, or healthy.
- [Triage Routes](../help/triage_routes.md) - symptom to owner before code edits.
- [Help Hub](../help/README.md) - diagnostics, triage, doctor checklist, evidence packets, FAQ, and troubleshooting routes.
- [Install Hub](../install/README.md) - local development, packaged builds, endpoint setup, and reset loops.
- [Local Development](../install/local_development.md) - source setup, run commands, tests, and environment launcher.
- [Operations Hub](../operations/README.md) - runtime config, hosted auth, packaging, release, deployment, and troubleshooting.
- Automation Hub (private backend docs) - VM run orchestration, worker polling, run-control APIs, and scheduler boundaries.
- Runtime Configuration Matrix (private backend docs) - config ownership, defaults, propagation, and validation.
- Remote Backend Auto Deploy (private backend docs) - GitHub push-to-host checkout updates, systemd restarts, and deploy health checks.
- [Web Surfaces](../web/README.md) - landing page, hosted APIs/auth, SDK clients, artifacts, websockets, and dashboard-adjacent web behavior.

## Security and Reference

- [Security Hub](../security/README.md) - hosted auth, IPC isolation, validation, credentials, tools, and local-runtime trust boundaries.
- [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) - screen/input/microphone/browser/workspace/sudo authority changes.
- [Memory Hub](../memory/README.md) - transcript, replay, local-runtime memory, backend history, semantic routes, and compaction ownership.
- [Reference Hub](../reference/README.md) - stable API, websocket event, configuration, and identifier maps.
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md) - route-level hosted API map.
- [WebSocket Event Reference](../reference/websocket_event_reference.md) - backend event families and renderer consumers.
- [Commands and Scripts](../cli/README.md) - first-class `<windie>` command groups, diagnostics, docs search, tests, build, package, and deploy helpers.
- [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md) - docs organization benchmark.
