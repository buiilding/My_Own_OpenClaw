---
summary: "Focused test-selection guide mapping WindieOS code areas to pytest and Jest commands."
read_when:
  - When choosing tests for a backend, frontend, sidecar, SDK, provider, tool, or overlay change.
  - When updating docs or code and deciding whether full suites are necessary.
title: "Test Selection"
---

# Test Selection

Use focused tests while iterating, then run the broad suite for the touched runtime when the change crosses contracts or shared state.

## Baseline Commands

```bash
bin/windie test backend
bin/windie test sidecar
bin/windie test frontend
cd frontend && npm run lint
```

`bin/windie test backend` and `bin/windie test sidecar` use
`scripts/python-in-env`, so do not manually activate conda environments. Use
`bin/windie test pick <area>` to find common focused validation commands.

## By Runtime

| Change area | Focused validation |
| --- | --- |
| Backend websocket/API | `bin/windie test backend -- tests/backend/test_websocket_route.py tests/backend/test_api_handlers.py -q` |
| Backend agent loop | `bin/windie test backend -- tests/backend/test_interaction_loop.py tests/backend/test_query_execution_pipeline_events.py -q` |
| Backend providers/models | `bin/windie test backend -- tests/backend/test_model_service.py tests/backend/test_models_config.py tests/backend/test_provider_factory_helpers.py -q` |
| Backend tool schemas | `bin/windie test backend -- tests/backend/test_remote_tool_contract.py tests/backend/test_tool_registry_schema.py -q` |
| Backend OCR/vision | `bin/windie test backend -- tests/backend/test_ocr_service.py tests/backend/test_vision_service.py tests/backend/test_coordinate_scaling.py -q` |
| Backend SDK routes | `bin/windie test backend -- tests/backend/test_sdk_routes.py tests/backend/test_sdk_helpers.py -q` |
| Electron main IPC | `cd frontend && npm run test:ci -- IpcMainBridge.query.test.cjs IpcQueryRuntime.test.cjs PreloadIpcChannels.test.cjs` |
| Overlay windows/phases | `cd frontend && npm run test:ci -- OverlayPhaseContractParity.test.js ResponseOverlayPhaseHandler.test.cjs SurfaceOrchestratorPhases.test.ts WindowVisibilityRuntime.test.cjs` |
| Renderer chat stream | `cd frontend && npm run test:ci -- DesktopChatStreamEventRuntime.test.ts ChatStreamMessageUpdates.test.ts DesktopChatStreamTurnGuardRuntime.test.ts ChatMessageSender.test.tsx` |
| Renderer dashboard/settings | `cd frontend && npm run test:ci -- ChatGptDashboardShell.test.jsx DashboardSidebar.test.jsx ModelsSection.test.jsx SettingsSection.test.jsx` |
| Permissions/onboarding | `cd frontend && npm run test:ci -- PermissionService.test.cjs PermissionIpcRuntime.test.cjs AppPermissionGate.test.jsx FrontendOnboardingSlideshow.test.jsx` |
| Artifacts/screenshots | `cd frontend && npm run test:ci -- ArtifactUploader.test.ts ScreenshotAttachmentPipeline.test.ts IpcArtifactFetch.test.cjs QueryScreenshotPipeline.test.ts` |
| Voice/wakeword | `cd frontend && npm run test:ci -- WakewordBridge.test.cjs WakewordSupervisor.test.cjs VoiceModeHook.test.ts TranscriptionHook.test.ts` |
| Sidecar protocol/tools | `bin/windie test sidecar -- tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_result.py -q` |
| Sidecar filesystem/shell | `bin/windie test sidecar -- tests/sidecar/test_read_file_tool.py tests/sidecar/test_replace_tool.py tests/sidecar/test_shell_process_tool.py -q` |
| Sidecar browser | `bin/windie test sidecar -- tests/sidecar/test_browser_registry.py tests/sidecar/test_browser_runtime_architecture.py -q` |
| Sidecar memory | `bin/windie test sidecar -- tests/sidecar/test_local_backend.py tests/sidecar/test_memory_operations.py tests/sidecar/test_conversation_search.py -q` |

## Contract Changes

Run tests on both sides of the boundary when a payload crosses processes.

| Contract | Run |
| --- | --- |
| Backend model-facing tool schema and frontend executable tools | `bin/windie test backend -- tests/backend/test_remote_tool_contract.py -q` plus `bin/windie test sidecar -- tests/sidecar/test_shared_tool_schema_parity.py -q` |
| Tool result envelope | `bin/windie test backend -- tests/backend/test_incoming_tool_result_schemas.py -q` plus `bin/windie test frontend -- ToolResultEnvelope.test.ts ToolResultContractParity.test.ts` |
| Response overlay phase names | `cd frontend && npm run test:ci -- OverlayPhaseContractParity.test.js ResponseOverlayPhaseContract.test.js IpcOverlayPhaseContract.test.cjs` |
| Transcript/replay payloads | `cd frontend && npm run test:ci -- DesktopTranscriptProjectionRuntimeClient.test.ts DesktopConversationContinuityService.test.ts DesktopConversationStore.test.ts` |
| Artifact refs and URLs | `bin/windie test backend -- tests/backend/test_artifact_routes.py tests/backend/test_artifacts_store.py -q` plus `bin/windie test frontend -- ArtifactUploader.test.ts IpcArtifactFetch.test.cjs` |
| SDK HTTP/trace helpers | `bin/windie test backend -- tests/backend/test_sdk_routes.py -q` plus `bin/windie test frontend -- WindieSdkClient.test.ts WindieSdkClientExports.test.ts` |

## When To Run Full Suites

Run the full suite for a runtime when:

- A shared contract file changed.
- A store, provider, or service factory changed.
- The patch changes lifecycle timing or cleanup.
- The patch fixes a regression that could reappear in multiple surfaces.
- A test helper changed.

Run all three broad suites when the change crosses backend, Electron main/renderer, and sidecar behavior in one patch.

## Docs-Only Changes

For docs-only edits:

```bash
bin/windie docs list
git diff --check
```

Also run a local markdown link check for edited files when adding or moving docs sections. If docs describe code ownership, verify the referenced files exist with `rg --files` or `find` before committing.
