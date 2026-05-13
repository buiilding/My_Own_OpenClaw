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

WindieOS has three hard runtime boundaries:

- The hosted FastAPI backend owns the agent loop, model-facing tool schema, LLM providers, streaming contracts, OCR/vision, TTS/STT, embeddings, artifacts, and SDK routes.
- The Electron frontend owns desktop windows, renderer UI, preload IPC, local config, websocket relay, and the Python sidecar process lifecycle.
- The Python sidecar owns local tool execution, browser automation, filesystem/shell/computer actions, local memory storage, system state, and wakeword subprocesses.

Frontend and sidecar code must not import backend code for parity. Keep parity in explicit contracts, generated schemas, and tests.

## Agent Workflow

1. Run the docs index first: `./bin/docs-list` from the repo root.
2. Pick the closest change path below before searching broadly.
3. Read the domain hub, the capability-to-file matrix, and the focused reference for the behavior you are changing.
4. Edit the owner subsystem first. Do not patch a consumer layer to hide malformed producer behavior.
5. Update tests and docs in the same pass when behavior, API, IPC, schema, or runtime contracts change.

## Start Here

- [Product Overview](product_overview.md) for the non-technical product shape.
- [Quick Start](quick_start.md) for the local run path.
- [Platform Setup: Backend + Frontend](platform_setup_backend_frontend.md) for environment setup.
- [Concepts Hub](../concepts/README.md) for product/system mental models before implementation details.
- [Sessions and Conversations](../concepts/sessions_and_conversations.md) for user/session/conversation identity, transcript replay, backend rehydrate, and wrong-thread debugging.
- [Streaming and Events](../concepts/streaming_and_events.md) for websocket event families, renderer consumers, token-counts, tool events, and audio side-channels.
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md) for prompt inputs, repo instructions, tool-schema visibility, and transparency events.
- [Model Provider Selection](../concepts/model_provider_selection.md) for provider runtime selection, model catalogs, credential gates, and failover boundaries.
- [Usage and Token Accounting](../concepts/usage_and_token_accounting.md) for token-count events, provider usage diagnostics, cache metrics, and billing boundaries.
- [Gateway Hub](../gateway/README.md) for hosted backend ingress, app assembly, websocket protocols, auth, health, and route troubleshooting.
- [Runtime Nodes Hub](../nodes/README.md) for process/service ownership across hosted backend, desktop, sidecar, wakeword, VM worker, and Cloudflare/origin nodes.
- [Channels Hub](../channels/README.md) for desktop, websocket, voice, sidecar, SDK, and VM-run communication paths.
- [Memory Hub](../memory/README.md) for transcript, replay, sidecar memory, backend history, and semantic route ownership.
- [Security Hub](../security/README.md) for hosted auth, IPC isolation, validation, credentials, permissions, tools, and sidecar security boundaries.
- [Plugins and Extensions Hub](../plugins/README.md) for current extension points and future plugin-system boundaries.
- [Automation Hub](../automation/README.md) for VM run orchestration, worker polling, run-control APIs, and scheduler boundaries.
- [Desktop Surfaces](../desktop/README.md) for dashboard, chat pill, response overlay, onboarding, permissions, voice, and artifacts.
- [Debug Hub](../debug/README.md) for logs, diagnostic flags, endpoint/network checks, process health, trace flags, symptom playbooks, and test selection.
- [Diagnostic Flags](../debug/diagnostic_flags.md) for enabling the narrowest backend, Electron, renderer, sidecar, VM worker, or packaged-app debug signal.
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md) for hosted/local backend URL resolution, Cloudflare, auth, websocket, and sidecar endpoint drift.
- [Process Health Checklist](../debug/process_health_checklist.md) for proving which process is dead, stuck, disconnected, or healthy before editing code.
- [Tools Hub](../tools/README.md) for model-facing and sidecar-executable tools.
- [Providers Hub](../providers/README.md) for LLM, inference, credential, STT, TTS, and web-search providers.
- [SDK Hub](../sdk/README.md) for hosted backend clients, query planning, OCR/vision, and tool authoring.
- [Install Hub](../install/README.md) for local development, packaged desktop builds, endpoint setup, reinstall/reset loops, and install troubleshooting.
- [Install Decision Matrix](../install/install_decision_matrix.md) for choosing the correct source, packaged, endpoint, reinstall, or release-validation path.
- [Backend Endpoint Setup](../install/local_backend_and_endpoint_setup.md) for hosted, local, packaged-default, and self-host backend routing.
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md) for OS-specific local packaged reinstall helpers and reset scope.
- [Install Troubleshooting](../install/install_troubleshooting.md) for install failures across dependencies, sidecar runtime, endpoint routing, permissions, and signing.
- [Operations Hub](../operations/README.md) for runtime config, hosted auth, packaging, release, deployment, and operational troubleshooting.
- [Commands and Scripts](../cli/README.md) for current repo/script entrypoints and planned CLI boundaries.
- [Command Matrix](../cli/command_matrix.md) for repo-root scripts, frontend package scripts, docs tooling, commit helper, and Cloudflare helpers.
- [Validation Commands](../cli/validation_commands.md) for choosing focused checks by changed boundary.
- [Packaging and Release Commands](../cli/packaging_and_release_commands.md) for sidecar runtime builds, Electron package commands, smoke helpers, and reinstall loops.
- [Platforms Hub](../platforms/README.md) for macOS, Windows, and Linux permission, screenshot/overlay, window/input, packaging, and runtime behavior.
- [Platform Permission Matrix](../platforms/permission_matrix.md) for platform-specific permission probes, onboarding visibility, and grant routing.
- [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md) for capture-time hide/restore and content-protection rules.
- [Window and Input Matrix](../platforms/window_input_matrix.md) for active-window, window-switching, and local input-control ownership.
- [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) for target OS package commands, bundled runtime rules, and smoke checks.
- [Help Hub](../help/README.md) for diagnostics, troubleshooting, triage routes, doctor-style checks, evidence packets, and FAQ routes.
- [Triage Routes](../help/triage_routes.md) for mapping user-visible symptoms to the first likely runtime owner.
- [Doctor Checklist](../help/doctor_checklist.md) for collecting environment, endpoint, sidecar, permission, packaging, and hosted evidence.
- [Evidence Packet](../help/evidence_packet.md) for handoff-ready bug reports across backend/frontend/sidecar boundaries.
- [FAQ](../help/faq.md) for recurring source, packaged, endpoint, provider, tool, browser, permission, and memory questions.
- [Web Surfaces](../web/README.md) for landing, hosted API/auth, SDK/client, artifact, websocket, and dashboard-adjacent web boundaries.
- [Web Surface Matrix](../web/web_surface_matrix.md) for mapping web/API changes to owners and public contracts.
- [Hosted API and Auth](../web/hosted_api_and_auth.md) for hosted REST/websocket auth, CORS, health checks, and failure routing.
- [Web Client Integration](../web/web_client_integration.md) for TypeScript/Python hosted client and non-Electron integration boundaries.
- [Reference Hub](../reference/README.md) for stable API, websocket event, configuration, and session/transcript lookup maps.
- [Code Change Surface Index](../reference/code_change_surface_index.md) for routing concrete feature requests to source roots, tests, docs, and validation commands.
- [Architecture Hub](../architecture/README.md) for runtime boundaries, ownership decision trees, state flow, and failure-domain maps.
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md) for choosing the owning process/trust boundary.
- [Data Flow and State Ownership](../architecture/data_flow_and_state_ownership.md) for query, stream, tool-result, settings, transcript, memory, artifact, permission, provider, and VM-run ownership.
- [Change Ownership Decision Tree](../architecture/change_ownership_decision_tree.md) for routing ambiguous implementation requests.
- [Failure Domain Map](../architecture/failure_domain_map.md) for cross-runtime failure triage.
- [System Architecture](../architecture/architecture.md) for the high-level runtime model.
- [Communication Flow](../architecture/communication_flow.md) for cross-process event flow.
- [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md) for the docs organization benchmark.

