---
summary: "Compact quick cards for routing common WindieOS changes to the correct owner docs, checks, and safety notes."
read_when:
  - When you need a short owner-first route for a common WindieOS change before reading deeper docs.
  - When a change touches more than one runtime and you want the first docs, validation, and no-go checks.
title: "Agent Routing Quick Cards"
---

# Agent Routing Quick Cards

Use these cards after `docs/docs.json`, [Docs Directory](../getting-started/docs_directory.md), and [Agent Runtime Ownership and Change Routing](agent_runtime_ownership_and_change_routing.md). Each card names the likely owner, the first docs to read, the minimum validation shape, and the mistake to avoid.

These cards do not replace the deeper workflow docs. They are a fast map for choosing where to start.

## Backend API Route

Owner: backend.

Start with [Backend API Hub](../backend/api/README.md), [API Route Change Workflow](../backend/api/api_route_change_workflow.md), and [HTTP and WebSocket API Surface](../reference/http_api_surface.md).

Validate route models, auth behavior, service tests, and any SDK/client examples that call the route. Keep route contracts in backend docs and do not make frontend or local-runtime implementation code import backend objects for parity.

Avoid: adding a renderer-side fallback for malformed route payloads before fixing the backend producer.

## SDK Route Or Client Method

Owner: SDK runtime with backend route parity.

Start with [SDK Hub](../sdk/README.md), [SDK Route Change Workflow](../sdk/sdk_route_change_workflow.md), and [SDK Auth and Error Handling](../sdk/sdk_auth_and_error_handling.md).

Validate backend route models, TypeScript/Python client behavior, error envelopes, and example or unit coverage. Keep reusable route behavior in the SDK instead of adding an Electron-only bridge.

Avoid: creating a second Electron path that renames and forwards SDK payloads without enforcing a real boundary.

## Model-Visible Tool Schema

Owner: backend schema and policy, with client/local-runtime manifest parity when the tool executes locally.

Start with [Tools Hub](../tools/README.md), [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md), and [Tool Catalog Matrix](../tools/tool_catalog_matrix.md).

Validate model schema projection, provider policy, local-runtime executable parity when executable fields change, and result-contract tests. Preserve the distinction between model-facing schema and prepared local-runtime arguments.

Avoid: changing only the Python tool executor while leaving the model-visible schema or provider projection stale.

## Filesystem Or Shell Tool Behavior

Owner: SDK/main local execution with local-runtime implementation and backend/client tool contract parity.

Start with [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), and [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md).

Validate schema visibility, working-directory handling, process/session behavior, sudo policy, output formatting, and local-runtime Python tests. Keep local machine authority in the local runtime.

Avoid: moving filesystem or shell execution into backend code to make a local failure easier to reproduce.

## Browser Automation

Owner: local-runtime browser runtime, shared browser contract, and renderer controls.

Start with [Browser Change Workflow](../browser/browser_change_workflow.md), [Browser Hub](../browser/README.md), and [Browser Tool](../tools/browser.md).

Validate browser action schemas, CDP/session startup, snapshot/ref behavior, downloaded files, Electron readiness controls, and focused browser tests. Keep dedicated browser state distinct from generic shell or computer-use behavior.

Avoid: treating browser failures as plain tool-dispatch failures before checking the browser runtime and session lifecycle.

## Overlay Or Chat Pill Runtime

Owner: Electron main window policy plus renderer display state.

Start with [Minimal Chat Pill](../desktop/minimal_chat_pill.md), [Response Overlay](../desktop/response_overlay.md), and [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md).

Validate phase transitions, focus handoff, visibility, click-through, screenshot hide/restore, and mode-specific tests. Define the event timeline before editing.

Avoid: mixing focus, visibility, transport, and click-through changes in one patch unless the state machine requires it.

## Screenshots Or Artifacts

Owner: local-runtime capture for local screenshots, backend artifacts for hosted storage, and renderer replay/display for presentation.

