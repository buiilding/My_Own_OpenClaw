---
summary: "Agent-facing index for routing concrete WindieOS code changes to the owning runtime, source roots, tests, docs, and validation commands."
read_when:
  - When a development request names a feature but not the owning source files.
  - When deciding which backend, frontend, sidecar, test, and docs surfaces must move together for a change.
  - When comparing WindieOS implementation coverage to OpenClaw-style command and surface maps.
title: "Code Change Surface Index"
---

# Code Change Surface Index

Use this page when the request is phrased as product behavior, a failure symptom, or a capability name and you need to identify the exact code area before editing. Start with the owning runtime, then read the linked domain docs, then inspect the code roots listed here.

Hard rule: do not make the frontend or sidecar import backend code to gain parity. If two runtimes need to agree, update the contract docs and tests that prove the producer and consumer still match.

## Fast Routing Table

| Request shape | Primary owner | First code roots | Tests to inspect or add | Start docs |
| --- | --- | --- | --- | --- |
| Agent does not answer, streams wrong events, or repeats history | Backend agent runtime | `backend/src/agent`, `backend/src/api/services/query_execution.py`, `backend/src/api/routes/websocket` | `tests/backend` websocket, session, and agent-loop tests | [Agent Loop](../concepts/agent_loop.md), [Streaming and Events](../concepts/streaming_and_events.md), [Backend Agent Hub](../backend/agent/README.md) |
| Tool is missing from the model, has the wrong schema, or is blocked by policy | Backend tool schema and policy | `backend/src/tools`, `backend/src/agent/tools`, `backend/src/tools/tool_selection.py` | Backend schema/policy tests plus focused tool catalog coverage | [Tool Contracts](../tools/tool_contracts.md), [Tool Catalog Matrix](../tools/tool_catalog_matrix.md), [Backend Tools Hub](../backend/tools/README.md) |
| Tool is visible but does not execute locally | Renderer tool runner, Electron bridge, and sidecar executor | `frontend/src/renderer/infrastructure/services/toolExecution`, `frontend/src/main/local_backend_bridge*.cjs`, `frontend/src/main/python/tools`, `frontend/src/main/ipc` | `tests/frontend`, `tests/sidecar/tools` | [Sidecar Runtime Change Workflow](../frontend/sidecar/sidecar_runtime_change_workflow.md), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md), [Frontend Sidecar Tools Hub](../frontend/sidecar/tools/README.md) |
| Browser action launches wrong browser, loses session, or cannot attach | Sidecar browser runtime and Electron session UI | `frontend/src/main/python/tools/browser`, `frontend/src/main`, `frontend/src/renderer/features/chat` | Sidecar browser tests and frontend browser-session tests | [Dedicated Browser Runtime](../browser/dedicated_browser_runtime.md), [Browser Action Surface](../browser/browser_action_surface.md), [Browser Troubleshooting](../browser/browser_troubleshooting.md) |
| Screenshot, OCR, or coordinate grounding is wrong | Backend OCR/vision plus sidecar screenshot/input | `backend/src/services/ocr`, `backend/src/services/vision`, `backend/src/tools/computer`, `frontend/src/main/python/tools/computer` | Backend OCR/vision tests, sidecar computer tests, tool schema tests | [Computer Tools](../tools/computer.md), [OCR and Vision](../sdk/ocr_and_vision.md), [Inference Providers](../providers/inference.md) |
| Screenshot attachment, artifact image, pasted image, or replayed image is missing | Renderer artifact pipeline plus backend artifact route/store | `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`, `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`, `backend/src/api/routes/artifacts`, `backend/src/services/artifacts` | Frontend artifact/screenshot tests plus backend artifact route/store tests | [Artifact Change Workflow](../desktop/artifact_change_workflow.md), [Artifacts and Attachments](../desktop/artifacts_and_attachments.md), [Backend Artifact Service Docs Hub](../backend/services/artifacts/README.md) |
| Chat pill flickers, overlay phase is wrong, or streamed text appears in the wrong surface | Renderer surfaces and Electron window orchestration | `frontend/src/renderer/features/chat`, `frontend/src/renderer/infrastructure/services/surfaceOrchestrator`, `frontend/src/main`, `frontend/src/main/platform` | Frontend chat/surface/main-process tests; platform checks when OS-specific | [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md), [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md), [Minimal Chat Pill](../desktop/minimal_chat_pill.md), [Response Overlay](../desktop/response_overlay.md), [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md) |
| Dashboard, settings, model picker, memory view, or history UI behaves wrong | Renderer dashboard, settings, transcript projection, and provider state | `frontend/src/renderer/features/dashboard`, `frontend/src/renderer/features/settings`, `frontend/src/renderer/infrastructure/transcript`, `frontend/src/renderer/app/providers` | `tests/frontend` dashboard, settings, transcript, and provider tests | [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md), [Dashboard](../desktop/dashboard.md), [Artifacts and Attachments](../desktop/artifacts_and_attachments.md), [Frontend Renderer Hub](../frontend/renderer/README.md) |
| Hosted URL, websocket auth, CORS, install token, or health check fails | Backend gateway and Electron endpoint forwarding | `backend/src/api`, `backend/src/api/auth`, `frontend/src/main`, `frontend/src/renderer/infrastructure/api` | Backend route/auth tests plus frontend endpoint tests | [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md), [Gateway Hub](../gateway/README.md), [Hosted API and Auth](../web/hosted_api_and_auth.md), [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md) |
| Need new logs, trace flags, metrics, diagnostic events, or evidence collection | Producing runtime for the missing evidence | `backend/src/core/logging_setup.py`, `backend/src/core/observability`, `frontend/src/main`, `frontend/src/renderer/infrastructure`, `frontend/src/main/python` | Logger/trace gating tests plus feature tests | [Observability Change Workflow](../debug/observability_change_workflow.md), [Logging](../debug/logging.md), [Runtime Traces](../debug/runtime_traces.md) |
| LLM provider, model catalog, credential, or failover behavior changes | Backend LLM stack plus frontend settings surface | `backend/src/llm/providers`, `backend/src/llm/models`, `backend/src/core/config`, `frontend/src/renderer/features/settings` | Backend provider/config tests plus frontend model-settings tests | [Providers Hub](../providers/README.md), [Models and LLM Providers](../providers/models.md), [Provider Credentials](../providers/credentials.md) |
| Voice capture, wakeword, transcription, or TTS playback changes | Renderer voice UI, Electron bridge, backend audio routes | `frontend/src/renderer/features/voice`, `frontend/src/main/wakeword_bridge*.cjs`, `backend/src/api/routes/transcription`, `backend/src/api/processing/tts` | Frontend voice tests, backend transcription/TTS tests | [Voice Audio Change Workflow](../channels/voice_audio_change_workflow.md), [Voice and Wakeword](../desktop/voice_and_wakeword.md), [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| Memory retrieval, replay, transcript persistence, or compaction changes | Backend history plus renderer transcript plus sidecar memory | `backend/src/agent/history`, `backend/src/agent/compaction`, `backend/src/api/routes/memory`, `frontend/src/renderer/infrastructure/transcript`, `frontend/src/main/python/memory` | Backend history/memory tests, frontend transcript tests, sidecar memory tests | [Memory Hub](../memory/README.md), [Transcript and Replay](../memory/transcript_and_replay.md), [Session and Transcript Reference](session_and_transcript_reference.md) |
| VM run, worker heartbeat, hosted automation, or run-control behavior changes | Backend runs API and VM worker runtime | `backend/src/api/routes/runs`, `backend/src/services/vm_run_control.py`, `backend/src/services/vm_run_control_support`, `frontend/src/main/vm_worker_runtime.cjs` | Backend runs API tests and worker lifecycle tests | [Automation Hub](../automation/README.md), [VM Runs and Workers](../automation/vm_runs_and_workers.md), [Runs API Runbook](../automation/runs_api_runbook.md) |
| Packaged app, sidecar runtime, reinstall, smoke-check, or release behavior changes | Electron packaging, sidecar bundling, platform adapters, release workflow | `frontend/package.json`, `frontend/electron-builder*.yml`, `frontend/src/main/runtime_paths.cjs`, `frontend/src/main/python`, `scripts/build-sidecar-runtime`, `scripts/reinstall-windieos-*`, `scripts/ci/smoke-*`, `.github/workflows/desktop-release.yml` | Frontend runtime path tests, sidecar tests, target OS package/smoke checks, platform-specific manual checks | [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md), [Install Hub](../install/README.md), [Platform Change Workflow](../platforms/platform_change_workflow.md), [Platform Validation Matrix](../platforms/platform_validation_matrix.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md), [Packaging and Release Commands](../cli/packaging_and_release_commands.md) |
| Landing page or external web/API client changes | Landing app, hosted API routes, SDK clients | `frontend/src/landing`, `backend/src/api/routes/sdk`, `backend/src/sdk`, `frontend/src/renderer/infrastructure/api` | Landing/frontend tests plus backend SDK route tests | [Web Surfaces](../web/README.md), [Web Surface Matrix](../web/web_surface_matrix.md), [Hosted Backend Clients](../sdk/hosted_backend_clients.md) |

## Runtime Ownership Rules

| Runtime | Owns | Must not own |
| --- | --- | --- |
| Hosted backend | Agent loop, session state, model-visible tools, provider adapters, hosted REST/websocket routes, OCR/vision, embeddings, artifacts, SDK routes, VM run control | Desktop window behavior, local OS input execution, Electron-only settings persistence |
| Electron main | Window lifecycle, preload bridge, websocket relay, local config, endpoint forwarding, sidecar process lifecycle, platform adapters | Model-facing tool schema, provider normalization, backend session history |
| Renderer | Chat surfaces, dashboard, settings, transcript rendering, local tool dispatch orchestration, voice UI | Raw filesystem/shell/computer execution, backend route assembly, secret-bearing hosted auth decisions |
| Python sidecar | Local executable tools, browser automation, shell/filesystem/computer/system actions, local memory store, system state probes | Model policy, prompt construction, hosted route auth, renderer state layout |
| VM worker | Polling assigned hosted runs, dispatching run payloads, relaying run events, honoring stop controls | Interactive desktop UI state, user local sidecar memory |

If a change seems to belong to two rows, change the producer first and then update the consumer contract. For example, if a backend event payload is malformed and the renderer crashes, fix the backend event shape or contract before adding renderer-only defensive parsing.

## Source Root Details

### Backend

| Code root | Use it for | Adjacent docs |
| --- | --- | --- |
| `backend/src/api/routes` | REST and websocket route modules, route registration, hosted API boundaries | [HTTP and WebSocket API Surface](http_api_surface.md), [Gateway Protocol Map](../gateway/gateway_protocol_map.md) |
| `backend/src/api/auth` | Install-token auth, websocket auth, runs API auth, hosted access checks | [Hosted Backend Auth](../operations/hosted_backend_auth.md), [Security Boundary Matrix](../security/security_boundary_matrix.md) |
| `backend/src/api/processing` | Formatter output, TTS processing, event shaping around route outputs | [WebSocket Event Reference](websocket_event_reference.md), [Backend Contracts Hub](../backend/contracts/README.md) |
| `backend/src/agent/session` | Per-client and per-conversation runtime ownership | [Sessions and Conversations](../concepts/sessions_and_conversations.md), [Backend Runtime Hub](../backend/runtime/README.md) |
| `backend/src/agent/execution` | Query execution and loop control | [Agent Loop](../concepts/agent_loop.md), [Backend Agent Hub](../backend/agent/README.md) |
| `backend/src/agent/tools` | Tool preparation, sending, waiting, and result handling inside the loop | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), [Backend Tools Hub](../backend/tools/README.md) |
| `backend/src/tools` | Canonical model-facing tool definitions and capability families | [Tool Catalog Matrix](../tools/tool_catalog_matrix.md), [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md) |
| `backend/src/llm/providers` | Provider clients and stream normalization | [Providers Hub](../providers/README.md), [Backend LLM Provider Hub](../backend/llm/providers/README.md) |
| `backend/src/llm/models` | Model catalog, capability metadata, model ids | [Models and LLM Providers](../providers/models.md), [Model Provider Selection](../concepts/model_provider_selection.md) |
| `backend/src/core/config` | App config, env var loading, credential access | [Configuration Reference](configuration_reference.md), [Provider Credentials](../providers/credentials.md) |
| `backend/src/services` | Artifacts, OCR, vision, and VM-run support services | [Backend Services Hub](../backend/services/README.md), [Inference Providers](../providers/inference.md) |
| `backend/src/sdk` | SDK tool helpers and hosted client contracts | [SDK Hub](../sdk/README.md), [Tool Authoring](../sdk/tool_authoring.md) |

