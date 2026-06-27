---
summary: "WindieOS documentation entrypoint for product identity, architecture, runtime boundaries, development, operations, tools, and reference docs."
read_when:
  - When browsing the repo entrypoint.
title: "WindieOS Documentation"
---

# WindieOS Documentation

Welcome to the WindieOS documentation. WindieOS is a hackable desktop runtime
for personal AI agents, focused on making the user's live desktop session an
AI workspace. These docs cover product identity, runtime boundaries, local
authority, architecture, development, tools, operations, and reference
contracts.

## 📚 Documentation Index

### Documentation Hubs
- [**Docs Directory**](getting-started/docs_directory.md) - Compact route map to the most-used local docs
- [**Documentation Hub**](getting-started/docs_hub.md) - Agent-facing routing map for choosing the right subsystem, code roots, docs, and validation path before development
- [**Concepts Hub**](concepts/README.md) - Runtime model, sessions, streaming, prompt/tool context, providers, usage, memory, and safety mental models
- [**Desktop Surfaces**](desktop/README.md) - Dashboard, chat pill, response overlay, onboarding, permissions, voice, and artifacts
- [**Debug Hub**](debug/README.md) - Logs, diagnostic flags, endpoint/network checks, process health, runtime traces, symptom playbooks, and test selection
- [**Observability Change Workflow**](debug/observability_change_workflow.md) - Owner routing for logs, trace flags, metrics, diagnostic events, evidence collection, and debug gates
- [**Error and Failure Change Workflow**](debug/error_failure_change_workflow.md) - Owner routing for backend exceptions, websocket/HTTP errors, IPC failures, local-runtime ToolResult failures, renderer error UI, retries, and sanitized logs
- [**Diagnostic Flags**](debug/diagnostic_flags.md) - Backend, Electron, renderer, local-runtime, VM worker, and packaged-app debug flags
- [**Endpoint and Network Debugging**](debug/endpoint_and_network_debugging.md) - Hosted/local backend endpoint resolution, auth, websocket, Cloudflare, and local-runtime URL drift checks
- [**Process Health Checklist**](debug/process_health_checklist.md) - Backend, Electron, renderer, local-runtime, wakeword, VM worker, and Cloudflare process triage
- [**Channels Hub**](channels/README.md) - Desktop, websocket, voice, sidecar, SDK, and VM-run communication paths
- **Gateway Hub** (private backend docs) - Hosted backend ingress, FastAPI route assembly, websocket protocols, auth, health, and troubleshooting
- **WebSocket Connection Change Workflow** (private backend docs) - Owner routing for main `/ws` handshake auth, identity binding, message validation, task limits, timeouts, handler dispatch, transport sends, and cleanup
- **REST Route Auth Matrix** (private backend docs) - Hosted `/api/*` route owners, install-token rules, runs key behavior, failure signals, and tests
- **WebSocket Connection Lifecycle** (private backend docs) - Main `/ws` accept, handshake, auth, message validation, task scheduling, timeout, and cleanup flow
- [**Runtime Nodes Hub**](nodes/README.md) - Runtime process and service boundaries for backend, desktop, sidecar, wakeword, VM worker, and Cloudflare/origin nodes
- **Automation Hub** (private backend docs) - VM run orchestration, worker polling, run-control APIs, and future scheduler boundaries
- **VM Run Control Change Workflow** (private backend docs) - Owner routing for `/api/runs/*`, VM worker heartbeats, event timelines, controls, runs keys, and Electron worker dispatch
- [**Security Hub**](security/README.md) - Hosted auth, IPC isolation, schema validation, credentials, tool execution, and local-runtime boundaries
- **Credential and Token Change Workflow** (private backend docs) - Owner routing for install auth, bearer tokens, runs keys, provider credentials, OAuth state, local-runtime remote-client auth headers, and secret logging
- [**Plugins and Extensions Hub**](plugins/README.md) - Current extension points for tools, providers, SDK routes, local-runtime actions, and future plugin boundaries
- [**Tools Hub**](tools/README.md) - Tool contracts, computer tools, browser automation, filesystem, and shell execution
- [**Tool Schema and Policy Change Workflow**](tools/tool_schema_policy_change_workflow.md) - Owner routing for model-visible tool schemas, policy gates, provider projection, local-runtime executable parity, SDK/main dispatch, and tool-result contracts
- [**Providers Hub**](providers/README.md) - LLM providers, model catalog, credentials, inference providers, STT, and TTS
- [**Inference Capability Change Workflow**](providers/inference_capability_change_workflow.md) - Owner routing for OCR, vision, embeddings, STT, TTS, provider factories, routers, health gates, SDK routes, and local-runtime remote clients
- [**SDK Hub**](sdk/README.md) - Hosted backend clients, query planning, OCR/vision SDK routes, and tool authoring
- [**Install Hub**](install/README.md) - Local development, packaging, endpoint setup, bundled local-runtime Python, reinstall/reset loops, and install troubleshooting
- [**Operations Hub**](operations/README.md) - Runtime configuration, hosted auth, deployment, packaging, release, security, and troubleshooting runbooks
- [**Release and Packaging Change Workflow**](operations/release_packaging_change_workflow.md) - Owner routing for Electron Builder targets, bundled local-runtime Python, local reinstall helpers, smoke checks, and release workflow behavior
- [**Commands and Scripts**](cli/README.md) - Windie CLI command hub for developer, operator, docs, tests, packaging, backend, endpoint, and self-host workflows
- [**Command Matrix**](cli/command_matrix.md) - Full `<windie>` command surface and command groups
- [**Validation Commands**](cli/validation_commands.md) - Focused docs, backend, sidecar, frontend, lint, typecheck, packaging, and config validation commands
- [**Packaging and Release Commands**](cli/packaging_and_release_commands.md) - Bundled local-runtime Python build, Electron package, smoke, reinstall, and release guardrail commands
- [**Platforms Hub**](platforms/README.md) - macOS, Windows, and Linux permission, screenshot/overlay, window/input, packaging, and runtime behavior
- [**Platform Change Workflow**](platforms/platform_change_workflow.md) - Owner routing for OS-specific screenshot, overlay, permission, input, local-runtime Python, and packaging changes
- [**Platform Validation Matrix**](platforms/platform_validation_matrix.md) - Focused test and manual smoke matrix for platform-specific changes
- [**Platform Permission Matrix**](platforms/permission_matrix.md) - Cross-platform permission probes, onboarding visibility, and grant routing
- [**Screenshot and Overlay Policy**](platforms/screenshot_overlay_policy.md) - OS-specific capture, overlay hide/restore, and content-protection policy
- [**Window and Input Matrix**](platforms/window_input_matrix.md) - Window discovery, active-window, input control, and local-runtime Python platform dependencies
- [**Packaging Runtime Matrix**](platforms/packaging_runtime_matrix.md) - Platform package targets, bundled runtime rules, local reinstall helpers, and smoke checks
- [**Help Hub**](help/README.md) - Diagnostics, troubleshooting, triage routes, doctor-style checks, evidence packets, and FAQ routes by runtime boundary
- [**Triage Routes**](help/triage_routes.md) - Symptom-to-owner routing before code edits
- [**Doctor Checklist**](help/doctor_checklist.md) - Manual environment, endpoint, local-runtime Python, permission, packaging, and hosted checks
- [**Evidence Packet**](help/evidence_packet.md) - Debugging report template for cross-boundary failures
- [**FAQ**](help/faq.md) - Short routes for recurring source, packaged, endpoint, provider, tool, browser, and memory issues
- [**Web Surfaces**](web/README.md) - Landing page, hosted backend APIs, auth, SDK routes, client integration, artifacts, and websocket surfaces
- [**Web Surface Matrix**](web/web_surface_matrix.md) - Current web/API surfaces, owners, public contracts, and change routing
- **Hosted API and Auth** (private backend docs) - Hosted REST/websocket auth, CORS, health checks, and failure routing
- [**Landing Page**](web/landing_page.md) - Standalone public landing page entrypoint, section, style, and product-claim boundaries
- [**Landing Page Change Workflow**](web/landing_page_change_workflow.md) - Change workflow for landing entrypoints, section content, anchors, CTA links, styles, tests, and product claims
- [**Web Client Integration**](web/web_client_integration.md) - Hosted TypeScript/Python client and non-Electron integration boundaries
- [**Reference Hub**](reference/README.md) - Stable API, websocket event, configuration, session/transcript, and docs-organization lookup maps
- [**Code Change Surface Index**](reference/code_change_surface_index.md) - Feature-request to source-root, test, docs, and validation routing map
- [**OpenClaw Docs Structure Reference**](reference/openclaw_docs_structure_reference.md) - Structure benchmark and WindieOS mapping
- [**Canonical Docs Navigation**](docs.json) - Machine-readable local docs navigation map validated by `<windie> docs list`
- **Backend Bootstrap/API/Contracts Hubs** (private backend docs) - Subfolder-level backend navigation mirroring OpenClaw-style layered docs
- [**Frontend Main/Renderer/Contracts/Local-Runtime Hubs**](frontend/README.md) - Subfolder-level frontend navigation for process/runtime boundaries
- [**IPC Change Workflow**](frontend/ipc_change_workflow.md) - Safe IPC change flow across shared registry, preload, renderer bridge, main handlers, and local-runtime bridge
- [**Local Runtime Process Lifecycle Workflow**](frontend/main/local_backend/process_lifecycle_change_workflow.md) - Local-runtime Python process startup, readiness, status propagation, request correlation, packaged launch targets, and renderer readiness consumers
- [**Local Runtime JSON-RPC Change Workflow**](frontend/sidecar/local_backend_jsonrpc_change_workflow.md) - Owner routing for SDK/main local-runtime JSON-RPC methods, payload mappers, readiness, timeouts, and response envelopes
- [**Local-Runtime Tool Change Workflow**](frontend/local_runtime_tool_change_workflow.md) - Cross-runtime tool change workflow for backend schema, SDK/main dispatch, Electron bridge, and local-runtime Python implementation
- **Backend Config/LLM/Services Hubs** (private backend docs) - Additional backend sub-hub navigation for config policy, model stack, and runtime services
- **Backend LLM Provider Hub** (private backend docs) - Base provider contract and provider-specific runtime docs for cloud/local integrations