Start with [Artifact Change Workflow](../desktop/artifact_change_workflow.md), [Artifacts and Attachments](../desktop/artifacts_and_attachments.md), and [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md).

Validate capture-time overlay hiding, artifact upload/fetch, screenshot refs in query payloads, post-action tool screenshot output, and replay rendering. Include a migration note when persisted artifact identifiers or storage paths change.

Avoid: fixing a missing image only in the renderer before checking whether the capture, upload, or replay producer dropped the reference.

## Transcript Or Replay Behavior

Owner: SDK/runtime stores and renderer projection, with local-runtime transcript storage and backend rehydrate contracts where applicable.

Start with [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md), [Sessions and Conversations](../concepts/sessions_and_conversations.md), and [Session and Transcript Reference](../reference/session_and_transcript_reference.md).

Validate transcript writes, pending queue retries, dashboard replay, backend rehydrate payloads, stale-event filtering, and tool-row reconstruction. Keep visible transcript state distinct from raw event/history rows.

Avoid: patching dashboard replay output before finding the producer that persisted or omitted the row.

## Memory Or Compaction

Owner: local runtime for local memory storage, backend for hosted semantic routes and compaction decisions, SDK/renderer for projection and replay.

Start with [Memory Hub](../memory/README.md), [Memory Change Workflow](../memory/memory_change_workflow.md), and [Context and Memory](../concepts/context_and_memory.md).

Validate memory retrieval/injection, semanticization, transcript identity, compaction lifecycle, backend history, and any dashboard memory UI paths. State whether persisted data needs migration or no migration.

Avoid: merging transcript replay, semantic memory, and compaction fixes into one undocumented state change.

## Provider Or Model Catalog

Owner: backend provider runtime and model catalog, with renderer settings/picker follow-through.

Start with [Providers Hub](../providers/README.md), [Provider Change Workflow](../providers/provider_change_workflow.md), and [Model Catalog Change Workflow](../providers/model_catalog_change_workflow.md).

Validate provider factory behavior, streaming and non-streaming responses, tool-call compatibility, credential gates, model metadata, and renderer model picker behavior. Keep provider defaults and credential handling in config-owned paths.

Avoid: adding a model option only in the renderer without updating backend capability metadata and provider validation.

## Inference Capability

Owner: backend inference/provider services with SDK routes and local-runtime clients where local capture or playback is involved.

Start with [Inference Capability Change Workflow](../providers/inference_capability_change_workflow.md), [Providers Hub](../providers/README.md), and [SDK Route Change Workflow](../sdk/sdk_route_change_workflow.md).

Validate OCR, vision, embeddings, STT, TTS, provider health gates, SDK route envelopes, and renderer/local-runtime consumers. Keep capability detection explicit instead of inferring support from a provider name.

Avoid: wiring a new inference button or setting before the backend capability and failure path are testable.

## WebSocket Event Contract

Owner: backend event contract and formatter, with Electron relay and renderer consumers as follow-through.

Start with [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md), [Streaming and Events](../concepts/streaming_and_events.md), and [WebSocket Event Reference](../reference/websocket_event_reference.md).

Validate event names, payload fields, correlation identifiers, terminal events, stale-turn filtering, Agent SDK projection, typed Electron fan-out, and renderer consumers. Update reference docs when persisted or public event shape changes.

Avoid: accepting unknown renderer event shapes as a compatibility path instead of fixing the formatter or contract.

## Gateway Or WebSocket Connection

Owner: backend gateway ingress and websocket lifecycle.

Start with [Gateway Hub](../gateway/README.md), [WebSocket Connection Change Workflow](../gateway/websocket_connection_change_workflow.md), and [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md).

Validate auth handshake, identity binding, message validation, task admission limits, receive timeouts, handler dispatch, transport sends, and cleanup. Keep connection admission separate from query execution behavior.

Avoid: changing stream event payloads to compensate for a connection lifecycle or auth failure.

