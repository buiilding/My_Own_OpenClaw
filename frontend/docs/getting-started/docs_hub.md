---
summary: "Agent-facing WindieOS docs hub for quickly choosing the right subsystem, docs, code roots, and validation path before development."
read_when:
  - When you need a fast entrypoint to WindieOS docs by domain.
  - When deciding where to develop, debug, or modify code.
  - When deciding where new documentation should be added.
title: "Documentation Hub"
---

# Documentation Hub

This is the OpenClaw-style entrypoint for working on WindieOS. Start here when you need to identify the right subsystem, code roots, docs, and tests before changing behavior.

WindieOS has four hard runtime boundaries:

- The hosted FastAPI backend owns the agent loop, model-facing tool schema, LLM providers, streaming contracts, OCR/vision, TTS/STT, embeddings, artifacts, and SDK routes.
- The Electron main agent host owns desktop windows, overlays, permissions, preload IPC, local config persistence, OS integration, and SDK local-runtime host context.
- The renderer owns desktop UI presentation, conversation projection display, settings views, dashboard surfaces, voice UI, and user interaction state.
- The local runtime owns local tool execution, browser automation, filesystem/shell/computer actions, local memory storage, system state, and wakeword subprocess authority; local-runtime Python is the current concrete implementation for those local capabilities.

Electron main, renderer, and local-runtime Python code must not import backend code for parity. Keep parity in explicit contracts, generated schemas, and tests.

## Agent Workflow

1. Check `docs/docs.json` for canonical docs navigation.
2. Use [Docs Directory](docs_directory.md) for the compact route map.
3. Run the docs index first: `<windie> docs list` from the repo root.
4. Pick the closest change path below before searching broadly.
5. Read the domain hub, the capability-to-file matrix, and the focused reference for the behavior you are changing.
6. Edit the owner subsystem first. Do not patch a consumer layer to hide malformed producer behavior.
7. Update tests and docs in the same pass when behavior, API, IPC, schema, or runtime contracts change.

## Start Here