### Getting Started
- [**Product Overview**](getting-started/product_overview.md) - Non-technical summary of current capabilities and future direction
- [**Overview**](getting-started/overview.md) - Project overview, vision, and key capabilities
- [**Quick Start Guide**](getting-started/quick_start.md) - Get up and running quickly
- [**Installation Guide**](getting-started/installation.md) - Detailed installation instructions
- [**Install Decision Matrix**](install/install_decision_matrix.md) - Choose source, packaged, reinstall, endpoint, or release validation paths by change type
- [**Local Development**](install/local_development.md) - Source setup, run commands, tests, and environment launcher usage
- [**Packaged Desktop Builds**](install/packaged_desktop.md) - Electron Builder targets and bundled local-runtime Python packaging
- **Backend Endpoint Setup** (private backend docs) - Hosted, local, packaged-default, and self-host backend endpoint setup
- [**Uninstall, Reinstall, and Reset**](install/uninstall_reinstall_reset.md) - OS-specific packaged app reinstall helpers and reset scope
- [**Install Troubleshooting**](install/install_troubleshooting.md) - Source setup, package build, packaged local-runtime Python, endpoint, permission, and signing failure routes
- [**Packaging and Reinstall Runbooks**](operations/packaging_and_reinstall_runbooks.md) - OS-specific packaged-app reinstall and smoke-check workflows
- [**Release and Packaging Change Workflow**](operations/release_packaging_change_workflow.md) - Source-vs-packaged routing for runtime build, reinstall, smoke, signing, and release workflow changes
- [**Commands and Scripts**](cli/README.md) - Repo scripts and frontend package commands
- [**Command Matrix**](cli/command_matrix.md) - Detailed command lookup for current scripts and package commands

### Concepts, Tools, Providers
- [**Runtime Model**](concepts/runtime_model.md) - Hosted backend, Electron main, renderer, preload, and local-runtime boundaries
- [**Sessions and Conversations**](concepts/sessions_and_conversations.md) - User/session/conversation identity, transcript replay, backend rehydrate, and conversation-scoped routing
- [**Session and Conversation Identity Change Workflow**](memory/session_conversation_identity_change_workflow.md) - Owner routing for user/session/conversation/turn identity, transcript sync, replay, rehydrate, stale-event filtering, and wrong-conversation bugs
- [**Agent Loop**](concepts/agent_loop.md) - Query send, backend streaming, tool turns, and completion lifecycle
- [**Streaming and Events**](concepts/streaming_and_events.md) - Websocket event families, renderer consumers, correlation fields, tool turns, audio side-channel, and stale-turn filtering
- [**WebSocket Event Contract Change Workflow**](channels/websocket_event_contract_change_workflow.md) - Owner routing for backend events, formatter specs, outgoing schemas, Agent SDK projection, typed Electron fan-out, stream handlers, terminal events, and audio side-channels
- [**Context and Memory**](concepts/context_and_memory.md) - Transcript, backend history, semantic memory, artifacts, screenshots, and repo instructions
- [**Prompt and Tool Context**](concepts/prompt_and_tool_context.md) - Prompt inputs, repo instruction forwarding, model-visible tool schemas, provider/capability gates, and transparency events
- [**Model Provider Selection**](concepts/model_provider_selection.md) - Provider runtime selection, catalog metadata, credential gates, local providers, web-search fallback, and failover boundaries
- [**Usage and Token Accounting**](concepts/usage_and_token_accounting.md) - Token-count events, provider diagnostics, estimates, cache metrics, dashboard usage, and billing boundaries
- [**Channels Hub**](channels/README.md) - Entry-channel routing for desktop chat, backend websocket, voice, local-runtime tools, SDK, and VM runs
- [**WebSocket Event Contract Change Workflow**](channels/websocket_event_contract_change_workflow.md) - Change workflow for websocket event names, payloads, formatters, renderer consumers, stream filtering, and terminal/audio event behavior
- [**Channel Routing Matrix**](channels/channel_routing_matrix.md) - Channel-to-transport, owner, code-root, and validation map
- [**Voice Audio Change Workflow**](channels/voice_audio_change_workflow.md) - Owner routing for wakeword, microphone permissions, transcription websocket, STT providers, TTS chunks, and renderer playback
- [**Voice and Audio Channels**](channels/voice_and_audio_channels.md) - Wakeword, voice dictation, transcription websocket, and TTS playback ownership
- [**Local Tool Channels**](channels/sidecar_and_tool_channels.md) - Local tool routing, SDK/main local-runtime execution, local-runtime Python implementation, executable tools, and tool-result return path
- **Gateway Hub** (private backend docs) - FastAPI gateway boundary for hosted HTTP/websocket ingress
- **WebSocket Connection Change Workflow** (private backend docs) - Change workflow for main websocket handshake, install auth, message validation, task scheduling, timeout, and cleanup behavior
- **Gateway Protocol Map** (private backend docs) - App assembly, router registration, websocket, REST, CORS, and protocol families
- **Gateway Auth and Health Runbook** (private backend docs) - Install auth, websocket auth, runs key, and health endpoints
- **REST Route Auth Matrix** (private backend docs) - Hosted REST route ownership, identity source, auth failure routing, and focused route tests
- **WebSocket Connection Lifecycle** (private backend docs) - `/ws` handshake, install auth, message parse, task limit, timeout, and cleanup internals
- **Gateway Troubleshooting** (private backend docs) - Hosted route, websocket, auth, Cloudflare, health, and endpoint-resolution failures
- [**Runtime Nodes Hub**](nodes/README.md) - Process/service ownership map for backend, desktop, sidecar, wakeword, VM worker, and Cloudflare/origin nodes
- [**Runtime Node Matrix**](nodes/runtime_node_matrix.md) - Node-to-code-root, protocol, lifecycle, failure-signal, and validation matrix
- [**Desktop and Local Runtime Node**](nodes/desktop_and_sidecar_node.md) - Electron main, renderer, preload, local-runtime JSON-RPC, local tools, and wakeword ownership
- **VM Worker Node** (private backend docs) - `/api/runs/*` heartbeat, assignment, dispatch, event relay, and stop-control worker behavior
- [**Current vs Future Nodes**](nodes/current_vs_future_nodes.md) - Implemented nodes versus planned mobile, edge, scheduler, and multi-agent VM node work
- [**Memory Hub**](memory/README.md) - Transcript persistence, replay, local-runtime memory, semantic routes, and troubleshooting
- [**Memory Change Workflow**](memory/memory_change_workflow.md) - Route transcript, replay, local-runtime memory, semanticization, backend history, and compaction changes
- [**Session and Conversation Identity Change Workflow**](memory/session_conversation_identity_change_workflow.md) - Change workflow for `user_id`, `session_id`, `conversation_ref`, `turn_ref`, transcript-session sync, resume, rehydrate, and stale-stream routing
- [**Transcript Replay Change Workflow**](memory/transcript_replay_change_workflow.md) - Change workflow for transcript writes, pending queues, dashboard replay/resume, local-runtime transcript storage, backend rehydrate payloads, and tool-row reconstruction
- [**Security Hub**](security/README.md) - Security routing for auth, IPC, validation, credentials, permissions, tools, and local execution
- **Security Boundary Matrix** (private backend docs) - Trust-boundary owner, code-root, failure-signal, and validation matrix
- **Security Change Playbook** (private backend docs) - Focused implementation checklist for security-sensitive changes
- [**Permissions and Local Authority Workflow**](security/permissions_and_local_authority_workflow.md) - Screen/input/microphone/browser/workspace/sudo authority routing
- **Credentials and Tokens Matrix** (private backend docs) - Install tokens, runs keys, provider keys, OAuth state, and local-runtime remote-client auth
- **Credential and Token Change Workflow** (private backend docs) - Change workflow for install auth, REST bearer tokens, websocket auth, runs keys, provider credentials, OAuth state, local-runtime remote-client auth headers, and secret logging
- [**Plugins and Extensions Hub**](plugins/README.md) - Current extension surfaces and plugin-marketplace boundaries
- [**Extension Surface Matrix**](plugins/extension_surface_matrix.md) - Registration points, owner files, docs, and validation targets for extensibility work
- [**Provider Extension Guide**](plugins/provider_extension_guide.md) - LLM/inference provider extension paths, credentials, product rules, and tests
- **Automation Hub** (private backend docs) - VM run orchestration, worker polling, run-control APIs, and scheduling boundaries
- **VM Run Control Change Workflow** (private backend docs) - Change workflow for route models, `VmRunControlService`, assignment, event timelines, pending controls, stop-all, runs API keys, and worker dispatch
- **VM Runs and Workers** (private backend docs) - Run lifecycle from creation through worker dispatch, event relay, and controls
- **Runs API Runbook** (private backend docs) - `/api/runs/*` endpoint behavior, auth, payloads, statuses, and tests
- **Automation Boundaries** (private backend docs) - Current VM runs versus future cron, webhook, durable queue, and scheduler work
- [**Safety Boundaries**](concepts/safety_boundaries.md) - Permissions, schema validation, provider health, and trust boundaries
- [**Dashboard**](desktop/dashboard.md) - Dashboard shell, sidebar, chat history, settings, memory, and model section routing
- [**Minimal Chat Pill**](desktop/minimal_chat_pill.md) - Floating command pill behavior, capture timing, drag, anchor, and Linux flicker contract
- [**Response Overlay**](desktop/response_overlay.md) - Overlay phase state, streamed output, tool ghost preview, and close behavior
- [**Onboarding and Permissions**](desktop/onboarding_permissions.md) - First-run gate, permission manifest, probes, grant effects, and settings control center
- [**Voice and Wakeword**](desktop/voice_and_wakeword.md) - Wakeword bridge, voice capture, STT websocket, TTS chunks, and voice status UI
- [**Artifact Change Workflow**](desktop/artifact_change_workflow.md) - Owner routing for screenshot attachments, artifact upload/fetch, query payloads, tool-result screenshots, replay, and SDK access
- [**Artifacts and Attachments**](desktop/artifacts_and_attachments.md) - Screenshot artifact refs, upload/fetch paths, image rendering, and replay preservation
- [**Logging**](debug/logging.md) - Backend, Electron, renderer, local-runtime, and packaged app log controls
- [**Observability Change Workflow**](debug/observability_change_workflow.md) - Add or change logs, traces, metrics, and evidence without noisy defaults or secret leakage
- [**Diagnostic Flags**](debug/diagnostic_flags.md) - Backend, Electron, renderer, local-runtime, VM worker, and packaged-app debug flags
- [**Runtime Traces**](debug/runtime_traces.md) - Stream, chat pill, screenshot, local-runtime, and websocket trace routes
- [**Endpoint and Network Debugging**](debug/endpoint_and_network_debugging.md) - Hosted/local backend endpoint resolution, auth, websocket, Cloudflare, and local-runtime URL drift checks
- [**Process Health Checklist**](debug/process_health_checklist.md) - Backend, Electron, renderer, local-runtime, wakeword, VM worker, and Cloudflare process triage
- [**Symptom Playbooks**](debug/symptom_playbooks.md) - Failure-to-owner maps for backend, tools, screenshots, overlays, permissions, voice, and browser
- [**Test Selection**](debug/test_selection.md) - Focused pytest/Jest commands by runtime and contract boundary
- [**Tool Contracts**](tools/tool_contracts.md) - Backend model-facing schema vs local-runtime executable tool contract
- [**Tool Schema and Policy Change Workflow**](tools/tool_schema_policy_change_workflow.md) - Change workflow for model-facing schemas, policy gates, provider projection, local-runtime executable parity, SDK/main dispatch, and result-contract validation
- [**Tool Catalog Matrix**](tools/tool_catalog_matrix.md) - Model-visible tools mapped to backend schema owners, local-runtime executors, policy gates, and tests
- [**Tool Execution Lifecycle**](tools/tool_execution_lifecycle.md) - End-to-end tool-call path through backend, SDK/main local-runtime dispatch, local-runtime Python implementation, result ingress, and history
- [**Tool Policy Profiles and Capabilities**](tools/tool_policy_profiles_and_capabilities.md) - Tool profiles, available/disabled tools, coordinate methods, browser capability policy, and web-search exposure
- [**Tool Troubleshooting**](tools/tool_troubleshooting.md) - Symptom-to-owner routing for visibility, schema, dispatch, local execution, result, artifact, and replay failures
- [**Computer Tools**](tools/computer.md) - Mouse, keyboard, screenshot, scroll, window, OCR, and vision grounding paths
- [**Browser Tool**](tools/browser.md) - Dedicated browser runtime, schema parity, snapshots, and debugging
- [**Browser Hub**](browser/README.md) - Dedicated browser launch, action surface, session UI, files, and troubleshooting
- [**Browser Change Workflow**](browser/browser_change_workflow.md) - Owner routing for browser schemas, shared contract, local-runtime execution, local-runtime Python adapters, CDP launch, Electron bridge, renderer controls, files, and tests
- [**Filesystem and Shell Tools**](tools/filesystem_shell.md) - Read/replace, shell, process sessions, app launch, and output formatting
- [**Filesystem and Shell Change Workflow**](tools/filesystem_shell_change_workflow.md) - Owner routing for file/shell tools across backend schema, SDK/main dispatch, Electron bridge argument shaping, local execution, sudo policy, sessions, results, and tests
- [**Models and LLM Providers**](providers/models.md) - Provider factory, model catalog, reasoning variants, and capability flags
- [**Provider Change Workflow**](providers/provider_change_workflow.md) - Add/change provider runtime, factory, config, credentials, renderer settings, and tests
- [**Model Catalog Change Workflow**](providers/model_catalog_change_workflow.md) - Add/change model entries, capability flags, routing metadata, picker behavior, and validation
- **Provider Credentials** (private backend docs) - Environment variables, renderer overrides, OAuth entries, and install auth
- [**Inference Providers**](providers/inference.md) - OCR, vision, embeddings, STT, TTS, health, and capability gating
- [**OpenAI Provider**](providers/openai.md) - Responses routing, native reasoning/search, Codex OAuth, and tool compatibility
- [**Gemini Provider**](providers/gemini.md) - Native thinking/search, streamed tool-call aggregation, and source extraction
- [**Local Providers**](providers/local.md) - Ollama and LM Studio base URLs, model discovery, and placeholder-key behavior
- [**HTTP and WebSocket API Surface**](reference/http_api_surface.md) - Route-level map for hosted APIs, SDK routes, artifacts, memory, transcription, and runs
- [**Reference Hub**](reference/README.md) - Stable contract lookup for APIs, events, config, session/transcript identifiers, and docs organization
- [**Code Change Surface Index**](reference/code_change_surface_index.md) - Concrete code-change routing by feature, runtime owner, source root, test path, and docs path
- [**WebSocket Event Reference**](reference/websocket_event_reference.md) - Canonical backend event families, renderer consumers, correlation fields, and validation docs
- [**Configuration Reference**](reference/configuration_reference.md) - Runtime config owners, high-touch env vars, credential rules, and add-a-config checklist
- [**Session and Transcript Reference**](reference/session_and_transcript_reference.md) - User/session/conversation, turn, tool, transcript, replay, and VM run identifier map
- [**Hosted Backend Clients**](sdk/hosted_backend_clients.md) - TypeScript and Python SDK client boundaries for backend APIs
- [**SDK Route Change Workflow**](sdk/sdk_route_change_workflow.md) - Change `/api/sdk/*` routes, models, service helpers, hosted clients, artifacts, OCR, vision, and tests
- [**SDK Auth and Error Handling**](sdk/sdk_auth_and_error_handling.md) - Hosted SDK auth headers, endpoints, status routing, websocket close handling, and client error rules
- [**Query Planning and Trace**](sdk/query_planning_and_trace.md) - Prompt/query planning, trace collection, and debug introspection
- [**OCR and Vision SDK**](sdk/ocr_and_vision.md) - SDK perception routes for OCR, vision locate/describe, overlays, and artifact image sources
- [**Tool Authoring**](sdk/tool_authoring.md) - Backend SDK tool template, ToolContext, permissions, schema, and registration expectations
- [**Operations Hub**](operations/README.md) - Runtime configuration, hosted auth, deployment, packaging, release, security, performance, and operational troubleshooting
- **Configuration Change Workflow** (private backend docs) - Owner routing for backend config, Electron endpoints, renderer settings, local-runtime env, credentials, VM vars, and packaging config
- **Runtime Configuration Matrix** (private backend docs) - Config ownership, env vars, defaults, propagation paths, and validation targets
- **Hosted Backend Auth** (private backend docs) - Install registration, bearer-token REST auth, websocket identity, and hosted-auth debugging
- **Evidence Collection Runbook** (private backend docs) - Operations evidence packet for hosted, tunnel, Electron, renderer, sidecar, packaged, VM, provider, and permission failures
- **Incident Triage Runbook** (private backend docs) - Severity, owner, mitigation, validation, and closure flow for operational incidents
- **Operational Troubleshooting** (private backend docs) - Symptom-to-owner routing for hosted, tunnel, packaged-app, sidecar, and VM worker failures