## Runtime Boundary Map

| Area | Owns | Code roots | Start docs |
| --- | --- | --- | --- |
| Backend API + transport | HTTP routes, websocket handshake, incoming message dispatch, outgoing event envelopes, formatter contracts | `backend/src/api`, `backend/src/core/container`, `backend/src/api/contracts` | [Backend API Docs Hub](../backend/api/README.md), [Backend Contracts Docs Hub](../backend/contracts/README.md), [Backend Inventory Protocols Hub](../backend/inventory/protocols/README.md) |
| Runtime nodes | Process/service ownership, lifecycle, protocols, and validation routes for backend, Electron main, renderer, preload, sidecar, wakeword, VM worker, and Cloudflare/origin nodes | `backend/src`, `frontend/src/main`, `frontend/src/renderer`, `frontend/src/preload.js`, `frontend/src/main/python`, `scripts/cloudflared` | [Runtime Nodes Hub](../nodes/README.md), [Runtime Node Matrix](../nodes/runtime_node_matrix.md), [Current vs Future Nodes](../nodes/current_vs_future_nodes.md) |
| Gateway ingress | FastAPI app assembly, CORS, router registration, install auth middleware, hosted REST/websocket ingress, health checks, Cloudflare/self-host troubleshooting | `backend/src/main.py`, `backend/src/api/app_assembly.py`, `backend/src/api/routes`, `backend/src/api/auth`, `scripts/cloudflared` | [Gateway Hub](../gateway/README.md), [Gateway Protocol Map](../gateway/gateway_protocol_map.md), [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md) |
| Channels and transports | Desktop chat entrypoints, backend websocket, transcription websocket, sidecar JSON-RPC, SDK routes, VM run control | `frontend/src/main`, `frontend/src/renderer`, `frontend/src/main/python`, `backend/src/api/routes`, `frontend/src/renderer/infrastructure/api` | [Channels Hub](../channels/README.md), [Channel Routing Matrix](../channels/channel_routing_matrix.md), [Communication Flow](../architecture/communication_flow.md) |
| Security boundaries | Hosted auth, websocket validation, IPC isolation, credentials, permissions, tool policy, sidecar execution, multi-user risks | `backend/src/api/auth`, `backend/src/api/schemas`, `backend/src/core/security`, `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json`, `frontend/src/main/python/tools` | [Security Hub](../security/README.md), [Security Boundary Matrix](../security/security_boundary_matrix.md), [Security Change Playbook](../security/security_change_playbook.md) |
| Plugins and extensions | Current source-owned extension surfaces for tools, providers, inference adapters, SDK routes, browser actions, renderer features, and future plugin boundaries | `backend/src/tools`, `backend/src/sdk`, `backend/src/llm/providers`, `backend/src/api/routes/sdk`, `frontend/src/main/python/tools`, `frontend/src/renderer/features` | [Plugins and Extensions Hub](../plugins/README.md), [Extension Surface Matrix](../plugins/extension_surface_matrix.md), [Architecture Extension Points](../architecture/extension_points.md) |
| Backend agent runtime | Session lifecycle, query execution, interaction loop, tool turns, history, compaction, prompt context | `backend/src/agent`, `backend/src/api/services/query_execution.py` | [Backend Agent Docs Hub](../backend/agent/README.md), [Backend Runtime Docs Hub](../backend/runtime/README.md) |
| Backend tool schema + orchestration | Model-facing tool registry, schema filtering, coordinate preparation, frontend dispatch, result waiting, tool-result history | `backend/src/tools`, `backend/src/agent/tools` | [Backend Tools Docs Hub](../backend/tools/README.md), [Backend Change Path Playbook](../backend/inventory/domains/backend_change_path_playbook_reference.md) |
| Backend LLM + prompts | Provider factory, model catalog, prompt construction, parser/trust boundary, stream normalization | `backend/src/llm`, `backend/src/agent/llm` | [Backend LLM Docs Hub](../backend/llm/README.md), [Backend LLM Provider Docs Hub](../backend/llm/providers/README.md), [Backend LLM Prompt Docs Hub](../backend/llm/prompts/README.md) |
| Backend services | Artifacts, embeddings, semantic memory API, OCR, vision, token counting, TTS/wakeword audio services | `backend/src/services`, `backend/src/embeddings`, `backend/src/api/routes` | [Backend Services Docs Hub](../backend/services/README.md), [Backend Services Screen-Grounding Docs Hub](../backend/services/screen_grounding/README.md) |
| Automation and VM runs | Hosted run creation, worker assignment, run event timelines, stop controls, VM worker polling | `backend/src/api/routes/runs`, `backend/src/services/vm_run_control.py`, `backend/src/services/vm_run_control_support`, `frontend/src/main/vm_worker_runtime.cjs` | [Automation Hub](../automation/README.md), [VM Runs and Workers](../automation/vm_runs_and_workers.md), [Runs API Runbook](../automation/runs_api_runbook.md) |
| Electron main | Windows, overlays, websocket relay, config persistence, local sidecar bridge, permissions, wakeword bridge | `frontend/src/main` | [Frontend Main Docs Hub](../frontend/main/README.md), [Frontend Runtime Docs Hub](../frontend/runtime/README.md) |
| Renderer | Chat UI, dashboard, settings, permissions, voice UI, stream event consumption, tool runner, transcript queue | `frontend/src/renderer` | [Frontend Renderer Docs Hub](../frontend/renderer/README.md), [Frontend Inventory Domains Hub](../frontend/inventory/domains/README.md) |
| Preload IPC | Isolated renderer bridge, channel allowlist, IPC surface trust boundary | `frontend/src/preload.js` | [Frontend Preload Docs Hub](../frontend/preload/README.md), [Frontend Contracts IPC Docs Hub](../frontend/contracts/ipc/README.md) |
| Python sidecar | Local JSON-RPC, shell/filesystem/computer/system tools, browser runtime, local memory, system state, wakeword service | `frontend/src/main/python` | [Frontend Sidecar Docs Hub](../frontend/sidecar/README.md), [Frontend Sidecar Tools Docs Hub](../frontend/sidecar/tools/README.md) |
| Operations | Config, hosted auth, deployment, packaging, release, performance, security, runtime troubleshooting | `docs/operations`, `scripts`, `.github/workflows`, build config | [Operations Hub](../operations/README.md), [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md), [Operational Troubleshooting](../operations/operational_troubleshooting.md) |

