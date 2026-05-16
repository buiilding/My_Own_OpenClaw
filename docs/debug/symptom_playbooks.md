---
summary: "Symptom-based debug playbooks mapping WindieOS failures to owner modules, docs, and validation commands."
read_when:
  - When a bug report names a symptom rather than a subsystem.
  - When deciding where an agent should inspect or modify code for a failure.
title: "Symptom Playbooks"
---

# Symptom Playbooks

Use these playbooks to avoid editing the wrong layer.

## No Backend Response

Likely boundary: SDK runtime adapter, Electron main query preparation, or hosted backend websocket.

Inspect:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/windie_sdk_runtime.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/services/query_execution.py`

Docs:

- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Agent Loop](../concepts/agent_loop.md)
- [Backend API Docs Hub](../backend/api/README.md)

Validate:

```bash
./scripts/test-backend tests/backend/test_websocket_route.py tests/backend/test_websocket_task_manager.py -q
cd frontend && npm run test:ci -- IpcQueryRuntime.test.cjs IpcSettingsSync.test.cjs
```

## Model Or Provider Missing

Likely boundary: backend provider registration, model catalog, credentials, or frontend settings reconciliation.

Inspect:

- `backend/src/llm/providers/__init__.py`
- `backend/src/llm/models/models_config.py`
- `backend/src/llm/models/model_service.py`
- `backend/src/core/config/loader.py`
- `frontend/src/renderer/features/dashboard/components/ModelsSection.jsx`

Docs:

- [Providers Hub](../providers/README.md)
- [Models and LLM Providers](../providers/models.md)
- [Provider Credentials](../providers/credentials.md)

Validate:

```bash
./scripts/test-backend tests/backend/test_model_service.py tests/backend/test_models_config.py tests/backend/test_provider_factory_helpers.py -q
cd frontend && npm run test:ci -- ModelSelectionUtils.test.js ModelsSection.test.jsx
```

## Tool Call Appears But Does Not Execute

Likely boundary: backend tool event, SDK runtime tool router, Electron main bridge, or sidecar registry.

Inspect:

- `backend/src/tools/tool_catalog.py`
- `backend/src/agent/tools`
- `packages/windie-sdk-js/src/runtime`
- `frontend/src/main/windie_sdk_runtime.cjs`
- `frontend/src/main/ipc/ipc_sdk_tool_router.cjs`
- `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`
- `frontend/src/main/python/tools/registry.py`

Docs:

- [Tool Contracts](../tools/tool_contracts.md)
- [Tools Hub](../tools/README.md)
- [Runtime Traces](runtime_traces.md)

Validate:

```bash
./scripts/test-backend tests/backend/test_remote_tool_contract.py tests/backend/test_tool_result_handler.py -q
cd frontend && npm run test:ci -- WindieSdkConversationRuntime.test.ts IpcSdkToolRouter.test.cjs RendererToolResultBoundary.test.ts
./scripts/test-sidecar tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_result.py -q
```

## Screenshot Or Coordinate Grounding Wrong

Likely boundary: overlay visibility, screenshot capture, OCR/vision provider, coordinate scaling, or artifact replay.

Inspect:

- `frontend/src/main/surface_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs`
- `frontend/src/main/python/tools/computer/screenshot_tool.py`
- `backend/src/services/ocr`
- `backend/src/services/vision`
- `backend/src/tools/coordinate_resolution`

Docs:

- [Computer Tools](../tools/computer.md)
- [Artifacts and Attachments](../desktop/artifacts_and_attachments.md)
- [OCR and Vision SDK](../sdk/ocr_and_vision.md)
- [Linux Platform Guide](../platforms/linux.md)

Validate:

```bash
./scripts/test-backend tests/backend/test_coordinate_scaling.py tests/backend/test_ocr_coordinate_resolver.py tests/backend/test_vision_coordinates.py -q
cd frontend && npm run test:ci -- SurfaceOrchestratorCaptureLifecycle.test.ts QueryScreenshotPipeline.test.ts ScreenshotAttachmentPipeline.test.ts
./scripts/test-sidecar tests/sidecar/test_screenshot_tool.py -q
```

## Minimal Chat Pill Flickers Or Sticks

Likely boundary: response overlay phase, window visibility, capture focus, or renderer awaiting latch.

Inspect:

- `frontend/src/shared/response_overlay_phase_contract.json`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/surface_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`

Docs:

- [Minimal Chat Pill](../desktop/minimal_chat_pill.md)
- [Response Overlay](../desktop/response_overlay.md)
- [Runtime Traces](runtime_traces.md)

Validate:

```bash
cd frontend && npm run test:ci -- OverlayPhaseContractParity.test.js ResponseOverlayPhaseContract.test.js UseResponseOverlayPhase.test.jsx ChatBoxPillLayout.test.js SurfaceOrchestratorPhases.test.ts
```

## Permissions Gate Does Not Match OS State

Likely boundary: Electron permission service, OS probe, renderer onboarding state, or stored permission state.

Inspect:

- `frontend/src/shared/permissions/permission_manifest.json`
- `frontend/src/main/permission_service.cjs`
- `frontend/src/main/permission_service_screen_capture.cjs`
- `frontend/src/main/permission_service_input_control.cjs`
- `frontend/src/main/permission_service_microphone.cjs`
- `frontend/src/main/permission_service_browser.cjs`
- `frontend/src/renderer/features/permissions`
- `frontend/src/renderer/features/onboarding`

Docs:

- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Safety Boundaries](../concepts/safety_boundaries.md)
- [macOS Platform Guide](../platforms/macos.md)

Validate:

```bash
cd frontend && npm run test:ci -- PermissionService.test.cjs PermissionIpcRuntime.test.cjs AppPermissionGate.test.jsx useOnboardingPermissionActions.test.jsx
```

## Voice Or Wakeword Does Not Trigger

Likely boundary: renderer microphone flow, Electron wakeword bridge, sidecar wakeword service, or backend transcription websocket.

Inspect:

- `frontend/src/renderer/features/voice`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/wakeword_supervisor.cjs`
- `frontend/src/main/python/wakeword_service.py`
- `backend/src/api/routes/transcription/router.py`
- `backend/src/api/services/transcription`

Docs:

- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Validate:

```bash
cd frontend && npm run test:ci -- WakewordBridge.test.cjs WakewordSupervisor.test.cjs VoiceModeHook.test.ts TranscriptionHook.test.ts
./scripts/test-backend tests/backend/test_transcription_gateway.py tests/backend/test_openai_realtime_transcription.py -q
./scripts/test-sidecar tests/sidecar/test_wakeword_service.py -q
```

## Browser Automation Fails

Likely boundary: backend schema, sidecar browser controller, Chromium runtime availability, page/session state, or permission probe.

Inspect:

- `backend/src/tools/tool_catalog.py`
- `backend/src/tools/remote.py`
- `frontend/src/main/python/tools/browser/controller.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/permission_service_browser.cjs`

Docs:

- [Browser Tool](../tools/browser.md)
- [Browser Control](../browser/browser_control.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)

Validate:

```bash
./scripts/test-backend tests/backend/test_browser_remote_tool.py -q
./scripts/test-sidecar tests/sidecar/test_browser_registry.py tests/sidecar/test_browser_runtime_architecture.py -q
cd frontend && npm run test:ci -- ChatBrowserSessionControl.test.jsx PermissionService.test.cjs
```