### Architecture & Design
- [**Architecture Hub**](architecture/README.md) - Runtime boundaries, ownership decision tree, state flow, failure domains, and subsystem architecture routes
- [**Runtime Boundary Matrix**](architecture/runtime_boundary_matrix.md) - Architecture-level ownership map for backend, Electron main, renderer, preload, local runtime, wakeword, VM worker, and gateway services
- [**Agent-Visible Data Pipeline**](architecture/agent_visible_data_pipeline.md) - Trace what the model sees, what transports carry, what local execution runs, and what transcript/history preserve
- [**Data Flow and State Ownership**](architecture/data_flow_and_state_ownership.md) - Query, stream, tool-result, settings, transcript, memory, artifact, permission, provider, and VM-run state ownership
- [**Storage and Persistence Change Workflow**](architecture/storage_persistence_change_workflow.md) - Owner routing for renderer storage, Electron user-data files, local-runtime SQLite/FAISS, backend artifacts, install-auth SQLite, caches, and restart durability
- [**Change Ownership Decision Tree**](architecture/change_ownership_decision_tree.md) - Choose the owning subsystem before implementing cross-runtime changes
- [**Failure Domain Map**](architecture/failure_domain_map.md) - Route broad failures to producer, transport, consumer, platform, provider, packaging, or operations owners
- [**Frontend Functionality Map**](frontend/README.md) - Detailed module-level renderer, electron-main, and local-runtime Python maps
- [**Renderer State Change Workflow**](frontend/renderer/renderer_state_change_workflow.md) - Owner routing for chat state, dashboard panels, settings, transcript projection, stream presentation, tool results, and provider contexts
- [**Frontend App Startup + Onboarding Workflow**](frontend/renderer/app_startup_onboarding_change_workflow.md) - Change workflow for renderer root selection, VM mode, permission onboarding, wakeword placement, and startup surface handoff
- [**Main Process Change Workflow**](frontend/main/main_process_change_workflow.md) - Owner routing for Electron startup, IPC, windows, overlays, endpoints, permissions, local-runtime bridge, wakeword, and VM worker behavior
- [**Local Runtime Process Lifecycle Workflow**](frontend/main/local_backend/process_lifecycle_change_workflow.md) - Change workflow for SDK local-runtime process launch, readiness, status propagation, JSON-RPC request correlation, and packaged runtime failures
- [**Local-Runtime Python Implementation Change Workflow**](frontend/sidecar/local_runtime_python_change_workflow.md) - Owner routing for Python JSON-RPC, local tools, memory, browser automation, system state, platform adapters, backend config, and wakeword service behavior behind the local-runtime boundary
- [**Local Runtime JSON-RPC Change Workflow**](frontend/sidecar/local_backend_jsonrpc_change_workflow.md) - Change workflow for Python JSON-RPC method registration, Electron mapper payloads, readiness, request transport, and JSON-RPC protocol errors
- [**Frontend Inventory Docs Hub**](frontend/inventory/README.md) - Subfolder inventory hub for exhaustive frontend runtime coverage, matrix views, and file ownership indexes
- [**Frontend Inventory Domains Hub**](frontend/inventory/domains/README.md) - Domain ownership matrix + change-path playbooks for main/preload/renderer/local-runtime Python/landing scope decisions
- [**Frontend Inventory Protocols Hub**](frontend/inventory/protocols/README.md) - IPC + local-runtime JSON-RPC matrix for renderer/main/local-runtime protocol boundaries and ownership
- [**Frontend Full Functionality Inventory Reference**](frontend/inventory/frontend_full_functionality_inventory_reference.md) - Exhaustive frontend feature inventory across main/preload/renderer/local-runtime Python/landing ownership boundaries and runtime flows
- [**Frontend Functionality Capability Catalog Reference**](frontend/inventory/frontend_functionality_capability_catalog_reference.md) - Capability-first frontend map linking concrete runtime behaviors to ownership files across main/preload/renderer/local-runtime Python/landing
- [**Frontend Capability to File Matrix Reference**](frontend/inventory/frontend_capability_to_file_matrix_reference.md) - Detailed frontend capability matrix with concrete ownership files across main/preload/renderer/local-runtime Python/landing modules
- [**Frontend IPC + Local-Runtime Contract Touchpoints**](frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md) - Renderer/main/local-runtime boundary map for IPC, local-runtime JSON-RPC methods, and backend stream/tool payload integration points
- [**Frontend Landing Runtime + Content Reference**](frontend/landing/landing_page_runtime_and_content_reference.md) - Standalone landing entrypoint wiring, section/anchor contracts, static content sources, and CSS token/animation behavior
- [**Frontend Landing Section Content Contracts**](frontend/landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md) - Hero/How/Available/Roadmap source arrays, CTA anchor semantics, and status-label behavior for public capability messaging
- **Backend Functionality Map** (private backend docs) - Detailed module-level backend runtime and API maps
- **API Route Change Workflow** (private backend docs) - Owner routing for backend HTTP routes, websocket messages, handlers, formatters, auth gates, route models, and package exports
- **Backend Service Change Workflow** (private backend docs) - Owner routing for artifacts, OCR, vision, embeddings, semantic memory, TTS/wakeword audio, token counting, and VM run-control services
- **Prompt Context Change Workflow** (private backend docs) - Owner routing for system prompt text, repo instructions, memory and attachment context, model-visible tool schemas, transparency events, and generated prompt/schema artifacts
- **Backend Config and Container Change Workflow** (private backend docs) - Owner routing for `AppConfig`, runtime normalization, client settings patches, DI rebinding, provider refresh, and session config propagation
- **Backend Inventory Docs Hub** (private backend docs) - Subfolder inventory hub for exhaustive backend runtime coverage, flow matrices, and file ownership indexes
- **Backend Inventory Domains Hub** (private backend docs) - Domain ownership matrix + change-path playbooks for API/agent/core/tools/llm/services scope decisions
- **Backend Inventory Protocols Hub** (private backend docs) - WebSocket handshake/incoming/outgoing/formatter matrix for backend protocol ownership and drift detection
- **Backend Full Functionality Inventory Reference** (private backend docs) - Exhaustive backend feature inventory by runtime domain, module ownership, and end-to-end query/tool path
- **Backend Functionality Capability Catalog Reference** (private backend docs) - Capability-first backend map linking runtime behaviors to ownership files across API/session/loop/tool/LLM/service domains
- **Backend Capability to File Matrix Reference** (private backend docs) - Detailed backend capability matrix with concrete ownership files for API/agent/tool/LLM/core/service responsibilities
- **Backend Cross-Layer Contract Touchpoints** (private backend docs) - Backend-owned contract map for websocket schemas, formatter outputs, tool-result envelopes, and sidecar/browser parity seams
- **Backend Source Maps Hub** (private backend docs) - Sub-hub for source-owned folder topology maps and package `__init__` export surfaces
- **Backend Simulation Runtime Reference** (private backend docs) - Simulation entrypoints, DI LLM-factory override lifecycle, native tool-call fixture behavior, and deterministic mock-sequence invariants
- **Backend Simulation Entrypoint Launch Contracts** (private backend docs) - `python -m` package runner vs main-module uvicorn bootstrap behavior (reload/access-log differences)
- **Backend SDK Tool Context + Schema Contract** (private backend docs) - SDK `Tool` base contract, schema normalization/caching behavior, ToolContext shape, and ContextFactory injection semantics
- **Backend SDK Sub-Agent Helper Runtime** (private backend docs) - Restricted tool-registry behavior, child-session creation helpers, model override semantics, and response extraction fallback rules
- **Backend Event Bus + Cache Infrastructure** (private backend docs) - Core event dispatch internals (weakref handlers, MRO cache, error recovery) and cache semantics (TTL/LRU/negative caching/stampede guards)
- **Backend Core Logging Profile Contracts** (private backend docs) - Logging profile/env resolution, noisy-module suppression policy, and important-profile signal retention
- **Backend Trust-Boundary Metrics + Enforcement** (private backend docs) - Per-boundary violation metrics model, DI lifecycle wiring, exception metadata conventions, and parser/prompt trust-boundary observability flow
- **Backend Input Validation + Client Settings Patch Guard** (private backend docs) - Shared query/user-id/message validation helpers, client settings patch allowlist, and API error-sanitization boundary semantics
- **Backend Container DI Lifecycle** (private backend docs) - Container composition, startup phase sequencing, lazy runtime binders, and config-update propagation
- **Backend Shared Entrypoint Logger + Uvicorn Runner** (private backend docs) - Shared startup logging bootstrap and uvicorn launch kwargs contract for production and simulation
- **Backend Config and Container Change Workflow** (private backend docs) - Change workflow for backend config fields, env-var resolution, DI provider rebinding, model service refresh, and stale session debugging
- **Backend Config Runtime Policy** (private backend docs) - Exact config fields, runtime normalization, and client settings patch boundaries
- **Backend API/Core Topology Source Map Runtime** (private backend docs) - Source-owned API/core folder maps and layer/data-flow parity expectations
- **Backend Package `__init__` Export Surface Runtime** (private backend docs) - Contract map for backend package-level re-export and marker surfaces
- [**Frontend Stream State Machine**](frontend/runtime/stream_event_state_machine.md) - Event-to-phase transitions and per-turn stream tracking behavior
- [**Frontend Chat Stream + Tool Display Runtime**](frontend/renderer/chat_stream_and_tool_execution_reference.md) - Provider ownership, query-send flow, backend event routing, stale-turn cancellation, and SDK-projected tool display semantics
- [**Frontend Renderer Chat Hub**](frontend/renderer/chat/README.md) - Sub-hub for chat send-path policy, screenshot attachment flow, and store/session rotation contracts
- [**Chat Attachment Change Workflow**](frontend/renderer/chat/chat_attachment_change_workflow.md) - Change workflow for pasted images, selected files, typed SDK turn resources, host resource resolution, query payload assembly, backend query resolution, and replay
- [**Frontend Dashboard Change Workflow**](frontend/renderer/dashboard/dashboard_change_workflow.md) - Change workflow for dashboard shell routing, sidebar conversations, search, memory, models, settings, usage, chat resume, and transcript handoff
- [**Frontend Message Send Surface Policy + Screenshot Capture**](frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md) - Main-window vs overlay send behavior, SDK user-row ordering, and SDK screenshot resource resolution semantics
- [**Frontend Chat Store State + New Session Rotation**](frontend/renderer/chat/chat_store_state_and_new_session_rotation_reference.md) - Zustand no-op guards, stream-tracking reset behavior, and new-chat/resume conversation-ref synchronization
- [**Frontend Overlay Phase + Surface Workflow**](frontend/runtime/overlay_phase_and_surface_change_workflow.md) - Change workflow for chat pill, response overlay, phase IPC, click-through/focusable state, content protection, screenshot hide/restore, and platform capture policy
- [**Frontend Renderer Settings Hub**](frontend/renderer/settings/README.md) - Sub-hub for settings-section toggle/display-selection contracts and config update boundaries
- [**Settings Surface Change Workflow**](frontend/renderer/settings/settings_surface_change_workflow.md) - Change workflow for dashboard settings tabs, config patches, permissions, workspace/browser controls, memory resets, Electron IPC, backend sync, and tests
- [**Frontend Model Settings Workflow**](frontend/renderer/settings/model_settings_change_workflow.md) - Change workflow for dashboard model cards, chat selectors, model/provider config, list-models sync, provider API keys, and backend catalog routing
- [**Settings Section Tabs and Wakeword Toggle Runtime Reference**](frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md) - Wakeword/audio/screenshot toggle payload semantics, display fallback/persistence behavior, and provider update coupling
- [**Frontend Renderer Overlay Hub**](frontend/renderer/overlays/README.md) - Chatbox input-pill and response overlay renderer internals
- [**Frontend Renderer Provider Hub**](frontend/renderer/providers/README.md) - Root app composition, view routing, and provider coordination internals
- [**Frontend Renderer Error Boundary Contract**](frontend/renderer/providers/components/error_boundary_fallback_and_component_tree_crash_isolation_contract_reference.md) - Root-surface crash containment fallback UI and console logging semantics
- [**Frontend Renderer Transcript Hub**](frontend/renderer/transcript/README.md) - desktop transcript projection runtime queues, session identity persistence rules, and session-event contracts
- [**Transcript Replay Change Workflow**](memory/transcript_replay_change_workflow.md) - Cross-runtime owner map for visible transcript persistence, local-runtime transcript storage, dashboard replay, backend rehydrate, and validation
- [**Frontend Transcript Type Contracts**](frontend/renderer/transcript/contracts/transcript_entry_type_contract_reference.md) - Shared transcript session identity and transparency field contracts
- [**Frontend Entrypoint View Routing + Provider Stack**](frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md) - `view`-based root selection and per-surface `ChatProvider` capability flags
- [**Frontend App Provider Coordinator + Save-Status Runtime**](frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md) - `AppConfig/AppStatus` bridge callback, shift-tab interaction-mode toggle, and config persistence guardrails
- [**Frontend Chatbox Overlay Input + Drag Runtime**](frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md) - Overlay click-through toggles, drag IPC flow, focus contract, and size-report behavior
- [**Frontend Response Overlay Runtime**](frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md) - SDK current-turn presentation, pending-turn preflight handoff, hidden SDK startup handoff, closeability, and fixed-frame size IPC
- [**Frontend Renderer Infrastructure Hub**](frontend/renderer/infrastructure/README.md) - Focused runtime docs for renderer infrastructure, artifact URL normalization, removed service routing, and display-only tool projections
- [**Frontend Renderer Infrastructure Audio Hub**](frontend/renderer/infrastructure/audio/README.md) - PlayerService queue lifecycle, stale-callback generation guards, and stop/cleanup boundaries
- [**Frontend Renderer Styles Hub**](frontend/renderer/styles/README.md) - Sub-hub for global theme tokens, accessibility utility classes, layout shell styles, and chat/voice visual contracts
- [**Frontend Capture + Artifact URL Normalization**](frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md) - Screenshot/system-state capture paths, artifact URL policy, and `tool-result` payload field filtering/internals
- [**Frontend PlayerService Queue + Error-Recovery Runtime**](frontend/renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md) - PCM decode pipeline, sequential playback contract, playback-generation stale-callback isolation, and error-tolerant stop/cleanup behavior
- [**Frontend Global Theme + Main Layout Style Runtime**](frontend/renderer/styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md) - Root CSS token model, reduced-motion/global scrollbar/reset behavior, accessibility utility semantics, and shell/sidebar responsive layout contracts
- [**Frontend Chat/Thinking/Token Style Runtime**](frontend/renderer/styles/chat_interface_thinking_stream_and_token_count_style_contract_reference.md) - Chat tool/transparency card styling, thinking overflow gradient state behavior, and token badge variant contracts
- [**Frontend Voice Status Style Runtime**](frontend/renderer/styles/voice_status_visual_state_style_contract_reference.md) - Voice status base/error/active banner style-state coupling and runtime visibility expectations
- [**Frontend Transcript Session + Rehydrate Runtime**](frontend/renderer/transcript_session_and_rehydrate_reference.md) - Session identity persistence, queued transcript storage contract, SDK/main local-runtime transcript RPC mapping, and episodic-memory resume-to-chat rehydrate flow
- [**Frontend Renderer Transcript Docs Hub**](frontend/renderer/transcript/README.md) - SDK-backed transcript display projection, session identity, and test-backed session-state invariants
- [**Frontend Dashboard Memory Management + Resume Runtime**](frontend/renderer/dashboard_memory_management_and_resume_reference.md) - Dashboard section routing, episodic/semantic memory list-delete flows, context-menu hotkeys, and resumable conversation handoff back into chat
- [**Frontend Runtime Paths and Endpoints**](frontend/main/runtime_paths_and_endpoints.md) - Backend ws/http endpoint derivation, packaged Python path lookup, and desktop UI config persistence path
- [**Frontend Query Send + Stream Relay Workflow**](frontend/main/query_send_and_stream_relay_change_workflow.md) - Change workflow for renderer compose, SDK runtime transport, query payload enrichment, optimistic local events, overlay phase, transcript sync, and stream ingress
- [**Frontend Workspace Context Workflow**](frontend/runtime/workspace_context_change_workflow.md) - Change workflow for active workspace selection, conversation workspace binding, workspace_path forwarding, AGENTS.md repo instructions, and backend prompt context
- [**Frontend Query Payload Relay**](frontend/main/query_payload_and_relay_reference.md) - Main-process query enrichment pipeline, initial settings ACK gate, local-user-message synthesis, and backend relay failure semantics
- [**Frontend WS Handshake + Settings Sync**](frontend/main/websocket_handshake_and_settings_sync_reference.md) - Main-process websocket handshake lifecycle, renderer fan-out context tracking, settings ACK gate internals, and query send-failure synthesis
- [**Frontend Main Local Runtime Hub**](frontend/main/local_backend/README.md) - Electron-main local-runtime sub-hub for process lifecycle, JSON-RPC mapping, and screenshot guard boundaries
- [**Frontend Local Runtime Bridge Overview + Window Guard Index**](frontend/main/local_runtime_bridge_handler_and_window_guard_reference.md) - Overview page linking local-runtime lifecycle/mapping deep dives and overlay guard references
- [**Frontend Local Runtime Process Lifecycle + Request Correlation**](frontend/main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md) - Local-runtime Python startup env/path resolution, readiness retry token guards, timeout/pending map semantics, and reset/shutdown behavior
- [**Frontend Local Runtime RPC Handler Registry + Mapper Runtime**](frontend/main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md) - Direct and compiled handler registration contracts, payload mapping modes, and test-backed channel/method invariants
- [**Frontend Main Overlay Focus Hub**](frontend/main/overlays/README.md) - Query-capture blur/settle and Linux screenshot hide-restore deep dives
- [**Frontend Overlay Query-Capture Blur + Settle**](frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md) - Shared cross-platform pre-capture blur/settle semantics for overlay sends
- [**Frontend Linux Screenshot Hide/Restore Guard**](frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md) - Linux-only window hide/wait/restore behavior for clean screenshot tool execution
- [**Frontend Preload Channel Allowlist + Renderer Bridge**](frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md) - `window.ipc` exposure policy, channel allowlist enforcement semantics, and preload/renderer/main ownership alignment
- [**Renderer Config Sync Lifecycle**](frontend/runtime/config_sync_and_settings_lifecycle_reference.md) - AppConfig/AppStatus provider ownership, local+disk persistence layering, and main-process `update-settings` ACK gating
- [**Frontend Settings Sync Change Workflow**](frontend/runtime/settings_sync_change_workflow.md) - Change workflow for renderer settings persistence, Electron ACK gating, backend patch validation, and model/provider UI sync
- [**Frontend Audio Chunk Playback Runtime**](frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md) - Backend `audio-chunk` relay path, renderer playback queue/decoding behavior, and stop/new-query audio reset semantics
- [**Frontend IPC Channel Reference**](frontend/contracts/ipc_channel_and_handler_reference.md) - Exact send/invoke/on channel ownership and handler map
- [**Frontend Runtime Event Guard Reference**](frontend/contracts/schema_generation_and_event_guard_reference.md) - Live runtime contracts across preload allowlists, `backendEvents.ts` type guards, and main-process payload normalization after removal of the unused generated frontend schema
- [**Frontend Memory IPC + RPC Mapping Runtime**](frontend/contracts/memory_ipc_and_rpc_mapping_reference.md) - Exact renderer `invoke` memory payload keys, main-process mapper conversions, local-runtime JSON-RPC method contracts, and transcript/semantic memory operation semantics
- [**Frontend Backend Event Consumer Matrix**](frontend/contracts/backend_event_consumer_matrix_reference.md) - Which renderer modules consume SDK conversation events, projection snapshots, typed control events, audio chunks, and drift hotspots after generic `from-backend` removal
- [**Frontend Contracts Events Hub**](frontend/contracts/events/README.md) - Sub-hub for typed backend event fan-out, SDK conversation event guards, audio side-channel parsing, and synthetic query lifecycle event contracts
- [**Frontend Contracts IPC Hub**](frontend/contracts/ipc/README.md) - Sub-hub for preload/channel parity and main-process IPC ownership by module
- [**Frontend Preload Allowlist + Channel Parity**](frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md) - Exact channel-family parity across preload allowlists, typed renderer constants, and runtime invalid-channel behavior
- [**Frontend Main IPC Handler Ownership + RPC Mapper**](frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md) - Channel-to-owner map across `ipc.cjs/index.cjs/local_runtime_bridge.cjs/wakeword_bridge.cjs`, including mapped JSON-RPC param transforms
- [**Frontend From-Backend Ingress + Audio Side-Channel**](frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md) - Typed backend-event fan-out, SDK conversation-event guard limits, and `audio-chunk` parser boundary behavior after generic `from-backend` removal
- [**Frontend Local User Message + Query Send-Failure Synthesis**](frontend/contracts/events/local_user_message_and_query_send_failure_synthesis_reference.md) - Main-process `local-user-message` optimistic event contract and transport-failure `error` synthesis semantics
- [**Frontend Settings + Models ACK Event Routing**](frontend/contracts/events/settings_and_model_ack_event_routing_reference.md) - Provider-level handling for non-typed `models-listed`/`settings-updated` events and settings-failure status/error suppression coupling
- [**Frontend Overlay + Wakeword Control Channels**](frontend/contracts/overlay_and_wakeword_control_channel_reference.md) - Main/renderer contracts for `wakeword-toggle`, `response-overlay-phase`, `response-overlay-visibility`, and `chatbox-focus` behavior
- [**Frontend Renderer Voice Docs Hub**](frontend/renderer/voice/README.md) - Sub-hub for transcription gateway lifecycle, wakeword IPC capture policy, and shared audio cleanup invariants
- [**Frontend Renderer Voice Utils Docs Hub**](frontend/renderer/voice/utils/README.md) - Sub-hub for low-level voice utility contracts: PCM conversion/framing, capture cleanup primitives, and transcription-region edit reconciliation
- [**Renderer Voice Capture + Wakeword Controller**](frontend/renderer/voice_capture_and_wakeword_controller_reference.md) - Renderer voice transcription and wakeword lifecycle: config gates, mic capture/encoding paths, IPC event flow, and retrigger guardrails
- [**Frontend Voice Mode Gateway + Transcription Region Runtime**](frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md) - Gateway socket/message framing, reconnect backoff, silence auto-submit, and transcription-region replacement behavior
- [**Frontend Audio Encoding + Chunk Normalization + Capture Cleanup**](frontend/renderer/voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md) - Float32->PCM16 conversion, gateway frame prefix cache contract, supported chunk-size normalization rules, and safe audio-node/context teardown behavior
- [**Frontend Transcription Region State Machine + Edit Reconciliation**](frontend/renderer/voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md) - Single-region append/replace model, input-change/paste offset logic, and utterance-end submission/reset coupling
- [**Frontend Wakeword IPC Capture + Cooldown Runtime**](frontend/renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md) - Readiness-gated wakeword capture, generation-guarded start/stop flow, threshold/cooldown filtering, and retrigger-prevention disable sequence
- [**Architecture Hub**](architecture/README.md) - Runtime boundaries, ownership decision tree, state flow, and failure-domain maps
- [**System Architecture**](architecture/architecture.md) - High-level system design and components
- [**Runtime Boundary Matrix**](architecture/runtime_boundary_matrix.md) - Runtime ownership across backend, Electron main, renderer, preload, local runtime, wakeword, VM worker, and gateway services
- [**Data Flow and State Ownership**](architecture/data_flow_and_state_ownership.md) - State owners and duplication risks for core runtime flows
- [**Change Ownership Decision Tree**](architecture/change_ownership_decision_tree.md) - Subsystem routing before code changes
- [**Failure Domain Map**](architecture/failure_domain_map.md) - Architecture-level failure routing
- **Backend Architecture** (private backend docs) - Backend system design and patterns
- [**Frontend Architecture**](architecture/frontend_architecture.md) - Frontend system design and patterns
- [**Communication Flow**](architecture/communication_flow.md) - How frontend and backend communicate