### Frontend and Sidecar

| Code root | Use it for | Adjacent docs |
| --- | --- | --- |
| `frontend/src/main/ipc` and `frontend/src/main/ipc.cjs` | Main-process IPC handlers, renderer bridge targets, sidecar call forwarding | [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md), [Communication Flow](../architecture/communication_flow.md) |
| `frontend/src/preload.js` | Isolated renderer API exposure and channel allowlist | [Frontend Preload Hub](../frontend/preload/README.md), [Security Boundary Matrix](../security/security_boundary_matrix.md) |
| `frontend/src/main/platform` | OS-specific content protection, screenshot visibility, permissions, window/input adapters | [Platforms Hub](../platforms/README.md), [Platform Change Workflow](../platforms/platform_change_workflow.md), [Window and Input Matrix](../platforms/window_input_matrix.md) |
| `frontend/src/renderer/features/chat` | Minimal pill, response overlay, chat session UI, chat policies and stores | [Desktop Surfaces](../desktop/README.md), [Minimal Chat Pill](../desktop/minimal_chat_pill.md) |
| `frontend/src/renderer/features/dashboard` | Dashboard shell, history, settings access, memory and model panels | [Dashboard](../desktop/dashboard.md), [Frontend Renderer Hub](../frontend/renderer/README.md) |
| `frontend/src/renderer/features/onboarding` and `frontend/src/renderer/features/permissions` | First-run gates, permission UI, permission state display | [Onboarding and Permissions](../desktop/onboarding_permissions.md), [Platform Permission Matrix](../platforms/permission_matrix.md) |
| `frontend/src/renderer/features/voice` | Voice state UI, wakeword status, dictation and playback controls | [Voice Audio Change Workflow](../channels/voice_audio_change_workflow.md), [Voice and Wakeword](../desktop/voice_and_wakeword.md), [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| `frontend/src/renderer/infrastructure/api` | Backend endpoint clients and websocket transport helpers | [Web Client Integration](../web/web_client_integration.md), [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md) |
| `frontend/src/renderer/infrastructure/services/toolExecution` | Renderer-side tool call dispatch and result relay | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md) |
| `frontend/src/renderer/infrastructure/transcript` | Transcript persistence, replay, pending message queues | [Transcript and Replay](../memory/transcript_and_replay.md), [Session and Transcript Reference](session_and_transcript_reference.md) |
| `frontend/src/main/python/tools` | Local executable tool implementations | [Frontend Sidecar Tools Hub](../frontend/sidecar/tools/README.md), [Tools Hub](../tools/README.md) |
| `frontend/src/main/python/memory` | Sidecar local memory storage and retrieval | [Sidecar Local Memory](../memory/sidecar_local_memory.md), [Memory Troubleshooting](../memory/memory_troubleshooting.md) |
| `frontend/src/landing` | Public landing page implementation | [Landing Page](../web/landing_page.md), [Web Surfaces](../web/README.md) |