- [Docs Directory](docs_directory.md) for the compact route map to the most-used docs.
- [Product Overview](product_overview.md) for the non-technical product shape.
- [Quick Start](quick_start.md) for the local run path.
- Platform Setup: Backend + Frontend (private backend docs) for environment setup.
- [Concepts Hub](../concepts/README.md) for product/system mental models before implementation details.
- [Sessions and Conversations](../concepts/sessions_and_conversations.md) for user/session/conversation identity, transcript replay, backend rehydrate, and wrong-thread debugging.
- [Session and Conversation Identity Change Workflow](../memory/session_conversation_identity_change_workflow.md) for `user_id`, `session_id`, `conversation_ref`, `turn_ref`, transcript-session sync, replay, rehydrate, stale-event filtering, and wrong-conversation bugs.
- [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md) for transcript writes, pending queues, local-runtime transcript storage, dashboard replay/resume, backend rehydrate payloads, and tool-row reconstruction.
- [Streaming and Events](../concepts/streaming_and_events.md) for websocket event families, renderer consumers, token-counts, tool events, and audio side-channels.
- [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md) for backend event dataclasses, formatter specs, outgoing schemas, Agent SDK projection, typed Electron fan-out, stream handlers, terminal events, and audio side-channels.
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md) for prompt inputs, repo instructions, tool-schema visibility, and transparency events.
- [Agent-Visible Data Pipeline](../architecture/agent_visible_data_pipeline.md) for tracing what the model saw, what each transport carried, what local execution ran, and what returned to transcript/history.
- [Model Provider Selection](../concepts/model_provider_selection.md) for provider runtime selection, model catalogs, credential gates, and failover boundaries.
- [Usage and Token Accounting](../concepts/usage_and_token_accounting.md) for token-count events, provider usage diagnostics, cache metrics, and billing boundaries.
- Gateway Hub (private backend docs) for hosted backend ingress, app assembly, websocket protocols, auth, health, and route troubleshooting.
- WebSocket Connection Change Workflow (private backend docs) for main `/ws` handshake auth, identity binding, message validation, task limits, receive timeouts, handler dispatch, transport sends, and cleanup.
- [Channels Hub](../channels/README.md) for desktop, websocket, voice, sidecar, SDK, and VM-run communication paths.
- [Memory Hub](../memory/README.md) for transcript, replay, local-runtime memory, backend history, and semantic route ownership.
- [Memory Change Workflow](../memory/memory_change_workflow.md) for routing transcript, replay, local-runtime memory, semanticization, backend history, and compaction edits.
- [Session and Conversation Identity Change Workflow](../memory/session_conversation_identity_change_workflow.md) for changing conversation/session identity, active stream filtering, resume/rehydrate routing, and wrong-thread fixes.
- [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md) for changing visible transcript persistence, pending queue retries, dashboard replay, and backend rehydrate flow.
- [Security Hub](../security/README.md) for hosted auth, IPC isolation, validation, credentials, permissions, tools, and sidecar security boundaries.
- [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) for screen/input/microphone/browser/workspace/sudo authority changes.
- [Plugins and Extensions Hub](../plugins/README.md) for current extension points and future plugin-system boundaries.
- [Extension Convention](../development/extensions.md) for reusable local runtime tool schemas, main-process plugin tools, MCP servers, prompt layers, extension skills, settings panels, lifecycle hooks, and extension docs.
- [MCP Runtime](../development/mcp.md) for connecting stdio MCP servers, discovering MCP tools, and exposing them through the client tool manifest.
- [Desktop Surfaces](../desktop/README.md) for dashboard, chat pill, response overlay, onboarding, permissions, voice, and artifacts.
- [Debug Hub](../debug/README.md) for logs, diagnostic flags, endpoint/network checks, process health, trace flags, symptom playbooks, and test selection.
- [Observability Change Workflow](../debug/observability_change_workflow.md) for adding logs, trace flags, metrics, diagnostic events, and evidence collection safely.
- [Error and Failure Change Workflow](../debug/error_failure_change_workflow.md) for backend exceptions, websocket/HTTP errors, IPC failures, local-runtime ToolResult failures, renderer error UI, retries, and sanitized logs.
- Endpoint and Network Debugging (private backend docs) for hosted/local backend URL resolution, private deployment, auth, websocket, and local-runtime endpoint drift.
- Process Health Checklist (private backend docs) for proving which process is dead, stuck, disconnected, or healthy before editing code.
- [Tools Hub](../tools/README.md) for model-facing and local-runtime executable tools.
- [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md) for changing model-visible tool schemas, policy gates, provider projection, local-runtime executable parity, SDK/main dispatch, and tool-result contracts.
- [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md) for changing or debugging `read_file`, `replace`, `run_shell_command`, `process`, sudo prompt behavior, working directories, process sessions, output formatting, and local tool results.
- [Browser Change Workflow](../browser/browser_change_workflow.md) for browser action schemas, shared contracts, local-runtime execution, local-runtime Python adapters, CDP launch, snapshots, refs, files, Electron bridge, and renderer browser controls.
- [Providers Hub](../providers/README.md) for LLM, inference, credential, STT, TTS, and web-search providers.
- [Provider Change Workflow](../providers/provider_change_workflow.md) for backend provider runtime, factory, config, credential, frontend setting, and test changes.
- [Model Catalog Change Workflow](../providers/model_catalog_change_workflow.md) for model ids, capability flags, routing metadata, and picker behavior.
- [Inference Capability Change Workflow](../providers/inference_capability_change_workflow.md) for OCR, vision, embeddings, STT, TTS, provider factories, routers, health gates, SDK routes, and local-runtime remote-client changes.
- Backend Config and Container Change Workflow (private backend docs) for backend `AppConfig`, runtime normalization, DI rebinding, provider refresh, and session settings propagation.
- [SDK Hub](../sdk/README.md) for hosted backend clients, query planning, OCR/vision, and tool authoring.
- [SDK Route Change Workflow](../sdk/sdk_route_change_workflow.md) for hosted SDK route, client, artifact, OCR, vision, and test changes.
- [SDK Auth and Error Handling](../sdk/sdk_auth_and_error_handling.md) for SDK auth, endpoint, status, websocket, and client error contracts.
- [Install Hub](../install/README.md) for local development, packaged desktop builds, endpoint setup, reinstall/reset loops, and install troubleshooting.
- [Install Decision Matrix](../install/install_decision_matrix.md) for choosing the correct source, packaged, endpoint, reinstall, or release-validation path.
- [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md) for changing Electron Builder targets, bundled local-runtime Python generation, reinstall helpers, smoke checks, and release workflow behavior.
- Backend Endpoint Setup (private backend docs) for hosted, local, packaged-default, and custom hosted backend routing.
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md) for OS-specific local packaged reinstall helpers and reset scope.
- [Install Troubleshooting](../install/install_troubleshooting.md) for install failures across dependencies, packaged local-runtime Python, endpoint routing, permissions, and signing.
- [Operations Hub](../operations/README.md) for runtime config, hosted auth, packaging, release, deployment, and operational troubleshooting.
- [Commands and Scripts](../cli/README.md) for the first-class Windie CLI surface.
- [Command Matrix](../cli/command_matrix.md) for the full `<windie>` command groups.
- [Validation Commands](../cli/validation_commands.md) for choosing focused checks by changed boundary.
- [Packaging and Release Commands](../cli/packaging_and_release_commands.md) for bundled local-runtime Python builds, Electron package commands, smoke helpers, and reinstall loops.
- [Platforms Hub](../platforms/README.md) for macOS, Windows, and Linux permission, screenshot/overlay, window/input, packaging, and runtime behavior.
- [Platform Change Workflow](../platforms/platform_change_workflow.md) for routing OS-specific screenshot, overlay, permission, input, sidecar, and packaging changes.
- [Platform Validation Matrix](../platforms/platform_validation_matrix.md) for choosing focused platform tests and manual OS smoke checks.
- [Platform Permission Matrix](../platforms/permission_matrix.md) for platform-specific permission probes, onboarding visibility, and grant routing.
- [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md) for capture-time hide/restore and content-protection rules.
- [Window and Input Matrix](../platforms/window_input_matrix.md) for active-window, window-switching, and local input-control ownership.
- [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) for target OS package commands, bundled runtime rules, and smoke checks.
- [Help Hub](../help/README.md) for diagnostics, troubleshooting, triage routes, doctor-style checks, evidence packets, and FAQ routes.
- [Triage Routes](../help/triage_routes.md) for mapping user-visible symptoms to the first likely runtime owner.
- Doctor Checklist (private backend docs) for collecting environment, endpoint, local-runtime, permission, packaging, and hosted evidence.
- [Evidence Packet](../help/evidence_packet.md) for handoff-ready bug reports across backend, Electron main, renderer, local-runtime, local-runtime Python implementation, and SDK boundaries.
- [FAQ](../help/faq.md) for recurring source, packaged, endpoint, provider, tool, browser, permission, and memory questions.
- [Web Surfaces](../web/README.md) for landing, hosted API/auth, SDK/client, artifact, websocket, and dashboard-adjacent web boundaries.
- [Web Surface Matrix](../web/web_surface_matrix.md) for mapping web/API changes to owners and public contracts.
- Hosted API and Auth (private backend docs) for hosted REST/websocket auth, CORS, health checks, and failure routing.
- [Landing Page Change Workflow](../web/landing_page_change_workflow.md) for standalone public landing entrypoint, content, anchor, CTA, and claim changes.
- [Web Client Integration](../web/web_client_integration.md) for TypeScript/Python hosted client and non-Electron integration boundaries.
- [Reference Hub](../reference/README.md) for stable API, websocket event, configuration, and session/transcript lookup maps.
- [Code Change Surface Index](../reference/code_change_surface_index.md) for routing concrete feature requests to source roots, tests, docs, and validation commands.
- [Agent Routing Quick Cards](../development/agent_routing_quick_cards.md) for compact owner-first routes through common change types.
- [Architecture Hub](../architecture/README.md) for runtime boundaries, ownership decision trees, state flow, and failure-domain maps.
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md) for choosing the owning process/trust boundary.
- [Data Flow and State Ownership](../architecture/data_flow_and_state_ownership.md) for query, stream, tool-result, settings, transcript, memory, artifact, permission, provider, and VM-run ownership.
- [Storage and Persistence Change Workflow](../architecture/storage_persistence_change_workflow.md) for renderer storage, Electron user-data files, sidecar SQLite/FAISS, backend artifacts, install-auth SQLite, caches, and in-memory service state.
- [Change Ownership Decision Tree](../architecture/change_ownership_decision_tree.md) for routing ambiguous implementation requests.
- [Failure Domain Map](../architecture/failure_domain_map.md) for cross-runtime failure triage.
- [System Architecture](../architecture/architecture.md) for the high-level runtime model.
- [Communication Flow](../architecture/communication_flow.md) for cross-process event flow.
- OpenClaw Docs Structure Reference (private backend docs) for the docs organization benchmark.