### Core Systems
- [**Agent System**](architecture/agent_system.md) - Agent orchestrator and execution flow
- [**Tool System**](architecture/tool_system.md) - Tool execution architecture and development
- **Backend Tools Docs Hub** (private backend docs) - Backend schema bridge, policy filtering, and wait/ingress runtime docs for SDK/main local-runtime tools
- **Backend Tools Registry Docs Hub** (private backend docs) - Sub-hub for remote tool registration, canonical schema caching, and backend/local-runtime tool-name parity contracts
- **Backend Browser Tools Docs Hub** (private backend docs) - Sub-hub for browser remote schema surface and OpenClaw compatibility-field boundaries
- **Backend Browser Schema Docs Hub** (private backend docs) - Sub-hub for BrowserControlArgs schema layering, compatibility-field mixins, and backend/local-runtime validation boundary mapping
- **Backend Tools Policy Docs Hub** (private backend docs) - Sub-hub for interaction allowlist + dev tool-selection filtering and mouse method startup gating semantics
- **Backend Remote Tools Docs Hub** (private backend docs) - Sub-hub for domain-specific remote stub payload and request-id behavior before SDK/main local-runtime execution
- **Backend Tools Execution Docs Hub** (private backend docs) - Sub-hub for send-path dispatch rules, bundle detection branching, and single/bundle wait orchestration semantics
- **Backend Tools Preparation Docs Hub** (private backend docs) - Sub-hub for active screenshot/OCR state lifecycle and resolved-call storage contracts used across preparation and execution
- **Backend Tools Waiting Docs Hub** (private backend docs) - Sub-hub for SDK/local-runtime tool-result receive/route internals and centralized pending/future storage cleanup semantics
- **Backend Tools Processing Docs Hub** (private backend docs) - Sub-hub for result-transform formatting rules, synthetic failure result generation, and history-commit cleanup sequencing
- **Backend Tools Contracts Docs Hub** (private backend docs) - Sub-hub for tool taxonomy enums, shared schema field factories, and typed tool-result helper/model contracts
- **Backend Tools Templates Docs Hub** (private backend docs) - Sub-hub for SDK tool scaffold files and manifest/capability conventions for new tool authors
- **Backend Tools Security Docs Hub** (private backend docs) - Core security policy primitives, audit sanitization controls, and removed executor-registry references
- **Backend Tool Security Policy** (private backend docs) - Active vs planned tool-security boundary: ToolPolicy filtering, fail-closed permission checks, audit-log hardening, and removed executor-registry behavior
- **Backend Policy Permissions + Audit Sanitization + Removed Executor Registry** (private backend docs) - `core/security` fail-closed permission rules, path/resource checks, bounded audit-log sanitization semantics, and removed runtime executor swap behavior
- **Backend Tool Result Ingress Reference** (private backend docs) - End-to-end `tool-result`/`tool-bundle-result` flow across API handler, session routing, storage, and futures
- **Backend Tool Sender Dispatch + Synthetic Error Runtime** (private backend docs) - Preparation-result branching, synthetic failure event ordering, and model-facing metadata contracts for SDK/main local-runtime dispatch
- **Backend Tool Result Orchestrator Bundle + Wait Runtime** (private backend docs) - Atomic bundle detection rules, session-required execution routing, per-tool/bundle futures, and stale-screen safety guard behavior
- **Backend Tool Result Receiver + Router Shared Route-Mode** (private backend docs) - Single-vs-bundle shared routing path, bundle success normalization, screenshot-ref decode flow, and session system-state refresh behavior
- **Backend Tool Result Storage Future Lifecycle + Cleanup** (private backend docs) - Pending/future map ownership, sync/async future creation, TTL cleanup semantics, and request-id targeted cleanup guarantees
- **Backend Screenshot Manager + OCR Task Lifecycle** (private backend docs) - Current-screenshot model, proactive OCR task replacement/cleanup, completion-event behavior, and outdated-result suppression rules
- **Backend Resolved Tool-Call Storage + Session Access Contract** (private backend docs) - Request-id map semantics, session encapsulation APIs, cleanup lifecycle, and stale-screen guard coupling at execution time
- **Backend Tool Result Processor Bundle Formatting + Cleanup** (private backend docs) - Atomic-bundle commit branch, bundle narrative generation, individual-result fallback path, and guaranteed request-id/resolved-call cleanup behavior
- **Backend Result Transformer + Tool Result Formatting Contract** (private backend docs) - Pure transformation invariant, screenshot extraction precedence, and `ToolResult.format_for_history` fallback semantics
- **Backend Synthetic Result Factory + Coordinate-Resolution Failure Output** (private backend docs) - Backend-generated synthetic `ToolResult` shape, failure event ordering, and immediate pending-result storage semantics
- **Backend Remote Tool Registry + Schema Cache Runtime** (private backend docs) - `ToolRegistry`/`SchemaRegistry` internals: remote class registration, canonical schema rules, capability fallback extraction, and parity tests against local-runtime exposed tools
- **Backend Browser Remote Schema Surface** (private backend docs) - `BrowserControlArgs` unified action schema, action-specific validator models, canonical fields, and `RemoteBrowserTool` payload emission semantics
- **Backend Browser Control Unified Schema** (private backend docs) - Action literal surface, strict action models, grouped validation, and canonical schema projection contracts
- **Backend-Local Runtime Browser Schema Parity + Validation Boundary** (private backend docs) - Cross-layer action/field parity checks and debugging flow for backend parse-success vs local-runtime rejection cases
- **Backend Tool Policy + Agent Capability Runtime** (private backend docs) - `ToolPolicy` + `ToolSelection` precedence rules, mouse schema pruning, parser method validation, and OCR/vision startup gating behavior
- **Backend Remote Tool Domain Payload + Request-ID Runtime** (private backend docs) - Domain stub matrix (computer/system/filesystem/browser), request-id sourcing/override behavior, and payload model_dump differences
- **Backend Query Lifecycle Change Workflow** (private backend docs) - Owner routing for query ingress, active-task cancellation, stream completion, TTS, agent loop, and frontend event consumers
- **Backend Tool Turn Change Workflow** (private backend docs) - Owner routing for model-visible tool schemas, tool-call parsing, preparation, dispatch, waiting, history, and SDK/main local execution contracts
- **Backend Query Execution Pipeline** (private backend docs) - Query handler to stream pipeline internals, completion backfill rules, and cancellation/task-tracking behavior
- **Backend API Handlers Hub** (private backend docs) - Sub-hub for typed websocket handler contracts and query/non-query execution ownership boundaries
- **Backend API Services Hub** (private backend docs) - Sub-hub for query/rehydrate/wakeword service-layer orchestration and shared API TTS-session lifecycle boundaries
- **Backend API Processing Hub** (private backend docs) - Formatter dispatch, stream pipeline ordering, completion fallback resolution, and TTS concurrency docs
- **Backend Formatter Dispatch + Schema Alignment** (private backend docs) - Canonical formatter registry wiring, per-event required-field behavior, and outgoing schema drift guards
- **Backend Stream Pipeline + Completion + TTS Concurrency** (private backend docs) - Per-event send/format/TTS ordering, completion-text precedence/backfill, and pending-audio race barriers
- **Backend Query Execution Runtime-State + Completion Resolver** (private backend docs) - Query-time system-state merge rules, screenshot artifact fallback, event extraction compatibility, and deterministic completion-text fallback semantics
- **Backend API Processing TTS Hub** (private backend docs) - API-layer TTS manager/session lifecycle and suppression-state docs
- **Backend API Processing Formatters Hub** (private backend docs) - Base formatter utility contracts and formatter-specific validation/test matrices
- **Backend Base Formatter Guard Utilities + Skip Semantics** (private backend docs) - Shared event dict conversion, required-field logging guards, and per-formatter skip-vs-raise behavior
- **Backend Formatter Validation + Contract-Test Matrix** (private backend docs) - Formatter behavior coverage tied to schema parsing and registry drift tests
- **Backend Streaming Events Contracts Hub** (private backend docs) - Sub-hub for stream event dataclass semantics and event-type alignment across formatters/schemas
- **Backend Routing Contracts Hub** (private backend docs) - Sub-hub for incoming message route-table parity and handler-binding invariants
- **Backend Message Types Contracts Hub** (private backend docs) - Sub-hub for canonical message-type constants and schema-subset/ACK-control boundaries
- **Backend Incoming Route Table + Handler-Binding Reference** (private backend docs) - Canonical route-table/schema-literal validation rules and DI handler-key binding guarantees
- **Backend Streaming Event -> Formatter + Outgoing Alignment** (private backend docs) - Canonical matrix from `StreamingEventType` literals to formatter dispatch and outgoing websocket schema types
- **Backend Message-Type Constants + Schema-Subset Reference** (private backend docs) - Exact incoming/outgoing constants, schema-validated outgoing subset, and settings/model ACK-type semantics
- **Backend TTS Manager Audio Stream + Cleanup** (private backend docs) - Speech gate, audio-chunk relay loop, disconnect behavior, and bounded teardown/cancellation semantics
- **Backend TTS Processor Suppression State Machine** (private backend docs) - Chunk classification states, code/json suppression exits, and mid-chunk marker handling behavior
- **Backend Session Runtime + Config Rewire** (private backend docs) - SessionManager lock/task semantics, AgentSession runtime containers, conversation-thread switching, and full LLM/prompt dependency rebind behavior on settings updates
- **Backend Interaction Loop + Tool-Turn Orchestration** (private backend docs) - Executor component composition, loop iteration policy, tool send/wait/process sequencing, empty-final-response fallback rules, and cleanup invariants
- **Backend Agent LLM Docs Hub** (private backend docs) - Sub-hub for iteration-aware prompt context caching, prompt-transparency presentation contracts, and stream/token diagnostics runtime behavior
- **Backend Conversation Context + Prompt-Metadata Presenter** (private backend docs) - First-turn prompt build/cache semantics, `system-prompt`/`user-message-full`/`tool-schemas` event ordering, and tool-schema validation boundary
- **Backend LLM Stream Processor Token + Cache Diagnostics** (private backend docs) - Stream-vs-non-stream tool-turn routing, normalized payload capture, prompt/provider cache diagnostics, and provider-vs-estimated token accounting rules
- **Backend Agent History Docs Hub** (private backend docs) - Sub-hub for result-transform/commit boundaries and tool-call-id staging semantics in conversation history writes
- **Backend History Committer + Result-Processor Boundary** (private backend docs) - Pure-transform vs state-mutation split, atomic bundle commit path, and finally-block request-id cleanup guarantees
- **Backend Tool-Call-ID Staging + Tool-Output History Rows** (private backend docs) - Dual-row tool-output storage strategy, staged id consumption modes, and token-cache update semantics
- **Backend Tool-Call Error Recovery + Synthetic Tool-Output Replay** (private backend docs) - Recoverable malformed tool-call stream error classification, synthetic `ToolCallEvent`/`ToolOutputEvent` ordering, history replay injection, and skip-local-execution metadata contract
- **Backend Conversation History + Prompt Context Runtime** (private backend docs) - Iteration-1 prompt metadata generation, cached later-turn history retrieval, tool-call/tool-output linkage, rehydrate normalization, and token-cache semantics
- **Backend Token Count Event + Usage Diagnostics** (private backend docs) - Token-count event lifecycle from LLM stream processor through websocket formatter, provider usage-precedence rules, and fallback/cache semantics
- **Backend Token Service Message Normalization + Fallback** (private backend docs) - LiteLLM token-counter message canonicalization rules, assistant tool-call normalization, text-only fallback estimate semantics, and singleton/thread-safety contract
- **Backend Non-Query Handler Flows** (private backend docs) - Settings/model handlers, stop-query cancellation semantics, wakeword activation responses, and transcript rehydrate normalization path
- **Backend Query Handler + Query Execution Service Runtime** (private backend docs) - Active task registration, screenshot/runtime-state ingestion, stream completion backfill ordering, and TTS session lifecycle
- **Backend Non-Query Handler Dispatch + Payload Normalization** (private backend docs) - Stop-query completion guarantee, tool-result normalization/routing, settings boundary enforcement, and rehydrate/wakeword service sequencing
- **Backend Query Execution Service Stream Context + Completion Fallback** (private backend docs) - Shared stream-context reuse, screenshot/runtime-state ingestion, completion-text precedence, and synthetic fallback/backfill emission rules
- **Backend Rehydrate and Wakeword Services + TTSSession** (private backend docs) - Transcript rehydrate normalization/linkage validation and wakeword greeting+audio service lifecycle contracts
- **Backend WebSocket Connection + Task Lifecycle** (private backend docs) - `/ws` handshake contract, receive-loop task scheduling/limits, SafeWebSocket serialization, stop-query cancellation tracking, and disconnect cleanup guarantees
- **Backend App Assembly + Container Dependency** (private backend docs) - FastAPI creation/route registration order, default CORS, lifespan container set-clear sequence, and HTTP/WS dependency failure contracts
- **Backend Memory Route Validation + Fallback** (private backend docs) - Exact `/api/embeddings` and `/api/semantic` request constraints, session/global config resolution, parser/fallback logic, and sanitized health/error semantics
- **Backend Handler Registry + Error Envelope Runtime** (private backend docs) - Canonical incoming route-table validation, fail-closed middleware/typed handler dispatch, and sanitized websocket error envelope guarantees
- **Backend Safe WebSocket + Transport Envelope Runtime** (private backend docs) - `SafeWebSocket` bounded sender-loop/backpressure semantics, protocol-wrapped send path, and canonical outbound context-field attachment behavior
- **Backend Provider Factory Runtime** (private backend docs) - Provider-factory cache keys, provider availability gates, client normalization, and model-service catalog/discovery rules
- **Backend LLM Base Request + Stream Normalization** (private backend docs) - `LLMProvider` request validation, message/tool schema normalization, stream delta parsing, and usage/cache diagnostics extraction
- **Backend LLM Provider-Specific Overrides** (private backend docs) - Anthropic/Gemini thinking flags, Kimi stream tool-call assembly, local provider model listing, and provider alias/URL normalization
- **Backend LLM Prompt Constructor + Transparency Metadata** (private backend docs) - Prompt build tuple contract, tool-policy schema filtering, XML context extraction, and first-turn metadata event emission
- **Backend LLM Prompt Manager Lifecycle** (private backend docs) - Startup prompt loading/failure semantics, prompt-history wiring, and sub-agent custom system-prompt override behavior
- **Backend Parser Trust Boundary + Native Tool-Call Path** (private backend docs) - Current live native tool-call ingestion path, parser trust-boundary modules, extraction/validation limits, and violation telemetry semantics
- **Backend Artifact + Screenshot Flow** (private backend docs) - Artifact upload/load rules and screenshot/system-state propagation across query, tool-result, OCR refresh, and rehydrate flows
- **Backend Embedding + Semantic Memory Runtime** (private backend docs) - Embedder DI/startup lifecycle, `/api/embeddings` and `/api/semantic` contracts, parser fallback semantics, and sidecar consumption path impacts
- **Backend TTS + Wakeword Audio Runtime** (private backend docs) - Query-time speech pipeline and wakeword greeting flow: runtime config gates, TTS filtering/queueing internals, chunk streaming, and cleanup semantics
- **Backend Services Screen-Grounding Hub** (private backend docs) - Sub-hub for OCR state machine and vision provider/runtime details used by coordinate preparation
- **Backend OCR + Vision Coordinate Runtime Overview** (private backend docs) - Overview index linking focused OCR-state and vision-provider deep references
- **Backend OCR Service + Screenshot State Machine Runtime** (private backend docs) - Startup OCR policy gate, screenshot-ID/task race guards, proactive/on-demand OCR coordination, and CUDA->CPU OCR fallback semantics
- **Backend OCR Helper Utility Contracts** (private backend docs) - CUDA error classification, strict screenshot payload decode rules, and OCR field normalization behavior used by OCR service internals
- **Backend Vision Provider Runtime + Coordinate Scaling** (private backend docs) - Vision provider selection/load fallback, inference serialization/runtime retries, and coordinate parse/scale contracts
- **Backend Tool Preparation + Coordinate Resolution** (private backend docs) - Pre-dispatch tool resolution internals: execution refs, OCR/prediction coordinate flow, normalization metadata contract, synthetic failure paths, and stale-screen execution guard
- **Backend Tools Processing Hub** (private backend docs) - Sub-hub for history-facing post-execution processing (transform, synthetic error creation, and bundle-aware commit behavior)
- [**Browser Control**](browser/browser_control.md) - Browser automation architecture and tool behavior
- [**Browser Change Workflow**](browser/browser_change_workflow.md) - Browser action/schema/CDP/session/file change workflow across backend, local-runtime execution, local-runtime Python adapters, Electron, renderer, and tests
- [**Local-Runtime Browser Automation Stack**](frontend/sidecar/browser_automation_stack.md) - Renderer->main->local-runtime browser execution and CDP orchestration details backed by local-runtime Python adapters
- [**Local-Runtime Browser Action Runtime**](frontend/sidecar/browser_action_runtime_reference.md) - Browser Use CLI adapter action surface, payload rules, and timeout/error-code behavior
- [**Local-Runtime Browser Docs Hub**](frontend/sidecar/browser/README.md) - Sub-hub for Browser Use CLI adapter and result normalization contracts
- [**Local-Runtime Browser Contracts Docs Hub**](frontend/sidecar/browser/contracts/README.md) - Sub-hub for local-runtime browser action schemas and validation boundary semantics
- [**Local-Runtime Browser Chrome Docs Hub**](frontend/sidecar/browser/chrome/README.md) - Sub-hub for executable detection and dedicated CDP launch/connect policy
- [**Local-Runtime Source Maps Docs Hub**](frontend/sidecar/source_maps/README.md) - Sub-hub for local-runtime Python implementation folder topology maps and package entrypoint export surfaces
- [**Local-Runtime Browser Grouped Schema + Action Validation Boundary**](frontend/sidecar/browser/contracts/schema_registry_and_action_validation_boundary_reference.md) - `BrowserControlArgs` grouped validation, strict per-action validators, and schema-vs-runtime enforcement split
- [**Local-Runtime Chrome Detection + Launcher + CDP Session**](frontend/sidecar/browser/chrome/chrome_detection_launcher_and_cdp_session_reference.md) - Cross-platform browser executable detection, dedicated-profile launch args, CDP endpoint checks, and ensure-connect state-machine behavior
- [**Local-Runtime Python Folder Topology + Package Export Surface Runtime**](frontend/sidecar/source_maps/python_sidecar_folder_topology_and_package_init_export_surface_reference.md) - local-runtime Python implementation service/tool topology flow and `__init__` compatibility/import-surface contracts
- [**Local-Runtime System-State Collection + Platform Adapter Runtime**](frontend/sidecar/system_state/system_state_collection_and_platform_adapter_reference.md) - `get-system-state` field semantics, per-OS probes, fallback defaults, and renderer/main/local-runtime integration contracts
- [**Local-Runtime Tool Registry Docs Hub**](frontend/sidecar/tools/registry/README.md) - Sub-hub for exposed-tool parity, lazy import registration behavior, and result normalization boundaries backed by the local-runtime Python implementation
- [**Local-Runtime Computer Tools Docs Hub**](frontend/sidecar/tools/computer/README.md) - Sub-hub for computer-use action contracts and OS-aware scroll/screenshot behavior
- [**Local-Runtime System Tools Docs Hub**](frontend/sidecar/tools/system/README.md) - Sub-hub for wait/window/stats tool semantics and platform window manager behavior
- [**Local-Runtime Shell + Process Session Runtime**](frontend/sidecar/tools/shell_and_process_session_runtime_reference.md) - `run_shell_command`/`process` execution modes, output token truncation policy, PTY fallback behavior, background session registry TTL/caps, and action-level management semantics
- [**Local-Runtime Filesystem Read + Replace Runtime**](frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md) - `read_file` pagination/truncation contracts, binary/encoding guards, and `replace` strict-vs-lenient/patch-chunk atomic edit semantics
- [**Filesystem and Shell Change Workflow**](tools/filesystem_shell_change_workflow.md) - Cross-runtime change path for `read_file`, `replace`, `run_shell_command`, `process`, sudo prompt behavior, working directories, process sessions, result envelopes, and focused validation
- [**Local-Runtime Registry and Result Contract**](frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md) - Exact `ToolRegistry.execute_tool` dispatch path, native `ToolResult` enforcement, and exposed-tool parity drift guards
- [**Local-Runtime Mouse, Keyboard, Scroll, and Screenshot Runtime**](frontend/sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md) - Computer tool action requirements, hotkey safety blocks, scroll unit normalization, and screenshot JPEG/base64 payload semantics
- [**Local-Runtime Wait, Window, and Stats Runtime**](frontend/sidecar/tools/system/wait_window_stats_runtime_reference.md) - Non-blocking wait behavior, platform window targeting rules, and shared psutil metrics collector contracts
- [**Local-Runtime JSON-RPC Reference**](frontend/sidecar/local_backend_jsonrpc_reference.md) - Main-process bridge method map and local-runtime JSON-RPC contract details
- [**Local-Runtime Process Lifecycle**](frontend/sidecar/local_backend_process_lifecycle_reference.md) - Local-runtime Python spawn env/readiness probe loop, request correlation/timeouts, and restart/failure recovery behavior
- [**Local-Runtime Core Docs Hub**](frontend/sidecar/core/README.md) - Sub-hub for low-level local-runtime Python core modules: JSON-RPC dispatcher, stdout framing, backend URL resolution, remote semantic client, and thread-pool lifecycle
- [**Local-Runtime Services Docs Hub**](frontend/sidecar/services/README.md) - Sub-hub for standalone local-runtime Python entrypoint services: wakeword binary framing/model bootstrap behavior
- [**Local-Runtime JSON-RPC Protocol + Stdout Framing**](frontend/sidecar/core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md) - JSON-RPC validation/dispatch and notification suppression semantics plus stdout JSON-line contract
- [**Local-Runtime Backend Config Runtime**](frontend/sidecar/core/backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md) - Backend endpoint env precedence, URL normalization, and default endpoint behavior
- [**Local-Runtime Remote Semantic Client Runtime**](frontend/sidecar/core/remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md) - Remote semantic client payload, timeout, and error-surface contracts
- [**Local-Runtime Wakeword Service Model + Binary Framing Runtime**](frontend/sidecar/services/wakeword_service_model_bootstrap_and_binary_framing_reference.md) - openWakeWord model bootstrap/fallback sequence, length-prefixed audio/result frame contracts, detection threshold semantics, and reset-frame behavior
- [**Local Runtime Memory Storage Docs Hub**](frontend/sidecar/memory/storage/README.md) - Sub-hub for local-runtime storage internals backed by local-runtime Python modules: dual-db routing/search, chat-event storage, FAISS artifact cleanup, and schema/index/watermark persistence contracts
- [**Local-Runtime Summarizer Watermark + Conversation Batch Runtime**](frontend/sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md) - Semantic summarizer run-loop gating, pending watermark counters, user/conversation batch selection, low-signal filtering, and dedupe/hash semantics
- [**Local Runtime Memory Store Embedding + Search Routing Runtime**](frontend/sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md) - OS-aware memory path setup, episodic/semantic routing, vector mapping sync/rebuild, and cross-index search filtering semantics
- [**Local Runtime SQLite Schema Migration + FAISS/Watermark Persistence Runtime**](frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md) - Episodic/semantic schema migration/index contracts, safe FAISS load/save behavior, and thread-pool-backed watermark JSON state guarantees
- [**Wakeword Bridge + Audio Framing**](frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md) - Wakeword subprocess lifecycle, length-prefixed audio transport, enable/disable buffering policy, and detection event propagation
- [**Browser Control Runbook**](browser/browser_control_run.md) - Practical setup/testing flow for browser control
- [**Memory System**](architecture/memory_system.md) - Memory management and retrieval
- [**Local-Runtime Python Implementation**](architecture/python_sidecar.md) - Local tool execution and memory service behind the SDK local-runtime boundary
- [**LLM Integration**](architecture/llm_integration.md) - LLM providers and configuration