## Test Selection

| Changed surface | Minimum focused validation |
| --- | --- |
| Backend agent, tools, providers, routes, SDK, OCR/vision, memory, or runs | `./scripts/test-backend` or narrower `./scripts/python-in-env backend pytest ...` |
| Sidecar local tools, browser, shell/filesystem/computer/system, or local memory | `./scripts/test-sidecar` or narrower `./scripts/python-in-env sidecar pytest ...` |
| Renderer UI, stores, websocket clients, transcript, settings, voice, permissions, or landing | `cd frontend && npm run test -- <pattern>` or `cd frontend && npm run test:ci` |
| IPC, preload, tool execution, screenshot/overlay, or endpoint forwarding | Add both frontend tests and a boundary smoke/manual check when the behavior depends on Electron runtime |
| Docs-only changes | `./bin/docs-list`, `git diff --check`, and focused Markdown link checks for touched files |
| Cross-runtime contracts | Validate producer and consumer tests; add a contract doc update in the same commit |

## Change Checklist

1. Run `./bin/docs-list` and read the nearest `read_when` matches.
2. Use the fast routing table to choose the owner.
3. Inspect the owner code root and its immediate tests before editing.
4. Identify every consumer runtime that depends on the changed contract.
5. Update source, tests, docs, and changelog together.
6. Validate the narrowest useful backend, sidecar, frontend, and docs checks.
7. Commit with a Conventional Commit subject that names the area.

## Related References

- [Documentation Hub](../getting-started/docs_hub.md)
- [Change Ownership Decision Tree](../architecture/change_ownership_decision_tree.md)
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md)
- [Data Flow and State Ownership](../architecture/data_flow_and_state_ownership.md)
- [Test Failure Triage](../development/test_failure_triage.md)
- [Review and Risk Checklist](../development/review_and_risk_checklist.md)