## Runtime Boundary Map

| Area | Owns | Code roots | Start docs |
| --- | --- | --- | --- |
| Backend API + transport | HTTP routes, websocket handshake, incoming message dispatch, outgoing event envelopes, formatter contracts | private backend implementation | Backend API Docs Hub (private backend docs), API Route Change Workflow (private backend docs), Backend Contracts Docs Hub (private backend docs), Backend Inventory Protocols Hub (private backend docs) |
| Gateway ingress | FastAPI app assembly, CORS, router registration, install auth middleware, hosted REST/websocket ingress, health checks, private deployment troubleshooting | private backend implementation, private deployment scripts | Gateway Hub (private backend docs), Gateway Protocol Map (private backend docs), WebSocket Connection Change Workflow (private backend docs), Gateway Troubleshooting (private backend docs) |
| Agent-visible data pipeline | Model-visible prompt/tool payloads, provider tool calls, websocket events, IPC envelopes, JSON-RPC args, local execution results, transcript rows, and backend history | private backend implementation, `packages/windie-sdk-js/src/tools`, `frontend/src/main/sidecar/local_runtime*.cjs`, `frontend/src/main/python/tools` | [Agent-Visible Data Pipeline](../architecture/agent_visible_data_pipeline.md), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), [Prompt and Tool Context](../concepts/prompt_and_tool_context.md), [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md) |
| Security boundaries | Hosted auth, websocket validation, IPC isolation, credentials, permissions, tool policy, local execution, multi-user risks | private backend implementation, `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json`, `frontend/src/main/python/tools` | [Security Hub](../security/README.md), Security Boundary Matrix (private backend docs), Security Change Playbook (private backend docs) |
| Plugins and extensions | Current source-owned extension surfaces for tools, providers, inference adapters, SDK routes, browser actions, renderer features, and future plugin boundaries | private backend implementation, `frontend/src/main/python/tools`, `frontend/src/renderer/features` | [Plugins and Extensions Hub](../plugins/README.md), [Extension Surface Matrix](../plugins/extension_surface_matrix.md), [Architecture Extension Points](../architecture/extension_points.md) |
| Backend agent runtime | Session lifecycle, query execution, interaction loop, tool turns, history, compaction, prompt context | private backend implementation | Backend Agent Docs Hub (private backend docs), Backend Runtime Docs Hub (private backend docs), Query Lifecycle Change Workflow (private backend docs), Tool Turn Change Workflow (private backend docs) |
| Backend tool schema + orchestration | Model-facing tool registry, schema filtering, coordinate preparation, local-runtime dispatch, result waiting, tool-result history | private backend implementation | Backend Tools Docs Hub (private backend docs), [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md), Backend Change Path Playbook (private backend docs) |
| Backend LLM + prompts | Provider factory, model catalog, prompt construction, parser/trust boundary, stream normalization | private backend implementation | Backend LLM Docs Hub (private backend docs), Backend LLM Provider Docs Hub (private backend docs), Backend LLM Prompt Docs Hub (private backend docs), Prompt Context Change Workflow (private backend docs) |
| Private hosted services | Artifacts, embeddings, semantic memory API, OCR, vision, token counting, TTS/wakeword audio services | private backend implementation | Backend Services Hub (private backend docs), Backend Service Change Workflow (private backend docs), [Inference Capability Change Workflow](../providers/inference_capability_change_workflow.md), Backend Screen-Grounding Docs Hub (private backend docs) |
| Electron main | Windows, overlays, SDK-runtime adapter, config persistence, local-runtime host adapters, permissions, wakeword bridge | `frontend/src/main` | [Frontend Main Docs Hub](../frontend/main/README.md), [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md), [Local Runtime Process Lifecycle Change Workflow](../frontend/main/local_backend/process_lifecycle_change_workflow.md), [Frontend Runtime Docs Hub](../frontend/runtime/README.md), [IPC Change Workflow](../frontend/ipc_change_workflow.md) |
| Renderer | Chat UI, dashboard, settings, model/provider selection, startup/onboarding, permissions, voice UI, SDK stream projection consumption, tool display, transcript queue | `frontend/src/renderer` | [Frontend Renderer Docs Hub](../frontend/renderer/README.md), [Dashboard Change Workflow](../frontend/renderer/dashboard/dashboard_change_workflow.md), [App Startup and Onboarding Change Workflow](../frontend/renderer/app_startup_onboarding_change_workflow.md), [Model Settings Change Workflow](../frontend/renderer/settings/model_settings_change_workflow.md), [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md), [Frontend Inventory Domains Hub](../frontend/inventory/domains/README.md) |
| Workspace context | Active workspace permission, conversation workspace binding, workspace path query forwarding, AGENTS.md repo instructions, and backend prompt context | `frontend/src/renderer/infrastructure/workspace`, `frontend/src/main/app/repo_instruction_runtime.cjs`, private backend implementation | [Workspace Context Change Workflow](../frontend/runtime/workspace_context_change_workflow.md), Prompt Context Change Workflow (private backend docs), [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) |
| Preload IPC | Isolated renderer bridge, channel allowlist, IPC surface trust boundary | `frontend/src/preload.js` | [Frontend Preload Docs Hub](../frontend/preload/README.md), [Frontend Contracts IPC Docs Hub](../frontend/contracts/ipc/README.md), [IPC Change Workflow](../frontend/ipc_change_workflow.md) |
| Local-runtime implementation | Local JSON-RPC, shell/filesystem/computer/system tools, browser runtime, local memory, system state, wakeword service backed by local-runtime Python | `frontend/src/main/python` | [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md), [Local-Runtime Python Implementation Change Workflow](../frontend/sidecar/local_runtime_python_change_workflow.md), [Local Runtime Process Lifecycle Change Workflow](../frontend/main/local_backend/process_lifecycle_change_workflow.md), [Local Runtime JSON-RPC Change Workflow](../frontend/sidecar/local_backend_jsonrpc_change_workflow.md), [Local-Runtime Tools Docs Hub](../frontend/sidecar/tools/README.md), [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md) |
| Platform behavior | OS-specific permissions, screenshots, overlays, content protection, display affinity, window/input adapters, packaged runtime smoke checks | `frontend/src/main/platform`, `frontend/src/main/permissions/permission_service*.cjs`, `frontend/src/main/python/core/platform`, `frontend/src/main/python/tools/computer`, `<windie> reinstall <platform>`, `scripts/ci/smoke-*` | [Platforms Hub](../platforms/README.md), [Platform Change Workflow](../platforms/platform_change_workflow.md), [Platform Validation Matrix](../platforms/platform_validation_matrix.md) |
| Operations | Config, hosted auth, deployment, packaging, release, performance, security, runtime troubleshooting | `docs/operations`, `scripts`, `.github/workflows`, build config | [Operations Hub](../operations/README.md), Configuration Change Workflow (private backend docs), Runtime Configuration Matrix (private backend docs), Backend Config and Container Change Workflow (private backend docs), Operational Troubleshooting (private backend docs) |