### Development Guides
- [**Development Hub**](development/README.md) - Agent-facing contributor workflow, validation, environment, and change routing hub
- [**Agent Development Workflow**](development/agent_development_workflow.md) - Step-by-step workflow for docs-first implementation, scoped edits, validation, and commits
- [**Validation Matrix**](development/validation_matrix.md) - Current backend, renderer, sidecar, docs, and package validation commands by change type
- [**Docs Update Workflow**](development/docs_update_workflow.md) - Docs-list, front matter, hub wiring, changelog, link, and whitespace workflow
- [**Review and Risk Checklist**](development/review_and_risk_checklist.md) - Ownership, contracts, security, validation, and residual-risk review questions
- [**Test Failure Triage**](development/test_failure_triage.md) - Route failed backend, sidecar, frontend, docs, packaging, and contract checks
- [**Commit and Changelog Workflow**](development/commit_and_changelog_workflow.md) - Commit scope, Conventional Commit subjects, changelog entries, and validation reporting
- [**Validation Commands**](cli/validation_commands.md) - Command-focused validation guide for docs, backend, sidecar, frontend, IPC, provider, packaging, and config changes
- [**Developer Guide**](development/developer_guide.md) - Comprehensive development guide
- Developer Guide includes current Windie CLI automation (`<windie> docs list`, `<windie> test all`, `<windie> test backend`, `<windie> test local-runtime`) and frontend audit commands (`npm run lint:audit`, `npm run audit:jscpd`, `npm run audit:knip`).
- [**Tool Development Guide**](development/tool_development.md) - Creating custom tools
- [**API Reference**](reference/api_reference.md) - Complete API documentation
- [**Extension Points**](architecture/extension_points.md) - How to extend the system
- [**Architecture Decision Records**](adr/README.md) - Durable technical decisions, ADR status, and when to create/update decision records
- [**ADR 004: Browser Extension Auto-Attach Boundary**](adr/004-browser-extension-auto-attach.md) - Current dedicated browser runtime versus future extension auto-attach behavior
- [**ADR 005: Client Tool Manifest Source of Truth**](adr/005-frontend-tool-schema-source-of-truth.md) - Accepted executable-tool manifest direction while preserving backend policy ownership
- [**ADR 006: Renderer-Owned Typing State**](adr/006-renderer-owned-typing-state.md) - Accepted target architecture for one renderer-owned desktop turn lifecycle projection across dashboard, pill, overlay, typing, and busy state
- [**Packaging and Release Commands**](cli/packaging_and_release_commands.md) - Packaging, smoke, reinstall, and release guardrail command reference