## Config, Settings, Or Runtime Policy

Owner: backend config for hosted policy, Electron/main and renderer for local settings surfaces, SDK for reusable runtime sync.

Start with [Configuration Change Workflow](../operations/configuration_change_workflow.md), [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md), and [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md).

Validate defaults, environment overrides, persisted settings, ACK/error events, provider rebinding, and settings UI state. Document whether existing persisted values migrate or remain compatible.

Avoid: adding a renderer-only default that disagrees with backend config or packaged runtime behavior.

## Permission Or Local Authority

Owner: Electron main for native permission prompts and window policy, local runtime for local machine actions, backend for policy validation only.

Start with [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md), [Security Boundary Matrix](../security/security_boundary_matrix.md), and [Platform Permission Matrix](../platforms/permission_matrix.md).

Validate screen, input, microphone, browser, workspace, and sudo authority paths on the relevant platform. Keep permission state, credential state, and tool execution state separate.

Avoid: granting backend code authority over local input, filesystem, or OS permissions.

## Credential Or Token Handling

Owner: backend auth and config for hosted tokens, Electron/renderer for user-entered local settings, local runtime only for scoped remote-client credentials.

Start with [Credential and Token Change Workflow](../security/credential_token_change_workflow.md), [Credentials and Tokens Matrix](../security/credentials_and_tokens_matrix.md), and [Hosted Backend Auth](../operations/hosted_backend_auth.md).

Validate environment-variable loading, install auth, REST bearer tokens, websocket auth, runs keys, provider credentials, OAuth state, redaction, and logs. Use placeholders in docs and tests.

Avoid: writing real credentials, user data, or machine-specific paths into docs, fixtures, logs, or snapshots.

## Plugin Or Extension Contribution

Owner: the extension contribution surface being changed, with package metadata as the stable entrypoint.

Start with [Plugins and Extensions Hub](../plugins/README.md), [Extension Convention](extensions.md), and [Extension Surface Matrix](../plugins/extension_surface_matrix.md).

Validate package metadata, plugin tools, MCP server config, skill prompt layers, local-runtime schemas/code, settings panels, and lifecycle hooks according to the contribution type. Keep contribution types separated inside the extension package.

Avoid: adding a generic adapter that only renames extension payloads without enforcing a lifecycle, security, or runtime boundary.

## MCP Server Or Tool Exposure

Owner: client-side MCP configuration and SDK/Electron tool manifest assembly, with backend validation of the submitted manifest.

Start with [MCP Runtime](mcp.md), [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md), and [Plugins and Extensions Hub](../plugins/README.md).

Validate server enablement, stdio launch args, discovery diagnostics, schema projection, trust boundaries, dashboard refresh behavior, and backend manifest validation. Keep disabled-by-default servers gated until the user enables them.

Avoid: treating MCP tools as backend built-ins when the active local tool surface comes from the client manifest.

## VM Run Or Worker Control

Owner: backend runs API and run-control service, with Electron VM worker dispatch as the local executor path.

Start with [Automation Hub](../automation/README.md), [VM Run Control Change Workflow](../automation/vm_run_control_change_workflow.md), and [Runs API Runbook](../automation/runs_api_runbook.md).

Validate run creation, worker heartbeat assignment, event timelines, pending controls, stop behavior, runs API keys, and Electron worker dispatch. Keep `/api/runs/*` as the control plane; normal desktop chat stays on `/ws`.

Avoid: reusing chat websocket assumptions for VM worker polling or run-control state.

## Voice, Wakeword, STT, Or TTS

Owner: renderer for capture/playback UI, Electron main for wakeword supervision, local runtime for local wakeword/audio helpers, backend for STT/TTS provider services.

Start with [Voice Audio Change Workflow](../channels/voice_audio_change_workflow.md), [Voice and Wakeword](../desktop/voice_and_wakeword.md), and [Voice and Audio Channels](../channels/voice_and_audio_channels.md).