## Change Path Playbooks

### Change an Entry Channel or Transport Route

Read:

- [Runtime Nodes Hub](../nodes/README.md)
- [Gateway Hub](../gateway/README.md)
- [Channels Hub](../channels/README.md)
- [Channel Routing Matrix](../channels/channel_routing_matrix.md)
- [Communication Flow](../architecture/communication_flow.md)
- [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [Backend API and Transport](../backend/api/api_and_transport.md)

Likely code:

- `frontend/src/main/ipc.cjs`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/**`
- `backend/src/api/routes/**`
- `backend/src/api/handlers/**`
- `frontend/src/main/python/**` when local sidecar execution is involved

Validate producer/consumer tests on both sides of the changed channel. Do not reuse another channel's private payload shape as an implicit compatibility shortcut.

### Change a Runtime Node Boundary

Read:

- [Runtime Nodes Hub](../nodes/README.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
- [Desktop and Sidecar Node](../nodes/desktop_and_sidecar_node.md)
- [VM Worker Node](../nodes/vm_worker_node.md)
- [Current vs Future Nodes](../nodes/current_vs_future_nodes.md)

Likely code:

- hosted backend node: `backend/src/main.py`, `backend/src/api/**`, `backend/src/agent/**`, `backend/src/tools/**`
- Electron desktop nodes: `frontend/src/main/**`, `frontend/src/preload.js`, `frontend/src/renderer/**`
- sidecar/wakeword nodes: `frontend/src/main/python/**`, `frontend/src/main/wakeword_bridge*.cjs`
- VM worker node: `frontend/src/main/vm_worker_runtime.cjs`, `backend/src/api/routes/runs/**`, `backend/src/services/vm_run_control*`
- Cloudflare/origin node: `scripts/cloudflared/**`, deployment operations docs

Validate the owner node plus the adjacent protocol boundary. If a planned mobile, edge, scheduler, plugin-marketplace, or one-agent-per-VM node is not implemented yet, keep the docs under planning until there is a code root and lifecycle.

### Change Hosted Backend Gateway, Route Assembly, Auth, or Health

Read:

- [Gateway Hub](../gateway/README.md)
- [Gateway Protocol Map](../gateway/gateway_protocol_map.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
- [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md)
- [WebSocket Connection Lifecycle](../gateway/websocket_connection_lifecycle.md)
- [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Likely code:

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/api/routes/__init__.py`
- `backend/src/api/routes/**`
- `backend/src/api/auth/**`
- `scripts/cloudflared/**` for self-host/tunnel behavior

Validate route/schema tests, auth/websocket tests when auth changes, SDK clients for public route changes, and Cloudflare/self-host docs for deployment changes.

### Change Auth, IPC Security, Credentials, Permissions, or Tool Authority

Read:

- [Security Hub](../security/README.md)
- [Security Boundary Matrix](../security/security_boundary_matrix.md)
- [Security Change Playbook](../security/security_change_playbook.md)
- [Safety Boundaries](../concepts/safety_boundaries.md)

Likely code:

- `backend/src/api/auth/**`
- `backend/src/api/schemas/**`
- `backend/src/core/validation/**`
- `backend/src/core/security/**`
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

- tools: `backend/src/tools/**`, `backend/src/sdk/**`, `frontend/src/main/python/tools/**`
- providers: `backend/src/llm/providers/**`, `backend/src/llm/models/models_config.py`, `backend/src/core/config/**`
- SDK routes: `backend/src/api/routes/sdk/**`, SDK client wrappers
- renderer features: `frontend/src/renderer/features/**`

Validate the registration point, policy/visibility, execution path, and docs for the specific extension surface. Treat installable third-party plugins as future planning unless a real loader, trust model, and tests exist.

### Add or Change a WebSocket Message

Read:

- [Streaming and Events](../concepts/streaming_and_events.md)
- [Backend Change Path Playbook](../backend/inventory/domains/backend_change_path_playbook_reference.md)
- [Backend Message Schema + Formatter Reference](../backend/contracts/message_schema_and_formatter_reference.md)
- [Frontend IPC and Sidecar Contract Touchpoints](../frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md)

Likely code:

- `backend/src/api/contracts/message_types.py`
- `backend/src/api/schemas/incoming.py` or `backend/src/api/schemas/outgoing.py`
- `backend/src/api/handlers/*`
- `backend/src/core/container/incoming_routing.py`
- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/types/backendEvents.ts`

Validate with schema, handler-routing, formatter, and renderer event-consumption tests.

### Change Query Streaming or Completion Behavior

Read:

- [Backend Query Handler and Query Execution Service Runtime Reference](../backend/api/handlers/query_handler_and_query_execution_service_runtime_reference.md)
- [Backend Stream Pipeline, Completion, and TTS Concurrency Reference](../backend/api/processing/stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md)
- [Frontend Chat Stream + Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md)

Likely code:

- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/*`
- `backend/src/agent/execution/interaction_loop.py`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`

Validate backend stream lifecycle tests plus renderer stream hook/store tests.

### Change Tool Schema, Tool Calls, or Tool Results

Read:

- [Backend Tools Docs Hub](../backend/tools/README.md)
- [Tool Catalog Matrix](../tools/tool_catalog_matrix.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)
- [Backend Tool Preparation + Coordinate Resolution Reference](../backend/tools/tool_preparation_and_coordinate_resolution_reference.md)
- [Backend Tool Result Ingress Reference](../backend/tools/tool_result_ingress_and_storage_reference.md)
- [Frontend Tool Execution Service + Hook Runtime Reference](../frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md)
- [Sidecar Tool Registry Exposed Schema and Result Normalization Reference](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)

Likely code:

- `backend/src/tools/**`
- `backend/src/agent/tools/**`
- `backend/src/api/processing/formatters/actions/*`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecution*.ts`
- `frontend/src/main/python/tools/**`

Validate backend schema/parser/formatter tests, renderer tool-runner tests, and sidecar registry/tool tests. Keep backend model-facing schemas and sidecar executable schemas separate.

### Change Desktop Computer Use, Screenshots, OCR, or Vision

Read:

- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Frontend Capture, Artifact Upload, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Backend OCR + Vision Coordinate Runtime Overview](../backend/services/ocr_and_vision_coordinate_runtime_reference.md)
- [Backend OCR Service + Screenshot State-Machine Reference](../backend/services/screen_grounding/ocr_service_and_screenshot_state_machine_reference.md)

Likely code:

- `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`
- `frontend/src/main/overlays/*`
- `frontend/src/main/python/tools/computer/*`
- `backend/src/services/screen_grounding/**`
- `backend/src/agent/tools/preparation/*`

Validate platform-specific frontend tests, sidecar computer-tool tests, and backend OCR/coordinate-preparation tests. Linux is the only OS that should hide WindieOS overlay surfaces for screenshot capture.

### Change Browser Automation

Read:

- [Browser Control](../browser/browser_control.md)
- [Frontend Sidecar Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- [Backend Browser Remote Schema Surface + Compatibility Contract Reference](../backend/tools/browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)

Likely code:

- `backend/src/tools/browser/**`
- `frontend/src/main/python/tools/browser/**`
- `frontend/src/renderer/features/dashboard/components/*` for browser UI surfaces

Validate backend/sidecar browser schema parity, sidecar runtime action tests, and renderer browser header/status tests when UI changes.

### Change Renderer Chat, Dashboard, or Settings UI

Read:

- [Frontend Renderer Docs Hub](../frontend/renderer/README.md)
- [Frontend Renderer Chat Docs Hub](../frontend/renderer/chat/README.md)
- [Frontend Renderer Dashboard Docs Hub](../frontend/renderer/dashboard/README.md)
- [Frontend Renderer Settings Docs Hub](../frontend/renderer/settings/README.md)
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

- [Frontend Main Overlay Focus Docs Hub](../frontend/main/overlays/README.md)
- [Frontend Overlay Query-Capture Blur + Settle](../frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Frontend Response Overlay Phase and Tool-Ghost Runtime Reference](../frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Frontend Chatbox Overlay Input, Drag, and Click-Through Reference](../frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)

Likely code:

- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/overlay_*`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/renderer/app/ChatBox*.jsx`
- `frontend/src/renderer/features/chat/**`
- `frontend/src/renderer/features/overlays/**`

Validate main-process overlay tests and renderer overlay tests. Keep focus, visibility, click-through, and transport changes scoped separately unless the state machine requires a combined patch.

### Change Voice, Wakeword, STT, or TTS

Read:

- [Frontend Voice Capture + Wakeword Controller Reference](../frontend/renderer/voice_capture_and_wakeword_controller_reference.md)
- [Frontend Wakeword Bridge + Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [Backend TTS + Wakeword Audio Runtime Reference](../backend/services/tts_and_wakeword_audio_runtime_reference.md)
- [Backend TTS Manager Audio Stream and Cleanup Reference](../backend/api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md)

Likely code:

- `frontend/src/renderer/features/voice/**`
- `frontend/src/main/wakeword_bridge*.cjs`
- `frontend/src/main/python/wakeword_service.py`
- `backend/src/api/processing/tts/**`
- `backend/src/services/*tts*`

Validate audio framing, voice hook, wakeword bridge, and backend TTS/STT tests.

### Change Transcript, Local Memory, or Semantic Memory

Read:

- [Frontend Transcript Session + Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [Frontend Sidecar Memory Docs Hub](../frontend/sidecar/memory/README.md)
- [Backend Embedding + Semantic Memory Runtime Reference](../backend/services/embedding_and_semantic_memory_runtime_reference.md)
- [Backend API Memory Docs Hub](../backend/api/memory/README.md)

Likely code:

- `frontend/src/renderer/infrastructure/transcript/**`
- `frontend/src/main/python/memory/**`
- `frontend/src/main/python/core/remote_*_client.py`
- `backend/src/api/routes/memory/**`
- `backend/src/services/embedding*`

Validate renderer transcript tests, sidecar memory tests, and backend memory route tests. Keep transcript replay state and semantic memory state distinct.

### Change VM Runs, Worker Polling, or Run Controls

Read:

- [Automation Hub](../automation/README.md)
- [VM Runs and Workers](../automation/vm_runs_and_workers.md)
- [Runs API Runbook](../automation/runs_api_runbook.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)

Likely code:

- `backend/src/api/routes/runs/**`
- `backend/src/services/vm_run_control.py`
- `backend/src/services/vm_run_control_support/**`
- `frontend/src/main/vm_worker_runtime.cjs`
- `frontend/src/main/runtime_mode.cjs`

Validate backend runs route/service tests and frontend VM worker/runtime-mode tests. Keep `/api/runs/*` as a control plane; normal desktop chat still goes through `/ws`.

### Add or Change an LLM Provider, Prompt, or Model Catalog

Read:

- [Model Provider Selection](../concepts/model_provider_selection.md)
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md)
- [Backend LLM Provider Docs Hub](../backend/llm/providers/README.md)
- [Backend Provider Factory + Runtime Selection Reference](../backend/llm/provider_factory_and_runtime_selection_reference.md)
- [Backend Prompt Constructor and Transparency Metadata Reference](../backend/llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [LLM Integration](../architecture/llm_integration.md)

Likely code:

- `backend/src/llm/providers/*`
- `backend/src/llm/providers/__init__.py`
- `backend/src/llm/models/models_config.py`
- `backend/src/core/config/*`
- `backend/src/llm/prompts/*`

Validate provider stream/non-stream/tool-call behavior, model listing, config loading, prompt transparency, and any regenerated prompt/schema snapshots.

### Change Config, Settings, or Runtime Policy

Read:

- [Backend Config Runtime Policy](../backend/config/config_fields_and_runtime_policy.md)
- [Frontend Config Sync + Settings Lifecycle Reference](../frontend/runtime/config_sync_and_settings_lifecycle_reference.md)
- [Frontend Settings + Models ACK Event Routing Reference](../frontend/contracts/events/settings_and_model_ack_event_routing_reference.md)

Likely code:

- `backend/src/core/config/**`
- `backend/src/api/handlers/settings.py`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/renderer/features/settings/**`

Validate backend config service tests, frontend settings sync tests, and model/settings ACK routing tests.

### Change Packaging, Release, Security, or Hosted Runtime

Read:

- [Configuration](../operations/configuration.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Deployment](../operations/deployment.md)
- [Release Guide](../operations/release.md)
- [Security](../operations/security.md)
- [Multi-User Runtime Hardening](../operations/multi_user_runtime_hardening.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Install Decision Matrix](../install/install_decision_matrix.md)
- [Backend Endpoint Setup](../install/local_backend_and_endpoint_setup.md)
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md)
- [Install Troubleshooting](../install/install_troubleshooting.md)
- [Operational Troubleshooting](../operations/operational_troubleshooting.md)

Likely code:

- `scripts/**`
- `frontend/package.json`
- `frontend/electron-builder.*`
- `backend/src/core/config/**`
- `backend/src/api/**`
- operation-specific docs and release notes

Validate the relevant build/test commands before release or packaging steps. Do not change version numbers or publish artifacts without explicit approval.

## Full Implementation Maps

Use these when a change path is not enough and you need exact file ownership:

- [Backend Functionality Map](../backend/README.md)
- [Backend Inventory Docs Hub](../backend/inventory/README.md)
- [Backend Capability to File Matrix Reference](../backend/inventory/backend_capability_to_file_matrix_reference.md)
- [Backend Module File Index Reference](../backend/inventory/backend_module_file_index_reference.md)
- [Frontend Functionality Map](../frontend/README.md)
- [Frontend Inventory Docs Hub](../frontend/inventory/README.md)
- [Frontend Capability to File Matrix Reference](../frontend/inventory/frontend_capability_to_file_matrix_reference.md)
- [Frontend Module File Index Reference](../frontend/inventory/frontend_module_file_index_reference.md)
- [Frontend IPC and Sidecar Contract Touchpoints Reference](../frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md)

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
- [Voice and Audio Channels](../channels/voice_and_audio_channels.md)
- [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md)

### Runtime Nodes

- [Runtime Nodes Hub](../nodes/README.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
- [Desktop and Sidecar Node](../nodes/desktop_and_sidecar_node.md)
- [VM Worker Node](../nodes/vm_worker_node.md)
- [Current vs Future Nodes](../nodes/current_vs_future_nodes.md)

### Gateway

- [Gateway Hub](../gateway/README.md)
- [Gateway Protocol Map](../gateway/gateway_protocol_map.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
- [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md)

### Security

- [Security Hub](../security/README.md)
- [Security Boundary Matrix](../security/security_boundary_matrix.md)
- [Security Change Playbook](../security/security_change_playbook.md)
- [Operations Security](../operations/security.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)

### Plugins and Extensions

- [Plugins and Extensions Hub](../plugins/README.md)
- [Extension Surface Matrix](../plugins/extension_surface_matrix.md)
- [Provider Extension Guide](../plugins/provider_extension_guide.md)
- [Current vs Future Plugin Boundary](../plugins/current_vs_future_plugin_boundary.md)
- [Architecture Extension Points](../architecture/extension_points.md)

### Memory

- [Memory Hub](../memory/README.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- [Sidecar Local Memory](../memory/sidecar_local_memory.md)
- [Backend History and Semantic Routes](../memory/backend_history_and_semantic_routes.md)
- [Memory Troubleshooting](../memory/memory_troubleshooting.md)

### Automation

- [Automation Hub](../automation/README.md)
- [VM Runs and Workers](../automation/vm_runs_and_workers.md)
- [Runs API Runbook](../automation/runs_api_runbook.md)
- [Automation Boundaries](../automation/automation_boundaries.md)

### Desktop Surfaces

- [Desktop Surfaces](../desktop/README.md)
- [Dashboard](../desktop/dashboard.md)
- [Minimal Chat Pill](../desktop/minimal_chat_pill.md)
- [Response Overlay](../desktop/response_overlay.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [Artifacts and Attachments](../desktop/artifacts_and_attachments.md)

### Debug

- [Debug Hub](../debug/README.md)
- [Logging](../debug/logging.md)
- [Diagnostic Flags](../debug/diagnostic_flags.md)
- [Runtime Traces](../debug/runtime_traces.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
- [Process Health Checklist](../debug/process_health_checklist.md)
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

### Providers

- [Providers Hub](../providers/README.md)
- [Models and LLM Providers](../providers/models.md)
- [Provider Credentials](../providers/credentials.md)
- [Inference Providers](../providers/inference.md)
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
- [Query Planning and Trace](../sdk/query_planning_and_trace.md)
- [OCR and Vision SDK](../sdk/ocr_and_vision.md)
- [Tool Authoring](../sdk/tool_authoring.md)

### Install

- [Install Hub](../install/README.md)
- [Install Decision Matrix](../install/install_decision_matrix.md)
- [Local Development](../install/local_development.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
- [Backend Endpoint Setup](../install/local_backend_and_endpoint_setup.md)
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md)
- [Install Troubleshooting](../install/install_troubleshooting.md)

### Commands

- [Commands and Scripts](../cli/README.md)
- [Command Matrix](../cli/command_matrix.md)
- [Validation Commands](../cli/validation_commands.md)
- [Packaging and Release Commands](../cli/packaging_and_release_commands.md)

### Platforms

- [Platforms Hub](../platforms/README.md)
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
- [Doctor Checklist](../help/doctor_checklist.md)
- [Evidence Packet](../help/evidence_packet.md)
- [FAQ](../help/faq.md)

### Web

- [Web Surfaces](../web/README.md)
- [Web Surface Matrix](../web/web_surface_matrix.md)
- [Hosted API and Auth](../web/hosted_api_and_auth.md)
- [Landing Page](../web/landing_page.md)
- [Web Client Integration](../web/web_client_integration.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

### Reference

- [Reference Hub](../reference/README.md)
- [API Reference](../reference/api_reference.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [WebSocket Event Reference](../reference/websocket_event_reference.md)
- [Configuration Reference](../reference/configuration_reference.md)
- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)
- [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md)

### Architecture

- [Architecture Hub](../architecture/README.md)
- [System Architecture](../architecture/architecture.md)
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md)
- [Data Flow and State Ownership](../architecture/data_flow_and_state_ownership.md)
- [Change Ownership Decision Tree](../architecture/change_ownership_decision_tree.md)
- [Failure Domain Map](../architecture/failure_domain_map.md)
- [Backend Architecture](../architecture/backend_architecture.md)
- [Frontend Architecture](../architecture/frontend_architecture.md)
- [Python Sidecar](../architecture/python_sidecar.md)
- [Agent System](../architecture/agent_system.md)
- [Tool System](../architecture/tool_system.md)
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
- [Tool Development](../development/tool_development.md)
- [Dev Tool Selection](../development/dev_tool_selection.md)

### Operations

- [Operations Hub](../operations/README.md)
- [Configuration](../operations/configuration.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Deployment](../operations/deployment.md)
- [Release Guide](../operations/release.md)
- [Security](../operations/security.md)
- [Performance](../operations/performance.md)
- [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Operational Troubleshooting](../operations/operational_troubleshooting.md)

### Planning

- [Planning Hub](../planning/README.md)
- [Current vs Future Boundary](../planning/current_vs_future_boundary.md)
- [Roadmap Status Matrix](../planning/roadmap_status_matrix.md)
- [Plan Promotion Checklist](../planning/plan_promotion_checklist.md)
- [Initiative Index](../planning/initiative_index.md)
- [Future Product Plan](../planning/future_plan.md)
- [OS Layer UX Evolution Plan](../planning/os_layer_ux_evolution_plan.md)
- [VM Multi-Agent Plan](../planning/windieos_vm_multi_agent_plan.md)
- [CLI OS Control Plan](../planning/windieos_cli_os_control_plan.md)

### Architecture Decision Records

- [Architecture Decision Records](../adr/README.md)
- [ADR 004: Browser Extension Auto-Attach Boundary](../adr/004-browser-extension-auto-attach.md)
- [ADR 005: Frontend Tool Schema Source of Truth](../adr/005-frontend-tool-schema-source-of-truth.md)

## Where to Add New Docs

- Add conceptual docs to `docs/architecture/`.
- Add implementation maps and subsystem references to `docs/backend/` or `docs/frontend/`.
- Add contributor workflow docs to `docs/development/`.
- Add runtime, deployment, release, security, or packaging docs to `docs/operations/`.
- Add stable protocol/API lookup docs to `docs/reference/`.
- Add future plans or staged implementation proposals to `docs/planning/`.

Every new doc should include `summary`, `read_when`, and `title` front matter. Update this hub only for docs that materially help agents route future work.