### Configuration & Deployment
- **Configuration Guide** (private backend docs) - Configuration options and settings
- **Deployment Guide** (private backend docs) - Production deployment instructions
- [**Release Guide**](operations/release.md) - Repeatable release checklist and guardrails
- [**Planning Hub**](planning/README.md) - Active roadmap and future initiative plans
- [**Future Product Plan (Draft)**](planning/future_plan.md) - Sequenced roadmap for packaging, hosted rollout, and major future features
- [**Environment Setup**](development/environment_setup.md) - Development environment configuration
- [**Plan Matrix (Draft)**](planning/plan_matrix.md) - Subscription tiers and limits

### User Guides
- [**User Guide**](getting-started/user_guide.md) - End-user documentation
- [**Troubleshooting**](getting-started/troubleshooting.md) - Common issues and solutions

### Additional Resources
- [**Testing Guide**](development/testing.md) - Testing strategies and practices
- **Security Guide** (private backend docs) - Security considerations and best practices
- **Multi-User Runtime Hardening** (private backend docs) - Session identity, multi-device policy, and per-user model isolation guidance
- **Performance Guide** (private backend docs) - Performance optimization strategies
- [**Planning Hub**](planning/README.md) - Single entrypoint for active future initiative plans
- [**Contributing Guide**](development/contributing.md) - How to contribute to the project