Validate microphone permissions, wakeword subprocess lifecycle, audio framing, transcription websocket behavior, STT provider routing, TTS chunk streaming, cleanup, and renderer status state. Keep audio side-channels separate from text query streams.

Avoid: debugging voice failures only through chat-stream events before checking audio transport and wakeword process health.

## Packaging Or Release

Owner: operations and platform packaging paths, with Electron Builder and bundled local runtime as the main implementation surfaces.

Start with [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md), and [Packaged Desktop Builds](../install/packaged_desktop.md).

Validate local-runtime bundling, Electron package targets, endpoint defaults, reinstall helpers, smoke checks, signing/notarization expectations, and platform-specific packaging behavior. Do not change versions or publish artifacts without explicit approval.

Avoid: testing only the source dev loop when the change affects packaged app resources or startup paths.

## Renderer State Or Dashboard UI

Owner: renderer display state and user-facing flows.

Start with [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md), [Frontend Renderer Hub](../frontend/renderer/README.md), and [Dashboard Change Workflow](../frontend/renderer/dashboard/dashboard_change_workflow.md).

Validate state normalization, loading/error/empty/data states, stale event guards, accessibility of controls, dashboard navigation, and focused Jest coverage. Keep transport loops, durable storage, and tool execution out of renderer components.

Avoid: adding renderer state that becomes a second source of truth for SDK/runtime conversation data.

## Electron Main Or IPC

Owner: Electron main for app/window/native lifecycle and preload for the narrow allowlisted bridge.

Start with [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md), [IPC Change Workflow](../frontend/ipc_change_workflow.md), and [Frontend Contracts Hub](../frontend/contracts/README.md).

Validate channel registration, preload exposure, renderer caller shape, main handler lifecycle, permission boundaries, packaged behavior, and IPC contract tests. Keep policy decisions in the owning runtime, not in preload.

Avoid: adding a new bridge for behavior that belongs in the SDK runtime, local runtime, or backend contract.

## Local Runtime Process Or JSON-RPC

Owner: Electron main/SDK runtime for local-runtime process startup and reuse, local-runtime Python implementation for daemon methods and local execution.

Start with [Local Runtime Process Lifecycle Workflow](../frontend/main/local_backend/process_lifecycle_change_workflow.md), [Local Runtime JSON-RPC Change Workflow](../frontend/sidecar/local_backend_jsonrpc_change_workflow.md), and [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md).

Validate launch args, readiness, source identity, request correlation, timeouts, response envelopes, packaged paths, and focused local-runtime Python tests. Keep daemon lifecycle distinct from the behavior of one executable tool.

Avoid: masking stale local-runtime processes with renderer retries instead of fixing startup or readiness ownership.

## Observability Or Error Handling

Owner: the runtime that emits the signal, with docs and tests proving the failure path is actionable and sanitized.

Start with [Observability Change Workflow](../debug/observability_change_workflow.md), [Error and Failure Change Workflow](../debug/error_failure_change_workflow.md), and [Diagnostic Flags](../debug/diagnostic_flags.md).

Validate log level, trace flag gating, diagnostic event shape, user-facing error state, retry behavior, redaction, and evidence-collection docs. Prefer narrow diagnostics that identify the producer and consumer.

Avoid: adding always-on verbose logs or raw payload dumps for cross-runtime failures.

## Docs-Only Update

Owner: docs and tests, with runtime docs consulted when the doc describes behavior owned by a runtime.

Start with [Docs Update Workflow](docs_update_workflow.md), [Documentation Hub](../getting-started/docs_hub.md), and [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md).

Validate front matter, `read_when` routing, hub wiring, canonical navigation, relative links, changelog coverage, `<windie> docs list`, and `git diff --check`. Docs-only changes usually do not need code tests unless a generator, schema snapshot, or script changed.

Avoid: documenting intended behavior as current behavior before checking the owning runtime or marking the page as planning material.