## Change Path Playbooks

### Change an Entry Channel or Transport Route

Read:

- [Runtime Nodes Hub](../nodes/README.md)
- Gateway Hub (private backend docs)
- [Channels Hub](../channels/README.md)
- [Channel Routing Matrix](../channels/channel_routing_matrix.md)
- [Communication Flow](../architecture/communication_flow.md)
- [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [IPC Change Workflow](../frontend/ipc_change_workflow.md)
- Backend API and Transport (private backend docs)

Likely code:

- `frontend/src/main/ipc.cjs`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/**`
- private backend implementation
- private backend implementation
- `frontend/src/main/python/**` when the local-runtime Python implementation is involved behind the SDK local runtime

Validate producer/consumer tests on both sides of the changed channel. Do not reuse another channel's private payload shape as an implicit compatibility shortcut.

### Change a Runtime Node Boundary

Read:

- [Runtime Nodes Hub](../nodes/README.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
- [Desktop and Local Runtime Node](../nodes/desktop_and_sidecar_node.md)
- [Current vs Future Nodes](../nodes/current_vs_future_nodes.md)

Likely code:

- hosted backend node: private backend implementation
- Electron desktop nodes: `frontend/src/main/**`, `frontend/src/preload.js`, `frontend/src/renderer/**`
- sidecar/wakeword nodes: `frontend/src/main/python/**`, `frontend/src/main/wakeword/wakeword_bridge*.cjs`

Validate the owner node plus the adjacent protocol boundary. If a planned mobile, edge, scheduler, plugin-marketplace, or one-agent-per-VM node is not implemented yet, keep the docs under planning until there is a code root and lifecycle.

### Change Hosted Backend Gateway, Route Assembly, Auth, or Health

Read:

- Gateway Hub (private backend docs)
- Gateway Protocol Map (private backend docs)
- Gateway Auth and Health Runbook (private backend docs)
- REST Route Auth Matrix (private backend docs)
- WebSocket Connection Lifecycle (private backend docs)
- Gateway Troubleshooting (private backend docs)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Likely code:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private deployment scripts for custom hosted deployment/tunnel behavior

Validate route/schema tests, auth/websocket tests when auth changes, SDK clients for public route changes, and private deployment docs for deployment changes.

### Change Auth, IPC Security, Credentials, Permissions, or Tool Authority

Read:

- [Security Hub](../security/README.md)
- Security Boundary Matrix (private backend docs)
- Security Change Playbook (private backend docs)
- Credential and Token Change Workflow (private backend docs)
- [Safety Boundaries](../concepts/safety_boundaries.md)

Likely code:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/main/permission*`
- `frontend/src/main/python/tools/**`

Validate the enforcing boundary plus the producer/consumer boundary. Never commit credentials, broaden preload IPC generically, or trust renderer-provided hosted identity.

### Add a Plugin-Like Extension

Read:

- [Plugins and Extensions Hub](../plugins/README.md)
- [Extension Surface Matrix](../plugins/extension_surface_matrix.md)
- [Current vs Future Plugin Boundary](../plugins/current_vs_future_plugin_boundary.md)
- [Architecture Extension Points](../architecture/extension_points.md)

Likely code depends on the extension type:

- tools: private backend implementation, `frontend/src/main/python/tools/**`
- providers: private backend implementation
- SDK routes: private backend implementation, SDK client wrappers
- renderer features: `frontend/src/renderer/features/**`

Validate the registration point, policy/visibility, execution path, and docs for the specific extension surface. Treat installable third-party plugins as future planning unless a real loader, trust model, and tests exist.

### Add or Change a WebSocket Message

Read:

- [Streaming and Events](../concepts/streaming_and_events.md)
- Backend Change Path Playbook (private backend docs)
- Backend Message Schema + Formatter Reference (private backend docs)
- [Frontend IPC and Local-Runtime Contract Touchpoints](../frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md)

Likely code:

- private backend implementation
- private backend implementation or private backend implementation
- private backend implementation
- private backend implementation
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/events/backendEvents.ts`

Validate with schema, handler-routing, formatter, and renderer event-consumption tests.

### Change Query Streaming or Completion Behavior

Read:

- Query Lifecycle Change Workflow (private backend docs)
- Backend Query Handler and Query Execution Service Runtime Reference (private backend docs)
- Backend Stream Pipeline, Completion, and TTS Concurrency Reference (private backend docs)
- [Frontend Query Send and Stream Relay Change Workflow](../frontend/main/query_send_and_stream_relay_change_workflow.md)
- [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md)
- [Frontend Chat Stream + Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md)

Likely code:

- private backend implementation
- private backend implementation
- private backend implementation
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`

Validate backend stream lifecycle tests plus renderer stream hook/store tests.

### Change Tool Schema, Tool Calls, or Tool Results

Read:

- Tool Turn Change Workflow (private backend docs)
- Backend Tools Docs Hub (private backend docs)
- [Tool Catalog Matrix](../tools/tool_catalog_matrix.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)
- [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md)
- Backend Tool Preparation + Coordinate Resolution Reference (private backend docs)
- Backend Tool Result Ingress Reference (private backend docs)
- [Windie Client Runtime](../sdk/windie_client_runtime.md)
- [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md)

Likely code:

- private backend implementation
- private backend implementation
- private backend implementation
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `frontend/src/main/python/tools/**`

Validate backend schema/parser/formatter tests, SDK/main tool-router tests, and local-runtime executable registry tests backed by local-runtime Python modules. Keep backend model-facing schemas and local-runtime executable args/results aligned deliberately.

### Change Desktop Computer Use, Screenshots, OCR, or Vision

Read:

- [Platform Change Workflow](../platforms/platform_change_workflow.md)
- [Platform Validation Matrix](../platforms/platform_validation_matrix.md)
- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- Backend OCR + Vision Coordinate Runtime Overview (private backend docs)
- Backend OCR Service + Screenshot State-Machine Reference (private backend docs)

Likely code:

- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- `frontend/src/main/overlays/*`
- `frontend/src/main/python/tools/computer/*`
- private backend implementation
- private backend implementation

Validate platform-specific frontend tests, local-runtime Python computer-tool tests, and backend OCR/coordinate-preparation tests. Linux is the only OS that should hide desktop overlay surfaces for screenshot capture.

### Change Browser Automation

Read:

- [Browser Change Workflow](../browser/browser_change_workflow.md)
- [Browser Control](../browser/browser_control.md)
- [Local-Runtime Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- Backend Browser Remote Schema Surface Reference (private backend docs)
- Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference (private backend docs)

Likely code:

- private backend implementation
- `frontend/src/main/python/tools/browser/**`
- `frontend/src/renderer/features/dashboard/components/*` for browser UI surfaces

Validate backend/local-runtime browser schema parity, local-runtime Python browser action tests, and renderer browser header/status tests when UI changes.

### Change Renderer Chat, Dashboard, or Settings UI

Read:

- [Frontend Renderer Docs Hub](../frontend/renderer/README.md)
- [Frontend Renderer Chat Docs Hub](../frontend/renderer/chat/README.md)
- [Chat Attachment Change Workflow](../frontend/renderer/chat/chat_attachment_change_workflow.md)
- [Dashboard Change Workflow](../frontend/renderer/dashboard/dashboard_change_workflow.md)
- [Frontend Renderer Dashboard Docs Hub](../frontend/renderer/dashboard/README.md)
- [Frontend Renderer Settings Docs Hub](../frontend/renderer/settings/README.md)
- [Settings Surface Change Workflow](../frontend/renderer/settings/settings_surface_change_workflow.md)
- [Frontend Global Theme + Main Layout Style Runtime](../frontend/renderer/styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md)

Likely code:

- `frontend/src/renderer/features/chat/**`
- `frontend/src/renderer/features/dashboard/**`
- `frontend/src/renderer/features/settings/**`
- `frontend/src/renderer/app/**`
- `frontend/src/renderer/styles/**`

Validate focused frontend tests. Purely visual changes can skip new tests when they are low signal, but still verify layout behavior.

### Change Overlay, Minimal Pill, or Window Visibility Behavior

Read:

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Main Overlay Focus Docs Hub](../frontend/main/overlays/README.md)
- [Frontend Overlay Query-Capture Blur + Settle](../frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Frontend Response Overlay Phase Runtime Reference](../frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Frontend Chatbox Overlay Input, Drag, and Click-Through Reference](../frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)

Likely code:

- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/overlay_*`
- `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_state.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/renderer/app/ChatBox*.jsx`
- `frontend/src/renderer/features/chat/**`
- `frontend/src/renderer/features/overlays/**`

Validate main-process overlay tests and renderer overlay tests. Keep focus, visibility, click-through, and transport changes scoped separately unless the state machine requires a combined patch.

### Change Voice, Wakeword, STT, or TTS

Read:

- [Voice Audio Change Workflow](../channels/voice_audio_change_workflow.md)
- [Renderer Voice Capture + Wakeword Controller Reference](../frontend/renderer/voice_capture_and_wakeword_controller_reference.md)
- [Electron Wakeword Bridge + Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md)
- Backend TTS + Wakeword Audio Runtime Reference (private backend docs)
- Backend TTS Manager Audio Stream and Cleanup Reference (private backend docs)

Likely code:

- `frontend/src/renderer/features/voice/**`
- `frontend/src/main/wakeword/wakeword_bridge*.cjs`
- `frontend/src/main/python/wakeword_service.py`
- private backend implementation
- private backend implementation

Validate audio framing, voice hook, wakeword bridge, and backend TTS/STT tests.

### Change Transcript, Local Memory, or Semantic Memory

Read:

- [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md)
- [Frontend Transcript Session + Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [Local Runtime Memory Docs Hub](../frontend/sidecar/memory/README.md)
- Backend Embedding + Semantic Memory Runtime Reference (private backend docs)
- Backend API Memory Docs Hub (private backend docs)

Likely code:

- `frontend/src/renderer/infrastructure/transcript/**`
- `frontend/src/main/python/memory/**`
- `frontend/src/main/python/core/remote_*_client.py`
- private backend implementation
- private backend implementation

Validate renderer transcript tests, local-runtime memory tests, and backend memory route tests. Keep transcript replay state and semantic memory state distinct.


Read:

- Automation Hub (private backend docs)
- Runs API Runbook (private backend docs)
- Runtime Configuration Matrix (private backend docs)

Likely code:

- private backend implementation
- private backend implementation
- private backend implementation
- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`


### Add or Change an LLM Provider, Prompt, or Model Catalog

Read:

- [Model Provider Selection](../concepts/model_provider_selection.md)
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md)
- Backend LLM Provider Docs Hub (private backend docs)
- Backend Provider Factory + Runtime Selection Reference (private backend docs)
- Backend Prompt Constructor and Transparency Metadata Reference (private backend docs)
- [LLM Integration](../architecture/llm_integration.md)

Likely code:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation

Validate provider stream/non-stream/tool-call behavior, model listing, config loading, prompt transparency, and any regenerated prompt/schema snapshots.

### Change Config, Settings, or Runtime Policy

Read:

- Configuration Change Workflow (private backend docs)
- Backend Config Runtime Policy (private backend docs)
- [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md)
- [Settings Surface Change Workflow](../frontend/renderer/settings/settings_surface_change_workflow.md)
- [Renderer Config Sync + Settings Lifecycle Reference](../frontend/runtime/config_sync_and_settings_lifecycle_reference.md)
- [Frontend Settings + Models ACK Event Routing Reference](../frontend/contracts/events/settings_and_model_ack_event_routing_reference.md)

Likely code:

- private backend implementation
- private backend implementation
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/renderer/features/settings/**`

Validate backend config service tests, renderer settings sync tests, and model/settings ACK routing tests.

### Change Packaging, Release, Security, or Hosted Runtime

Read:

- Configuration (private backend docs)
- Configuration Change Workflow (private backend docs)
- Runtime Configuration Matrix (private backend docs)
- Hosted Backend Auth (private backend docs)
- Deployment (private backend docs)
- Evidence Collection Runbook (private backend docs)
- Incident Triage Runbook (private backend docs)
- [Release Guide](../operations/release.md)
- Security (private backend docs)
- Multi-User Runtime Hardening (private backend docs)
- [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Install Decision Matrix](../install/install_decision_matrix.md)
- Backend Endpoint Setup (private backend docs)
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md)
- [Install Troubleshooting](../install/install_troubleshooting.md)
- Operational Troubleshooting (private backend docs)

Likely code:

- `scripts/**`
- `frontend/package.json`
- `frontend/electron-builder.*`
- private backend implementation
- private backend implementation
- operation-specific docs and release notes

Validate the relevant build/test commands before release or packaging steps. Do not change version numbers or publish artifacts without explicit approval.

## Full Implementation Maps

Use these when a change path is not enough and you need exact file ownership:

- Backend Functionality Map (private backend docs)
- Backend Inventory Docs Hub (private backend docs)
- Backend Capability to File Matrix Reference (private backend docs)
- Backend Module File Index Reference (private backend docs)
- [Frontend Functionality Map](../frontend/README.md)
- [Frontend Inventory Docs Hub](../frontend/inventory/README.md)
- [Frontend Capability to File Matrix Reference](../frontend/inventory/frontend_capability_to_file_matrix_reference.md)
- [Frontend Module File Index Reference](../frontend/inventory/frontend_module_file_index_reference.md)
- [Frontend IPC and Local-Runtime Contract Touchpoints Reference](../frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md)

## Docs by Domain

### Getting Started

- [Overview](overview.md)
- [Quick Start](quick_start.md)
- [Installation](installation.md)
- [User Guide](user_guide.md)
- [Troubleshooting](troubleshooting.md)

### Concepts

- [Concepts Hub](../concepts/README.md)
- [Runtime Model](../concepts/runtime_model.md)
- [Sessions and Conversations](../concepts/sessions_and_conversations.md)
- [Agent Loop](../concepts/agent_loop.md)
- [Streaming and Events](../concepts/streaming_and_events.md)
- [Context and Memory](../concepts/context_and_memory.md)
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md)
- [Model Provider Selection](../concepts/model_provider_selection.md)
- [Usage and Token Accounting](../concepts/usage_and_token_accounting.md)
- [Safety Boundaries](../concepts/safety_boundaries.md)

### Channels

- [Channels Hub](../channels/README.md)
- [Channel Routing Matrix](../channels/channel_routing_matrix.md)
- [Voice Audio Change Workflow](../channels/voice_audio_change_workflow.md)
- [Voice and Audio Channels](../channels/voice_and_audio_channels.md)
- [Local Tool Channels](../channels/sidecar_and_tool_channels.md)

### Runtime Nodes

- [Runtime Nodes Hub](../nodes/README.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
- [Desktop and Local Runtime Node](../nodes/desktop_and_sidecar_node.md)
- [Current vs Future Nodes](../nodes/current_vs_future_nodes.md)

### Gateway

- Gateway Hub (private backend docs)
- Gateway Protocol Map (private backend docs)
- Gateway Auth and Health Runbook (private backend docs)
- Gateway Troubleshooting (private backend docs)

### Security

- [Security Hub](../security/README.md)
- Security Boundary Matrix (private backend docs)
- Security Change Playbook (private backend docs)
- [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md)
- Credentials and Tokens Matrix (private backend docs)
- Operations Security (private backend docs)
- Hosted Backend Auth (private backend docs)

### Plugins and Extensions

- [Plugins and Extensions Hub](../plugins/README.md)
- [Extension Surface Matrix](../plugins/extension_surface_matrix.md)
- [Provider Extension Guide](../plugins/provider_extension_guide.md)
- [Current vs Future Plugin Boundary](../plugins/current_vs_future_plugin_boundary.md)
- [Architecture Extension Points](../architecture/extension_points.md)

### Memory

- [Memory Hub](../memory/README.md)
- [Memory Change Workflow](../memory/memory_change_workflow.md)
- [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- [Local Runtime Memory](../memory/sidecar_local_memory.md)
- Backend History and Semantic Routes (private backend docs)
- [Memory Troubleshooting](../memory/memory_troubleshooting.md)

### Automation

- Automation Hub (private backend docs)
- Runs API Runbook (private backend docs)
- Automation Boundaries (private backend docs)

### Desktop Surfaces

- [Desktop Surfaces](../desktop/README.md)
- [Dashboard](../desktop/dashboard.md)
- [Minimal Chat Pill](../desktop/minimal_chat_pill.md)
- [Response Overlay](../desktop/response_overlay.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [Artifact Change Workflow](../desktop/artifact_change_workflow.md)
- [Artifacts and Attachments](../desktop/artifacts_and_attachments.md)

### Debug

- [Debug Hub](../debug/README.md)
- [Logging](../debug/logging.md)
- [Observability Change Workflow](../debug/observability_change_workflow.md)
- [Diagnostic Flags](../debug/diagnostic_flags.md)
- [Runtime Traces](../debug/runtime_traces.md)
- Endpoint and Network Debugging (private backend docs)
- Process Health Checklist (private backend docs)
- [Symptom Playbooks](../debug/symptom_playbooks.md)
- [Test Selection](../debug/test_selection.md)

### Tools

- [Tools Hub](../tools/README.md)
- [Tool Contracts](../tools/tool_contracts.md)
- [Tool Catalog Matrix](../tools/tool_catalog_matrix.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)
- [Tool Troubleshooting](../tools/tool_troubleshooting.md)
- [Computer Tools](../tools/computer.md)
- [Browser Tool](../tools/browser.md)
- [Browser Hub](../browser/README.md)
- [Dedicated Browser Runtime](../browser/dedicated_browser_runtime.md)
- [Browser Action Surface](../browser/browser_action_surface.md)
- [Browser Troubleshooting](../browser/browser_troubleshooting.md)
- [Filesystem and Shell Tools](../tools/filesystem_shell.md)
- [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md)

### Providers

- [Providers Hub](../providers/README.md)
- [Models and LLM Providers](../providers/models.md)
- [Provider Change Workflow](../providers/provider_change_workflow.md)
- [Model Catalog Change Workflow](../providers/model_catalog_change_workflow.md)
- Provider Credentials (private backend docs)
- [Inference Providers](../providers/inference.md)
- [Inference Capability Change Workflow](../providers/inference_capability_change_workflow.md)
- [OpenAI Provider](../providers/openai.md)
- [Anthropic Provider](../providers/anthropic.md)
- [Gemini Provider](../providers/gemini.md)
- [OpenRouter Provider](../providers/openrouter.md)
- [Kimi Coding Provider](../providers/kimi_coding.md)
- [Mistral Provider](../providers/mistral.md)
- [Local Providers](../providers/local.md)

### SDK

- [SDK Hub](../sdk/README.md)
- [Hosted Backend Clients](../sdk/hosted_backend_clients.md)
- [SDK Route Change Workflow](../sdk/sdk_route_change_workflow.md)
- [SDK Auth and Error Handling](../sdk/sdk_auth_and_error_handling.md)
- [Query Planning and Trace](../sdk/query_planning_and_trace.md)
- [OCR and Vision SDK](../sdk/ocr_and_vision.md)
- [Tool Authoring](../sdk/tool_authoring.md)

### Install

- [Install Hub](../install/README.md)
- [Install Decision Matrix](../install/install_decision_matrix.md)
- [Local Development](../install/local_development.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
- Backend Endpoint Setup (private backend docs)
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md)
- [Install Troubleshooting](../install/install_troubleshooting.md)

### Commands

- [Commands and Scripts](../cli/README.md)
- [Command Matrix](../cli/command_matrix.md)
- [Validation Commands](../cli/validation_commands.md)
- [Packaging and Release Commands](../cli/packaging_and_release_commands.md)

### Platforms

- [Platforms Hub](../platforms/README.md)
- [Platform Change Workflow](../platforms/platform_change_workflow.md)
- [Platform Validation Matrix](../platforms/platform_validation_matrix.md)
- [macOS](../platforms/macos.md)
- [Windows](../platforms/windows.md)
- [Linux](../platforms/linux.md)
- [Platform Permission Matrix](../platforms/permission_matrix.md)
- [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md)
- [Window and Input Matrix](../platforms/window_input_matrix.md)
- [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md)

### Help

- [Help Hub](../help/README.md)
- [Diagnostics](../help/diagnostics.md)
- [Troubleshooting](../help/troubleshooting.md)
- [Triage Routes](../help/triage_routes.md)
- Doctor Checklist (private backend docs)
- [Evidence Packet](../help/evidence_packet.md)
- [FAQ](../help/faq.md)

### Web

- [Web Surfaces](../web/README.md)
- [Web Surface Matrix](../web/web_surface_matrix.md)
- Hosted API and Auth (private backend docs)
- [Landing Page](../web/landing_page.md)
- [Landing Page Change Workflow](../web/landing_page_change_workflow.md)
- [Web Client Integration](../web/web_client_integration.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

### Reference

- [Reference Hub](../reference/README.md)
- [API Reference](../reference/api_reference.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [WebSocket Event Reference](../reference/websocket_event_reference.md)
- [Configuration Reference](../reference/configuration_reference.md)
- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)
- OpenClaw Docs Structure Reference (private backend docs)

### Architecture

- [Architecture Hub](../architecture/README.md)
- [System Architecture](../architecture/architecture.md)
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md)
- [Data Flow and State Ownership](../architecture/data_flow_and_state_ownership.md)
- [Change Ownership Decision Tree](../architecture/change_ownership_decision_tree.md)
- [Failure Domain Map](../architecture/failure_domain_map.md)
- Backend Architecture (private backend docs)
- [Frontend Architecture](../architecture/frontend_architecture.md)
- [Local-Runtime Python Implementation](../architecture/python_sidecar.md)
- [Agent System](../architecture/agent_system.md)
- Backend Tool System (private backend docs)
- [Memory System](../architecture/memory_system.md)
- [Extension Points](../architecture/extension_points.md)

### Development

- [Development Hub](../development/README.md)
- [Agent Development Workflow](../development/agent_development_workflow.md)
- [Validation Matrix](../development/validation_matrix.md)
- [Docs Update Workflow](../development/docs_update_workflow.md)
- [Review and Risk Checklist](../development/review_and_risk_checklist.md)
- [Test Failure Triage](../development/test_failure_triage.md)
- [Commit and Changelog Workflow](../development/commit_and_changelog_workflow.md)
- [Developer Guide](../development/developer_guide.md)
- [Environment Setup](../development/environment_setup.md)
- [Testing Guide](../development/testing.md)
- Backend Tool Development (private backend docs)

### Operations

- [Operations Hub](../operations/README.md)
- Configuration (private backend docs)
- Runtime Configuration Matrix (private backend docs)
- Hosted Backend Auth (private backend docs)
- Deployment (private backend docs)
- [Release Guide](../operations/release.md)
- Security (private backend docs)
- Performance (private backend docs)
- Evidence Collection Runbook (private backend docs)
- Incident Triage Runbook (private backend docs)
- [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- Operational Troubleshooting (private backend docs)

### Planning

- [Planning Hub](../planning/README.md)
- [Future Product Plan](../planning/future_plan.md)
- WindieOS VM Multi-Agent Plan (private backend docs)
- [CLI OS Control Plan](../planning/windieos_cli_os_control_plan.md)

### Architecture Decision Records

- [Architecture Decision Records](../adr/README.md)
- [ADR 004: Browser Extension Auto-Attach Boundary](../adr/004-browser-extension-auto-attach.md)
- [ADR 005: Client Tool Manifest Source of Truth](../adr/005-frontend-tool-schema-source-of-truth.md)
- [ADR 006: Renderer-Owned Typing State](../adr/006-renderer-owned-typing-state.md)

## Where to Add New Docs

- Add conceptual docs to `docs/architecture/`.
- Add implementation maps and subsystem references to `docs/backend/` or `docs/frontend/`.
- Add contributor workflow docs to `docs/development/`.
- Add runtime, deployment, release, security, or packaging docs to `docs/operations/`.
- Add stable protocol/API lookup docs to `docs/reference/`.
- Add future plans or staged implementation proposals to `docs/planning/`.

Every new doc should include `summary`, `read_when`, and `title` front matter. Update this hub only for docs that materially help agents route future work.