### Hosted Platform (Planned)
- [**Planning Hub**](planning/README.md) - Canonical list of hosted roadmap and initiative docs

## 🎯 Quick Navigation

### For Developers
Start with:
1. [Developer Guide](development/developer_guide.md) - Understand the codebase structure
2. [Architecture Overview](architecture/architecture.md) - Learn the system design
3. [Tool Development Guide](development/tool_development.md) - Create custom tools

### For System Administrators
Start with:
1. [Installation Guide](getting-started/installation.md) - Set up the system
2. Configuration Guide (private backend docs) - Configure the application
3. Deployment Guide (private backend docs) - Deploy to production

### For Users
Start with:
1. [User Guide](getting-started/user_guide.md) - Learn how to use the assistant
2. [Troubleshooting](getting-started/troubleshooting.md) - Solve common issues

## 📖 Documentation Structure

All documentation is organized in the `docs/` folder at the project root. Each document is self-contained but cross-references related topics.

### Document Conventions

- **Code blocks**: Include file paths and line numbers when referencing existing code
- **Diagrams**: ASCII art diagrams for architecture visualization
- **Examples**: Practical code examples for all major features
- **Warnings**: Important notes and gotchas highlighted

## 🔄 Keeping Documentation Updated

This documentation is maintained alongside the codebase. When making changes:

1. Update relevant documentation files
2. Add examples for new features
3. Update architecture diagrams if structure changes
4. Keep cross-references accurate

## 📝 Contributing to Documentation

See [Contributing Guide](development/contributing.md) for guidelines on improving documentation.

---

**Last Updated**: February 2026
**Version**: 1.0.0

## Recent Updates

### Frontend Refactor (January 2026)
- **Feature-Based Architecture**: Reorganized into feature modules (chat, settings, voice)
- **Split Contexts**: AppConfigContext and AppStatusContext for better performance
- **Zustand Store**: Chat state managed via Zustand for efficient updates
- **Infrastructure Layer**: service layer for message formatting, IPC, artifact upload, and renderer display projections
- **New Hooks**: useChatStream and useChatMessageSender

### Backend Optimizations (January 2026)
- **Centralized Tool Result Storage**: ToolResultStorage class with TTL-based cleanup
- **Conversation History Optimization**: O(1) LLM format access via cached conversion
- **Shallow Copy Optimization**: PreparedToolCall uses shallow copy for better performance

### Productization Roadmap (February 2026)
- **Multi-Tenant Backend**: Auth, subscriptions, usage metering, and plan enforcement
- **Billing UX**: Plan selection, billing portal, and usage limits in the UI
- **Hosted Architecture**: API gateway, session routing, and scalable data plane
